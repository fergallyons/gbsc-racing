// ═══════════════════════════════════════════════════════════════
// SUPABASE
// ═══════════════════════════════════════════════════════════════
const SB_URL='https://esqjcmwfnzkolwxfbcro.supabase.co';
const SB_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcWpjbXdmbnprb2x3eGZiY3JvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MjE4MDgsImV4cCI6MjA4OTQ5NzgwOH0.FCNEwXrayFMuzwMlHBX6iWESoVFi63-1IKhzgoQTx2U';
const SBH={'Content-Type':'application/json','apikey':SB_KEY,'Authorization':'Bearer '+SB_KEY};
async function sbFetch(path,opts={}){
  try{
    const r=await fetch(SB_URL+path,{headers:SBH,...opts});
    if(!r.ok){
      const err=await r.text();
      console.error('SB error',r.status,path,err);
      return {_err:'HTTP '+r.status+': '+err, _status:r.status};
    }
    if(r.status===204)return true;
    const t=await r.text();return t?JSON.parse(t):[];
  }catch(e){console.error('SB net',e);return null;}
}
async function sbEnsureBoat(b){
  // Upsert the boat — ignore duplicates so we don't overwrite existing config
  return sbFetch('/rest/v1/boats',{method:'POST',
    headers:{...SBH,'Prefer':'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({id:b.id,name:b.name,icon:b.icon})});
}
async function sbLoadBoatConfig(id){
  // Returns {pin, revolut_user, stripe_link} or null if offline
  const r=await sbFetch('/rest/v1/boats?id=eq.'+id+'&select=pin,revolut_user,stripe_link');
  if(!r||!r.length) return null;
  return r[0];
}
async function sbSaveBoatConfig(id,fields){
  // fields: any subset of {pin, revolut_user, stripe_link}
  return sbFetch('/rest/v1/boats?id=eq.'+id,{
    method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify(fields)
  });
}
async function sbLoadCrew(id){const r=await sbFetch('/rest/v1/crew?boat_id=eq.'+id+'&order=id.asc');if(r===null)return null;if(!r.length)return[];return r.map(x=>({id:x.id,first:x.first,last:x.last,type:x.type,joinYear:x.join_year,outings:x.outings,selected:false,paid:false}));}
async function sbUpsertCrew(bid,p){return sbFetch('/rest/v1/crew?on_conflict=id',{method:'POST',headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:p.id,boat_id:bid,first:p.first,last:p.last,type:p.type,join_year:p.joinYear||null,outings:p.outings||0})});}
async function sbDeleteCrew(id){return sbFetch('/rest/v1/crew?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});}
async function sbSaveRaceRecord(rec){return sbFetch('/rest/v1/race_records',{method:'POST',headers:{...SBH,'Prefer':'return=minimal'},body:JSON.stringify(rec)});}
async function sbLoadRaceRecords(raceName){
  const r=await sbFetch('/rest/v1/race_records?race_name=eq.'+encodeURIComponent(raceName)+'&order=submitted_at.asc');
  return r||[];
}
async function sbRegisterBoat(boatId,race){
  const key=raceKey(race);
  try{
    const r=await fetch(SB_URL+'/rest/v1/registrations?on_conflict=boat_id,race_key',{
      method:'POST',
      headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({boat_id:boatId,race_key:key,race_name:race.label,race_date:race.date.toISOString().split('T')[0],registered_at:new Date().toISOString()})
    });
    if(!r.ok){
      const txt=await r.text();
      console.error('sbRegisterBoat failed',r.status,txt);
      toast('⚠ DB '+r.status+': '+txt.slice(0,120));
      return false;
    }
    return true;
  }catch(e){
    console.error('sbRegisterBoat net',e);
    toast('⚠ Network error — check connection');
    return false;
  }
}
async function sbUnregisterBoat(boatId,race){
  const key=raceKey(race);
  try{
    const r=await fetch(SB_URL+'/rest/v1/registrations?boat_id=eq.'+boatId+'&race_key=eq.'+key,{
      method:'DELETE',
      headers:{...SBH,'Prefer':'return=minimal'}
    });
    if(!r.ok){ const txt=await r.text(); console.error('sbUnregisterBoat',r.status,txt); return null; }
    return true;
  }catch(e){ return null; }
}
async function sbLoadRegistrations(race){
  const key=raceKey(race);
  try{
    const r=await fetch(SB_URL+'/rest/v1/registrations?race_key=eq.'+key,{headers:SBH});
    if(!r.ok){ return []; }
    const t=await r.text(); return t?JSON.parse(t):[];
  }catch(e){ return []; }
}
async function sbSaveCourse(course){
  // marks is [{id,rounding}] — must be sent as jsonb
  const payload={
    id: course.id,
    name: course.name,
    marks: course.marks,           // Supabase REST auto-serialises JS arrays/objects to jsonb
    wind_deg: course.windDeg,
    wind_dir: course.windDir,
    race_name: course.race_name||'',
    published_at: course.published_at
  };
  try{
    const r=await fetch(SB_URL+'/rest/v1/published_courses',{
      method:'POST',
      headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal','Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    if(!r.ok){
      const txt=await r.text();
      console.error('sbSaveCourse failed',r.status,txt);
      toast('⚠ DB error: '+r.status+' — '+txt.slice(0,80));
      return false;
    }
    return true;
  }catch(e){
    console.error('sbSaveCourse net error',e);
    toast('⚠ Network error saving course');
    return false;
  }
}
async function sbLoadCourse(){
  const r=await sbFetch('/rest/v1/published_courses?order=published_at.desc&limit=1');
  if(!r||!r.length) return null;
  const row=r[0];
  // Normalise: marks may come back as a jsonb array or a JSON string
  let marks=row.marks||[];
  if(typeof marks==='string'){try{marks=JSON.parse(marks);}catch(e){marks=[];}}
  return{
    id: row.id,
    name: row.name,
    marks,
    windDeg: row.wind_deg,
    windDir: row.wind_dir,
    race_name: row.race_name,
    published_at: row.published_at
  };
}
function setSyncStatus(s){const el=document.getElementById('syncStatus');if(!el)return;if(s==='syncing'){el.textContent='⏳';el.style.color='var(--gold)';}else if(s==='ok'){el.textContent='☁';el.style.color='var(--success)';setTimeout(()=>{el.textContent='';},3000);}else{el.textContent='⚠';el.style.color='var(--warn)';}}

// ═══════════════════════════════════════════════════════════════
// MARKS DATA  (from GBSC Sailing Instructions 2026, Appendix A)
// ═══════════════════════════════════════════════════════════════
const MARKS = [
  {id:'BR', name:'Black Rock',         lat:53+(14.001/60), lng:-(9+(6.547/60)),  colour:'#e63946', desc:'Channel Red'},
  {id:'C',  name:'Cockle',             lat:53+(14.537/60), lng:-(9+(1.886/60)),  colour:'#f4a261', desc:'Club Orange'},
  {id:'D',  name:'Dillisk',            lat:53+(14.665/60), lng:-(8+(59.991/60)), colour:'#f4a261', desc:'Club Orange'},
  {id:'K',  name:'Kilcolgan Pt',       lat:53+(13.320/60), lng:-(9+(3.850/60)),  colour:'#f4a261', desc:'Club Orange'},
  {id:'L',  name:'Leverets',           lat:53+(15.333/60), lng:-(9+(1.890/60)),  colour:'#f0f4f8', desc:'Lighthouse B/W'},
  {id:'MN', name:'Mutton New',         lat:53+(15.179/60), lng:-(9+(2.500/60)),  colour:'#e63946', desc:'Channel Red'},
  {id:'O',  name:'Oranmore',           lat:53+(15.429/60), lng:-(8+(59.203/60)), colour:'#f4a261', desc:'Club Orange'},
  {id:'OF', name:'Mutton Outfall',        lat:53+(14.962/60), lng:-(9+(3.308/60)),  colour:'#f4b942', desc:'Warning Yellow'},
  {id:'S',  name:'Salthill',           lat:53+(14.873/60), lng:-(9+(5.447/60)),  colour:'#f4a261', desc:'Club Orange'},
  {id:'T',  name:'Tawin',              lat:53+(14.301/60), lng:-(9+(4.259/60)),  colour:'#2dc653', desc:'Channel Green'},
  {id:'TR', name:'Trout',              lat:53+(15.026/60), lng:-(9+(1.109/60)),  colour:'#f4a261', desc:'Club Orange'},
  {id:'WM', name:'W. Margaretta',      lat:53+(13.673/60), lng:-(9+(5.978/60)),  colour:'#2dc653', desc:'Channel Green'},
];
// Club start line — 53°14.5687'N, 008°58.6148'W
const START_POS = {lat:53+(14.5687/60), lng:-(8+(58.6148/60))};

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════════
const FEES={full:4,crew:4,visitor:10,student:5,kid:0};
const VISITOR_MAX=6; const CREW_MAX_YRS=2; const CY=new Date().getFullYear();
const RO_PIN='2026';

let boats=[], currentBoat=null, isRO=false;
let roster=[], allRaces=[], selectedRace=null, nextRace=null;
let editingId=null, pnId=null, pnMethod=null;
let windDeg=225;
let courseMarks=[];
let publishedCourse=null;
let registeredBoatIds=new Set(); // boat IDs registered for the next race

// ═══════════════════════════════════════════════════════════════
// RACE SCHEDULE DATA  (must be before buildAllRaces)
// ═══════════════════════════════════════════════════════════════
const WED=[
  {name:"McSwiggans Series",d:["Apr 8","Apr 15","Apr 22","Apr 29"]},
  {name:"Grealy Stores Series",d:["May 6","May 13","May 20","May 27"]},
  {name:"Seahorse Series",d:["Jun 3","Jun 10","Jun 17","Jun 24","Jul 1"]},
  {name:"Aquabroker Series",d:["Jul 8","Jul 15","Jul 22","Jul 29"]},
  {name:"GM Series",d:["Aug 5","Aug 12","Aug 19","Aug 26"]},
  {name:"O'Tuairisg Series",d:["Sep 2","Sep 9","Sep 16","Sep 23","Sep 30"]},
];
const KOTB=["King of the Bay: Spring Cup|May 2, 2026","King of the Bay: Barna|May 16, 2026","King of the Bay: Ballyvaughan|May 30, 2026","King of the Bay: Aran Cup|Jun 19, 2026","King of the Bay: Kinvara|Aug 15, 2026","King of the Bay: Clarinbridge Cup|Aug 29, 2026","King of the Bay: Morans|Sep 12, 2026","King of the Bay: Oyster Festival|Sep 26, 2026"];

function buildAllRaces(){
  allRaces=[];
  WED.forEach(s=>s.d.forEach(d=>allRaces.push({label:s.name+' — Wed '+d,date:new Date(d+' 2026'),g:'w'})));
  KOTB.forEach(r=>{const[n,d]=r.split('|');allRaces.push({label:n,date:new Date(d),g:'k'});});
  allRaces.push({label:'Expert Forklifts October Series',date:new Date('Oct 7, 2026'),g:'o'});
  allRaces.sort((a,b)=>a.date-b.date);
}
function getNextRace(){
  // Returns the next race — prefer within 48hrs, otherwise the next future one
  const now=new Date();
  const upcoming=allRaces.filter(r=>r.date>=new Date(now-48*60*60*1000));
  if(!upcoming.length) return allRaces[allRaces.length-1];
  // Within 48hrs ahead
  const soon=upcoming.filter(r=>r.date-now<=48*60*60*1000);
  return soon.length?soon[0]:upcoming[0];
}
function raceKey(r){
  // Stable string key for a race — used as registration identifier
  return r.date.toISOString().split('T')[0]+'_'+r.label.replace(/[^a-z0-9]/gi,'').toLowerCase().slice(0,20);
}

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE
// ═══════════════════════════════════════════════════════════════
function saveRoster(){
  // No-op — Supabase is the source of truth for crew.
  // localStorage is only used as a read-only offline cache written on load.
}
function loadRoster(id){try{const r=localStorage.getItem('gr_'+id);return r?JSON.parse(r).map(p=>({...p,selected:false,paid:false})):null;}catch(e){return null;}}
function cacheRosterLocally(id,r){try{localStorage.setItem('gr_'+id,JSON.stringify(r.map(p=>({...p,selected:false,paid:false}))));}catch(e){}}
function loadCustom(){try{return JSON.parse(localStorage.getItem('gr_custom')||'[]');}catch(e){return[];}}
function saveCustom(a){try{localStorage.setItem('gr_custom',JSON.stringify(a));}catch(e){}}
// Global ID high-water mark — ensures nextId never reuses an ID across boats or sessions
function newCrewId(){
  // Generate a UUID v4 — works in all modern browsers
  if(crypto&&crypto.randomUUID) return crypto.randomUUID();
  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{
    const r=Math.random()*16|0;return(c==='x'?r:(r&0x3|0x8)).toString(16);
  });
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
async function buildBoatGrid(){
  buildAllRaces();
  nextRace=getNextRace();

  // Show next race label
  const raceEl=document.getElementById('loginRaceLabel');
  if(raceEl) raceEl.textContent='Next race: '+nextRace.label+' · '+nextRace.date.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'});
  showSponsor(nextRace.label);

  // Show loading state
  const g=document.getElementById('boatGrid');
  if(g) g.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:.82rem;padding:16px">Loading boats…</div>';

  // Load all boats from Supabase
  const sbBoats=await sbFetch('/rest/v1/boats?order=name.asc');
  if(sbBoats&&sbBoats.length){
    boats=sbBoats.map(b=>({id:b.id,name:b.name,icon:b.icon||'⛵'}));
  } else {
    // Offline — fall back to localStorage cache
    boats=loadCustom();
    if(!boats.length&&g){
      g.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-size:.82rem;padding:16px">⚠ Could not load boats — check connection</div>';
      return;
    }
  }

  // Cache to localStorage for offline fallback
  saveCustom(boats);

  renderBoatGrid();

  // Load registration badges in background
  sbLoadRegistrations(nextRace).then(regs=>{
    registeredBoatIds=new Set((regs||[]).map(r=>r.boat_id));
    renderBoatGrid();
  }).catch(()=>{});
}

function renderBoatGrid(){
  const g=document.getElementById('boatGrid'); if(!g)return;
  g.innerHTML='';
  boats.forEach(b=>{
    const isReg=registeredBoatIds.has(b.id);
    const el=document.createElement('div');
    el.className='boat-btn'+(isReg?' reg':''); el.id='bb-'+b.id;
    el.innerHTML=
      '<div style="position:relative;display:inline-block">'+
        (isReg?'<div class="reg-pip" title="Registered">✓</div>':'')+
      '</div>'+
      '<div class="boat-btn-name">'+b.name+'</div>'+
      (isReg?'<div class="boat-btn-reg-label">Registered</div>':'');
    el.onclick=()=>loginAs(b.id);
    g.appendChild(el);
  });
}
async function registerForRace(){
  if(!currentBoat||!selectedRace)return;
  const isReg=registeredBoatIds.has(currentBoat.id);
  const btn=document.getElementById('registerBtn');
  if(isReg){
    // Unregister
    if(!confirm('Remove '+currentBoat.name+' from the start list?'))return;
    btn.textContent='⏳ Updating…'; btn.disabled=true;
    const ok=await sbUnregisterBoat(currentBoat.id,selectedRace);
    if(ok!==null){
      registeredBoatIds.delete(currentBoat.id);
      toast('Registration withdrawn');
    } else { toast('⚠ Could not update — try again'); }
  } else {
    // Register
    btn.textContent='⏳ Registering…'; btn.disabled=true;
    const ok=await sbRegisterBoat(currentBoat.id,selectedRace);
    if(ok){
      registeredBoatIds.add(currentBoat.id);
      toast('✅ '+currentBoat.name+' registered for '+selectedRace.label+'!');
    } else { toast('⚠ Could not register — try again'); }
  }
  updateRegisterButton();
}
function updateRegisterButton(){
  const btn=document.getElementById('registerBtn'); if(!btn)return;
  const isReg=registeredBoatIds.has(currentBoat?.id);
  btn.disabled=false;
  btn.className='btn '+(isReg?'btn-ghost':'btn-primary');
  btn.style.width='100%'; btn.style.padding='12px';
  btn.textContent=isReg?'✓ Registered — Withdraw':'⛵ Register for This Race';
  if(isReg){btn.style.color='var(--success)';btn.style.borderColor='rgba(45,198,83,.4)';}
  else{btn.style.color='';btn.style.borderColor='';}
}
function loginAs(id){
  const b=boats.find(x=>x.id===id); if(!b)return;
  document.querySelectorAll('.boat-btn').forEach(e=>e.classList.remove('active'));
  const btn=document.getElementById('bb-'+id); if(btn)btn.classList.add('active');
  openPinOverlay(id);
}
async function enterApp(b,ro){
  currentBoat=b; isRO=ro;
  try{localStorage.setItem('gr_last',b.id);}catch(e){}
  document.getElementById('loginScreen').style.display='none';
  document.getElementById('mainApp').style.display='block';
  document.getElementById('navTabs').style.display='flex';
  document.getElementById('headerBoat').textContent=ro?'Race Officer':b.name;
  document.getElementById('changePinBtn').style.display=ro?'none':'flex';
  if(ro){
    document.getElementById('boatTag').style.background='rgba(232,160,32,.1)';
    document.getElementById('boatTag').style.borderColor='rgba(232,160,32,.4)';
    document.getElementById('headerBoat').style.color='var(--ro)';
    document.getElementById('roNavTab').style.display='block';
    document.getElementById('feesNavTab').style.display='none';
    // Land directly on RO tab
    const roBtn=document.getElementById('roNavTab');
    showTab('roTab', roBtn);
    buildMarksGrid();
    loadAndDrawCourse();
    loadRegistrations();
    buildPinMgmtList();
    return;
  }
  document.getElementById('crewList').innerHTML='<div class="empty-state"><div class="icon">⏳</div>Loading…</div>';
  setSyncStatus('syncing');
  await sbEnsureBoat(b);
  await loadBoatConfig(b.id);
  // Load crew
  const sbCrew=await sbLoadCrew(b.id);
  if(sbCrew!==null){
    roster=sbCrew; // always use DB data — empty or not
    cacheRosterLocally(b.id, roster); // write to localStorage as offline cache
    setSyncStatus('ok');
  } else {
    // Offline — use local cache, show warning
    roster=loadRoster(b.id)||[];
    setSyncStatus('offline');toast('⚠ Offline — using local data');
  }

  buildRaceDropdown();
  // Refresh registration state for this boat
  updateRegisterButton();
  loadAndDrawCourse();
  renderCrew();
}
function switchBoat(){
  currentBoat=null;roster=[];isRO=false;boatConfig={};
  halResultsLoaded=false;
  document.getElementById('loginScreen').style.display='flex';
  document.getElementById('mainApp').style.display='none';
  document.getElementById('navTabs').style.display='none';
  document.getElementById('roNavTab').style.display='none';
  document.getElementById('feesNavTab').style.display='block'; // restore for next login
  document.getElementById('boatTag').removeAttribute('style');
  document.getElementById('headerBoat').removeAttribute('style');
  showTab('feesTab',document.getElementById('feesNavTab'));
  buildBoatGrid();
}
// add boat
function showAddBoatForm(){document.getElementById('addBoatForm').style.display='block';document.getElementById('addBoatBtn').style.display='none';document.getElementById('newBoatName').focus();}
function hideAddBoatForm(){document.getElementById('addBoatForm').style.display='none';document.getElementById('addBoatBtn').style.display='block';document.getElementById('newBoatName').value='';}
function submitAddBoat(){
  const name=document.getElementById('newBoatName').value.trim();
  const icon='⛵'; // default, no longer user-selectable
  if(!name){toast('Enter a boat name');return;}
  const id=name.toLowerCase().replace(/[^a-z0-9]/g,'')||'boat'+Date.now();
  if(boats.find(b=>b.id===id)){toast('Boat already exists');return;}
  const nb={id,name,icon};
  boats.push(nb);
  const c=loadCustom();c.push(nb);saveCustom(c);
  // Also persist to Supabase so it appears on other devices
  sbFetch('/rest/v1/boats',{method:'POST',
    headers:{...SBH,'Prefer':'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({id,name,icon,pin:'0000',revolut_user:'',stripe_link:''})
  });
  hideAddBoatForm();
  renderBoatGrid();
  setTimeout(()=>loginAs(id),80);
}

// ═══════════════════════════════════════════════════════════════
// PIN SYSTEM
// ═══════════════════════════════════════════════════════════════
// PIN SYSTEM — see getBoatPin/setBoatPin/getRoPin/setRoPin below
// ═══════════════════════════════════════════════════════════════

let pinEntry='', pinContext=null; // context: 'ro' | {boatId}
function openPinOverlay(ctx){
  pinEntry=''; pinContext=ctx;
  updatePinDots();
  document.getElementById('pinError').textContent='';
  const isRO=ctx==='ro';
  const box=document.getElementById('pinBox');
  box.style.setProperty('--pin-accent', isRO?'var(--ro)':'var(--teal)');
  document.getElementById('pinTitle').style.color=isRO?'var(--ro)':'var(--teal)';
  if(isRO){
    document.getElementById('pinTitle').textContent='🎌 Race Officer';
    document.getElementById('pinSubtitle').textContent='Enter the Race Officer PIN';
    document.getElementById('pinChangeLink').style.display='none';
  } else {
    const b=boats.find(x=>x.id===ctx);
    document.getElementById('pinTitle').textContent=(b?b.icon+' '+b.name:'Boat');
    document.getElementById('pinSubtitle').textContent='Enter your 4-digit PIN';
    document.getElementById('pinChangeLink').style.display='block';
  }
  document.getElementById('pinOverlay').classList.add('open');
}
function closePinOverlay(){ document.getElementById('pinOverlay').classList.remove('open'); pinContext=null; }
function pinKey(k){ if(pinEntry.length>=4)return; pinEntry+=k; updatePinDots(); if(pinEntry.length===4)checkPin(); }
function pinBack(){ pinEntry=pinEntry.slice(0,-1); updatePinDots(); }
function pinClear(){ pinEntry=''; updatePinDots(); }
function updatePinDots(){ for(let i=0;i<4;i++) document.getElementById('pd'+i).classList.toggle('filled',i<pinEntry.length); }
function checkPin(){
  const ctx=pinContext; // save before closePinOverlay nulls it
  const correct = ctx==='ro' ? getRoPin() : getBoatPin(ctx);
  if(pinEntry===correct){
    closePinOverlay();
    if(ctx==='ro'){
      enterApp({id:'ro',name:'Race Officer',icon:'🎌'},true);
    } else {
      const b=boats.find(x=>x.id===ctx);
      if(b) enterApp(b,false);
    }
  } else {
    document.getElementById('pinError').textContent='Incorrect PIN';
    pinEntry=''; updatePinDots();
    setTimeout(()=>{ document.getElementById('pinError').textContent=''; },2000);
  }
}

// ── Change PIN flow ──────────────────────────────────────────
let cpEntry='', cpTargetId=null;
function openChangePinFlow(){
  // Can be called from "Change PIN" link inside PIN overlay, or from the header 🔑 button
  closePinOverlay();
  cpEntry=''; cpTargetId=pinContext||currentBoat?.id||null;
  updateCpDots();
  document.getElementById('cpError').textContent='';
  const b=cpTargetId&&cpTargetId!=='ro'?boats.find(x=>x.id===cpTargetId):null;
  document.getElementById('cpTitle').textContent= b?'🔑 Change PIN — '+b.name:'🔑 Change RO PIN';
  document.getElementById('cpSubtitle').textContent='Enter new 4-digit PIN';
  document.getElementById('changePinOverlay').classList.add('open');
}
// RO can change any boat's PIN from settings panel
function openChangePinForBoat(id){
  cpEntry=''; cpTargetId=id;
  updateCpDots();
  document.getElementById('cpError').textContent='';
  const b=boats.find(x=>x.id===id);
  document.getElementById('cpTitle').textContent=b?'🔑 Change PIN — '+b.name:'🔑 Change PIN';
  document.getElementById('cpSubtitle').textContent='Enter new 4-digit PIN';
  document.getElementById('changePinOverlay').classList.add('open');
}
function closeChangePinOverlay(){ document.getElementById('changePinOverlay').classList.remove('open'); }
function cpKey(k){ if(cpEntry.length>=4)return; cpEntry+=k; updateCpDots(); if(cpEntry.length===4)confirmChangePin(); }
function cpBack(){ cpEntry=cpEntry.slice(0,-1); updateCpDots(); }
function cpClear(){ cpEntry=''; updateCpDots(); }
function updateCpDots(){ for(let i=0;i<4;i++) document.getElementById('cpd'+i).classList.toggle('filled',i<cpEntry.length); }
function confirmChangePin(){
  if(cpEntry.length!==4){ document.getElementById('cpError').textContent='Enter 4 digits'; return; }
  if(cpTargetId==='ro'){ setRoPin(cpEntry); }
  else { setBoatPin(cpTargetId,cpEntry); } // async — fires and doesn't block
  closeChangePinOverlay();
  const b=cpTargetId&&cpTargetId!=='ro'?boats.find(x=>x.id===cpTargetId):null;
  toast('✅ PIN updated'+(b?' for '+b.name:''));
  if(isRO) buildPinMgmtList();
}

// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════
function showTab(id,btn){
  document.querySelectorAll('.tab-wrap').forEach(t=>t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  if(btn)btn.classList.add('active');
}

// ═══════════════════════════════════════════════════════════════
// RACE SCHEDULE FUNCTIONS
// ═══════════════════════════════════════════════════════════════
function buildRaceDropdown(){
  // allRaces already built by buildAllRaces() in buildBoatGrid
  // Default to nextRace
  const nr=nextRace||getNextRace();
  const ci=allRaces.indexOf(nr)>=0?allRaces.indexOf(nr):0;
  const sel=document.getElementById('raceDropdown'); sel.innerHTML='';
  const gmap={w:'Wednesday Night Racing',k:'King of the Bay',o:'Other'};
  const og={};
  Object.entries(gmap).forEach(([k,l])=>{og[k]=document.createElement('optgroup');og[k].label=l;});
  allRaces.forEach((r,i)=>{const o=document.createElement('option');o.value=i;o.textContent=r.label;og[r.g].appendChild(o);});
  Object.values(og).forEach(g=>sel.appendChild(g));
  sel.value=ci; onRaceSelect(sel,true);
}
function onRaceSelect(el,silent){
  const i=parseInt(el.value);if(isNaN(i))return;
  selectedRace=allRaces[i];
  document.getElementById('raceBadge').textContent=selectedRace.date.toLocaleDateString('en-IE',{day:'numeric',month:'short'});
  if(!silent)toast('Race set ✓');
}

// ═══════════════════════════════════════════════════════════════
// CREW RENDER
// ═══════════════════════════════════════════════════════════════
const fee=p=>FEES[p.type]||0;
const ini=p=>(p.first[0]+p.last[0]).toUpperCase();
const over=p=>p.type==='crew'&&p.joinYear&&(CY-p.joinYear)>=CREW_MAX_YRS;
const vmax=p=>p.type==='visitor'&&p.outings>=VISITOR_MAX;
const vnr=p=>p.type==='visitor'&&p.outings===VISITOR_MAX-1;

function renderCrew(){
  const list=document.getElementById('crewList'); list.innerHTML='';
  const sel=roster.filter(p=>p.selected);
  document.getElementById('crewCount').textContent=sel.length+' selected';
  if(!roster.length){list.innerHTML='<div class="empty-state"><div class="icon">👥</div>No crew yet — add people below</div>';updateTotals();return;}
  roster.forEach(p=>{
    const warn=over(p)||vmax(p)||vnr(p);
    const c=document.createElement('div');
    c.className='crew-card'+(p.selected?' selected':'')+(warn?' warn-flag':'');
    c.innerHTML=(warn?'<div class="warn-stripe"></div>':'')+
      '<div class="cc-check" onclick="toggleSel(\''+p.id+'\')">'+
        '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="var(--navy)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="2,7 5,10 11,3"/></svg>'+
      '</div>'+
      '<div class="cc-avatar">'+ini(p)+'</div>'+
      '<div class="cc-info">'+
        '<div class="cc-name">'+p.first+' '+p.last+'</div>'+
        '<div class="cc-meta">'+
          (p.type==='full'?'<span class="tag tag-full">Full Member</span>':'')+
          (p.type==='crew'?'<span class="tag tag-crew">Crew Member</span>':'')+
          (p.type==='visitor'?'<span class="tag tag-visitor">Visitor</span>':'')+
          (p.type==='student'?'<span class="tag tag-student">Student</span>':'')+
          (p.type==='kid'?'<span class="tag tag-kid">Junior</span>':'')+
          (p.type==='visitor'?'<span style="font-size:.7rem;color:'+(warn?'var(--warn)':'var(--muted)')+'">'+p.outings+'/'+VISITOR_MAX+' outings</span>':'')+
          (p.type==='crew'&&p.joinYear?'<span style="font-size:.72rem;color:var(--muted)">since '+p.joinYear+'</span>':'')+
        '</div>'+
        (over(p)?'<div class="cc-alert">⚠ Should convert to Full Member</div>':'')+
        (vmax(p)?'<div class="cc-alert">⚠ Max outings — must join as Crew</div>':'')+
        (vnr(p)?'<div class="cc-alert">⚠ Last free outing before joining</div>':'')+
      '</div>'+
      '<div class="cc-right">'+
        '<div class="cc-fee'+(p.selected?'':' dim')+'">€'+fee(p)+'</div>'+
        (p.selected?'<div class="pay-dot '+(p.paid?'paid':'unpaid')+'" onclick="togglePaid(\''+p.id+'\')" title="'+(p.paid?'Paid':'Unpaid')+'"></div>':'')+
        '<button class="cc-menu" onclick="openEditSheet(\''+p.id+'\')">⋯</button>'+
      '</div>';
    list.appendChild(c);
  });
  updateTotals();
}
function updateTotals(){
  const s=roster.filter(p=>p.selected);
  const m=s.filter(p=>p.type==='full'||p.type==='crew').length;
  const v=s.filter(p=>p.type==='visitor').length;
  const st=s.filter(p=>p.type==='student').length;
  const k=s.filter(p=>p.type==='kid').length;
  const tot=s.reduce((a,p)=>a+fee(p),0);
  const paid=s.filter(p=>p.paid).reduce((a,p)=>a+fee(p),0);
  document.getElementById('s-mem').textContent=m?m+'×€4=€'+(m*4):'—';
  document.getElementById('s-vis').textContent=v?v+'×€10=€'+(v*10):'—';
  document.getElementById('s-stu').textContent=st?st+'×€5=€'+(st*5):'—';
  document.getElementById('s-kid').textContent=k?k+' (free)':'—';
  document.getElementById('s-total').textContent='€'+tot;
  document.getElementById('s-paid').textContent='€'+paid;
  document.getElementById('s-owed').textContent='€'+(tot-paid);
}
function toggleSel(id){const p=roster.find(r=>r.id===id);if(p){p.selected=!p.selected;if(!p.selected){p.paid=false;}}renderCrew();}
function togglePaid(id){const p=roster.find(r=>r.id===id);if(!p)return;if(p.paid){p.paid=false;p.payMethod='';p.payNote='';renderCrew();toast(p.first+' marked unpaid');}else openPNSheet(id);}

// add crew
function onCrewTypeChange(){const t=document.getElementById('cf-type').value;document.getElementById('cf-joinGrp').style.display=t==='crew'?'flex':'none';document.getElementById('cf-outGrp').style.display=t==='visitor'?'flex':'none';}
function toggleCrewForm(){const f=document.getElementById('crewForm');f.classList.toggle('open');if(f.classList.contains('open'))document.getElementById('cf-first').focus();}
async function addCrewMember(){
  const first=document.getElementById('cf-first').value.trim();
  const last=document.getElementById('cf-last').value.trim();
  const type=document.getElementById('cf-type').value;
  if(!first||!last){toast('Enter a name');return;}
  const joinYear=type==='crew'?(parseInt(document.getElementById('cf-join').value)||CY):null;
  const outings=type==='visitor'?(parseInt(document.getElementById('cf-out').value)||0):0;
  roster.push({id:newCrewId(),first,last,type,joinYear,outings,selected:true,paid:false});
  document.getElementById('cf-first').value='';document.getElementById('cf-last').value='';
  document.getElementById('cf-type').value='full';
  document.getElementById('cf-joinGrp').style.display='none';document.getElementById('cf-outGrp').style.display='none';
  document.getElementById('crewForm').classList.remove('open');
  const newP=roster[roster.length-1];
  const result=await sbUpsertCrew(currentBoat.id,newP);
  if(result&&result._err){
    toast('⚠ DB error: '+result._err.slice(0,80));
    setSyncStatus('offline');
  } else if(result===null){
    toast('⚠ Could not reach database');
    setSyncStatus('offline');
  } else {
    setSyncStatus('ok');
    cacheRosterLocally(currentBoat.id,roster);
  }
  renderCrew();toast(first+' '+last+' added ✓');
}
// edit sheet
function onEditTypeChange(){const t=document.getElementById('ef-type').value;document.getElementById('ef-joinGrp').style.display=t==='crew'?'flex':'none';document.getElementById('ef-outGrp').style.display=t==='visitor'?'flex':'none';}
function openEditSheet(id){
  const p=roster.find(r=>r.id===id);if(!p)return;
  editingId=id;
  document.getElementById('ef-heading').textContent=p.first+' '+p.last;
  document.getElementById('ef-first').value=p.first;
  document.getElementById('ef-last').value=p.last;
  document.getElementById('ef-type').value=p.type;
  document.getElementById('ef-join').value=p.joinYear||'';
  document.getElementById('ef-out').value=p.outings||0;
  onEditTypeChange();
  document.getElementById('editSheet').classList.add('open');
}
function saveEdit(){
  const p=roster.find(r=>r.id===editingId);if(!p)return;
  const first=document.getElementById('ef-first').value.trim();
  const last=document.getElementById('ef-last').value.trim();
  if(!first||!last){toast('Enter a name');return;}
  p.first=first;p.last=last;p.type=document.getElementById('ef-type').value;
  p.joinYear=p.type==='crew'?(parseInt(document.getElementById('ef-join').value)||CY):null;
  p.outings=p.type==='visitor'?(parseInt(document.getElementById('ef-out').value)||0):0;
  sbUpsertCrew(currentBoat.id,p).then(()=>{setSyncStatus('ok');cacheRosterLocally(currentBoat.id,roster);}).catch(()=>setSyncStatus('offline'));
  closeSheet('editSheet');renderCrew();toast(first+' updated ✓');
}
function deleteCrew(){
  const p=roster.find(r=>r.id===editingId);if(!p)return;
  if(!confirm('Remove '+p.first+' '+p.last+'?'))return;
  const delId=editingId;
  roster=roster.filter(r=>r.id!==editingId);
  sbDeleteCrew(delId).then(()=>{setSyncStatus('ok');cacheRosterLocally(currentBoat.id,roster);});
  closeSheet('editSheet');renderCrew();toast(p.first+' removed');
}
// ── Boat config: PIN, Revolut, Stripe ────────────────────────
// In-memory cache loaded from DB on login, written back on change
// localStorage used as fallback when offline
let boatConfig={}; // {pin, revolut_user, stripe_link} for currentBoat

async function loadBoatConfig(boatId){
  // Try DB first
  const cfg=await sbLoadBoatConfig(boatId);
  if(cfg){
    boatConfig=cfg;
    // Sync to localStorage as offline cache
    try{localStorage.setItem('cfg_'+boatId,JSON.stringify(cfg));}catch(e){}
  } else {
    // Fall back to localStorage cache
    try{
      const cached=localStorage.getItem('cfg_'+boatId);
      boatConfig=cached?JSON.parse(cached):{pin:'0000',revolut_user:'',stripe_link:''};
    }catch(e){ boatConfig={pin:'0000',revolut_user:'',stripe_link:''}; }
  }
}

function getBoatPin(id){
  // For login screen we need the PIN before loading config — use localStorage cache
  if(currentBoat&&currentBoat.id===id) return boatConfig.pin||'0000';
  try{ const c=localStorage.getItem('cfg_'+id); return c?JSON.parse(c).pin||'0000':'0000'; }catch(e){ return'0000'; }
}
function getRoPin(){ try{return localStorage.getItem('pin_ro')||RO_PIN;}catch(e){return RO_PIN;} }
function setRoPin(pin){ try{localStorage.setItem('pin_ro',pin);}catch(e){} }

async function setBoatPin(id,pin){
  // Update in-memory + localStorage immediately, then persist to DB
  if(currentBoat&&currentBoat.id===id) boatConfig.pin=pin;
  try{
    const c=localStorage.getItem('cfg_'+id);
    const obj=c?JSON.parse(c):{};
    obj.pin=pin;
    localStorage.setItem('cfg_'+id,JSON.stringify(obj));
  }catch(e){}
  await sbSaveBoatConfig(id,{pin});
}

function getRevolutUser(){
  return boatConfig.revolut_user||'';
}
function getStripeLink(){
  return boatConfig.stripe_link||'';
}
async function saveBoatSettings(revolut_user, stripe_link){
  boatConfig.revolut_user=revolut_user;
  boatConfig.stripe_link=stripe_link;
  // Sync to localStorage cache
  try{
    const c=localStorage.getItem('cfg_'+currentBoat?.id)||'{}';
    const obj=JSON.parse(c);
    obj.revolut_user=revolut_user; obj.stripe_link=stripe_link;
    localStorage.setItem('cfg_'+currentBoat?.id,JSON.stringify(obj));
  }catch(e){}
  await sbSaveBoatConfig(currentBoat.id,{revolut_user,stripe_link});
}

function openSettingsSheet(){
  document.getElementById('settings-revolut').value=getRevolutUser();
  document.getElementById('settings-stripe').value=getStripeLink();
  document.getElementById('settingsSheet').classList.add('open');
}
function saveSettings(){
  const rev=document.getElementById('settings-revolut').value.trim().replace(/^@/,'');
  const stripe=document.getElementById('settings-stripe').value.trim();
  saveBoatSettings(rev,stripe); // async — persists to DB + localStorage cache
  closeSheet('settingsSheet');
  toast('Settings saved ✓');
}

// ── Collect Payments sheet ────────────────────────────────────
function openCollectSheet(){
  const sel=roster.filter(p=>p.selected);
  if(!sel.length){toast('No crew selected');return;}
  const list=document.getElementById('collectList');
  list.innerHTML='';
  const revUser=getRevolutUser();
  sel.forEach(p=>{
    const amt=fee(p);
    const isPaid=p.paid;
    const row=document.createElement('div');
    row.id='cr-'+p.id;
    row.style.cssText='padding:10px 0;border-bottom:1px solid var(--border);';
    // Paid state
    if(isPaid){
      row.innerHTML=
        '<div style="display:flex;align-items:center;justify-content:space-between">'+
          '<div style="display:flex;align-items:center;gap:8px">'+
            '<div class="cc-avatar" style="width:30px;height:30px;font-size:.72rem">'+ini(p)+'</div>'+
            '<div><div style="font-size:.88rem;font-weight:600">'+p.first+' '+p.last+'</div>'+
            '<div style="font-size:.7rem;color:var(--success)">✓ '+( p.payMethod||'Paid')+'</div></div>'+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:8px">'+
            '<span style="font-family:Barlow Condensed,sans-serif;font-weight:800;color:var(--success)">€'+amt+'</span>'+
            '<button onclick="unpayCrewCollect(\''+p.id+'\')" style="font-size:.68rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 7px;border-radius:5px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;">Undo</button>'+
          '</div>'+
        '</div>';
    } else {
      // Payment buttons
      const revLink=revUser?`https://revolut.me/${revUser}`:'';
      const stripeLink=getStripeLink();
      row.innerHTML=
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'+
          '<div style="display:flex;align-items:center;gap:8px">'+
            '<div class="cc-avatar" style="width:30px;height:30px;font-size:.72rem">'+ini(p)+'</div>'+
            '<div><div style="font-size:.88rem;font-weight:600">'+p.first+' '+p.last+'</div>'+
            '<div style="font-size:.7rem;color:var(--muted)">'+(p.type==='visitor'?'Visitor':'Member')+' · €'+amt+'</div></div>'+
          '</div>'+
          '<span style="font-family:Barlow Condensed,sans-serif;font-size:1.2rem;font-weight:800;color:var(--danger)">€'+amt+'</span>'+
        '</div>'+
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:5px">'+
          (revLink&&isMobile()?
            '<a href="'+revLink+'" target="_blank" onclick="markPaidCollect(\''+p.id+'\',\'Revolut\')" '+
            'style="display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(110,64,216,.2);'+
            'border:1px solid rgba(110,64,216,.5);border-radius:8px;padding:8px 4px;text-decoration:none;cursor:pointer;">'+
            '<span style="font-size:1rem">💜</span>'+
            '<span style="font-size:.6rem;font-family:Barlow Condensed,sans-serif;font-weight:700;color:#a78bfa">Revolut</span></a>'
            :
            '<button onclick="openPNSheet(\''+p.id+'\',\'Revolut\')" '+
            'style="display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(110,64,216,.1);'+
            'border:1px solid var(--border);border-radius:8px;padding:8px 4px;cursor:pointer;" title="Mobile only — shows QR/link">'+
            '<span style="font-size:1rem">💜</span>'+
            '<span style="font-size:.6rem;font-family:Barlow Condensed,sans-serif;font-weight:700;color:var(--muted)">Revolut</span></button>'
          )+
          '<button onclick="markPaidCollect(\''+p.id+'\',\'Cash\')" '+
          'style="display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(45,198,83,.08);'+
          'border:1px solid rgba(45,198,83,.3);border-radius:8px;padding:8px 4px;cursor:pointer;">'+
          '<span style="font-size:1rem">💵</span>'+
          '<span style="font-size:.6rem;font-family:Barlow Condensed,sans-serif;font-weight:700;color:var(--success)">Cash</span></button>'+

          '<button onclick="markPaidCollect(\''+p.id+'\',\'Bar Tap\')" '+
          'style="display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(244,185,66,.08);'+
          'border:1px solid rgba(244,185,66,.3);border-radius:8px;padding:8px 4px;cursor:pointer;">'+
          '<span style="font-size:1rem">🍺</span>'+
          '<span style="font-size:.6rem;font-family:Barlow Condensed,sans-serif;font-weight:700;color:var(--gold)">Bar</span></button>'+

          (stripeLink?
            '<a href="'+stripeLink+'?client_reference_id='+p.id+'&amount='+amt*100+'" target="_blank" onclick="markPaidCollect(\''+p.id+'\',\'Card\')" '+
            'style="display:flex;flex-direction:column;align-items:center;gap:2px;background:rgba(0,180,216,.08);'+
            'border:1px solid rgba(0,180,216,.3);border-radius:8px;padding:8px 4px;text-decoration:none;">'+
            '<span style="font-size:1rem">💳</span>'+
            '<span style="font-size:.6rem;font-family:Barlow Condensed,sans-serif;font-weight:700;color:var(--teal)">Card</span></a>'
            :
            '<button onclick="toast(\'Add Stripe link in ⚙ Settings\')" '+
            'style="display:flex;flex-direction:column;align-items:center;gap:2px;background:transparent;'+
            'border:1px dashed var(--border);border-radius:8px;padding:8px 4px;cursor:pointer;opacity:.5;">'+
            '<span style="font-size:1rem">💳</span>'+
            '<span style="font-size:.6rem;font-family:Barlow Condensed,sans-serif;font-weight:700;color:var(--muted)">Card</span></button>'
          )+
        '</div>';
    }
    list.appendChild(row);
  });
  document.getElementById('collectSheet').classList.add('open');
}

function markPaidCollect(id,method){
  const p=roster.find(r=>r.id===id); if(!p)return;
  p.paid=true; p.payMethod=method; p.payNote='';
  renderCrew();
  // Refresh the row in the collect sheet
  const row=document.getElementById('cr-'+id);
  if(row){
    row.style.transition='background .3s';
    row.style.background='rgba(45,198,83,.06)';
    row.innerHTML=
      '<div style="display:flex;align-items:center;justify-content:space-between;padding:4px 0">'+
        '<div style="display:flex;align-items:center;gap:8px">'+
          '<div class="cc-avatar" style="width:30px;height:30px;font-size:.72rem">'+ini(p)+'</div>'+
          '<div><div style="font-size:.88rem;font-weight:600">'+p.first+' '+p.last+'</div>'+
          '<div style="font-size:.7rem;color:var(--success)">✓ '+method+'</div></div>'+
        '</div>'+
        '<span style="font-family:Barlow Condensed,sans-serif;font-weight:800;color:var(--success)">€'+fee(p)+'</span>'+
      '</div>';
  }
  toast(p.first+' — '+method+' ✓');
}

function unpayCrewCollect(id){
  const p=roster.find(r=>r.id===id); if(!p)return;
  p.paid=false; p.payMethod=''; p.payNote='';
  renderCrew();
  openCollectSheet(); // re-render sheet
}

function markAllCash(){
  const sel=roster.filter(p=>p.selected&&!p.paid);
  if(!sel.length){toast('All already paid ✓');closeSheet('collectSheet');return;}
  sel.forEach(p=>{p.paid=true;p.payMethod='Cash';p.payNote='Bulk';});
  renderCrew();
  openCollectSheet();
  toast('All '+sel.length+' marked Cash ✓');
}

// ── Individual pay method sheet (kept for edge cases) ─────────
function openPNSheet(id,preset){
  const p=roster.find(r=>r.id===id);if(!p)return;
  pnId=id;pnMethod=preset||null;
  document.getElementById('pn-name').textContent=p.first+' '+p.last;
  document.getElementById('pn-note').value='';
  document.querySelectorAll('.pm-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('pn-revolut-link').style.display='none';
  document.getElementById('pn-stripe-link').style.display='none';
  if(preset){
    const btn=document.getElementById('pm-'+preset.toLowerCase().replace(/\s.*/,''));
    if(btn){btn.classList.add('active');showPayMethodExtras(preset,p);}
  }
  document.getElementById('pnSheet').classList.add('open');
}
function pickMethod(btn,m){
  pnMethod=m;
  document.querySelectorAll('.pm-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  const p=roster.find(r=>r.id===pnId);
  showPayMethodExtras(m,p);
}
function isMobile(){
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}
function showPayMethodExtras(m,p){
  const revDiv=document.getElementById('pn-revolut-link');
  const stripeDiv=document.getElementById('pn-stripe-link');
  revDiv.style.display='none'; stripeDiv.style.display='none';
  if(m==='Revolut'){
    const revUser=getRevolutUser();
    if(revUser&&p){
      if(isMobile()){
        document.getElementById('pn-revolut-btn').href=`https://revolut.me/${revUser}`;
        revDiv.style.display='block';
      } else {
        revDiv.innerHTML=`<div style="background:rgba(110,64,216,.08);border:1px solid rgba(110,64,216,.25);
          border-radius:10px;padding:12px;text-align:center;">
          <div style="font-size:1.2rem;margin-bottom:4px">📱</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.85rem;color:#a78bfa;margin-bottom:3px">
            Revolut — Mobile Only
          </div>
          <div style="font-size:.75rem;color:var(--muted)">
            Ask the crew member to open Revolut on their phone,<br>
            or use the QR Pay Link instead.
          </div>
          <div style="font-size:.78rem;color:#a78bfa;margin-top:6px;font-family:'Barlow Condensed',sans-serif;font-weight:700;letter-spacing:.04em">
            revolut.me/@${revUser} · enter €${fee(p)} in the app
          </div>
        </div>`;
        revDiv.style.display='block';
      }
    }
  }
  if(m==='Card/Apple/Google'){
    stripeDiv.style.display='block';
  }
}
function confirmPayNote(){
  if(!pnId)return;if(!pnMethod){toast('Select payment method');return;}
  const p=roster.find(r=>r.id===pnId);if(!p)return;
  p.paid=true;p.payMethod=pnMethod;p.payNote=document.getElementById('pn-note').value.trim();
  closeSheet('pnSheet');renderCrew();
  // Refresh collect sheet row if open
  const cr=document.getElementById('cr-'+p.id);
  if(cr) markPaidCollect(p.id, pnMethod);
  else toast(p.first+' — '+pnMethod+' ✓');
}

// ── Share Payment Link / QR ───────────────────────────────────
function openSharePayLink(){
  const sel=roster.filter(p=>p.selected);
  if(!sel.length){toast('No crew selected');return;}
  const tot=sel.filter(p=>!p.paid).reduce((a,p)=>a+fee(p),0);
  if(!tot){toast('All crew already paid ✓');return;}

  // Build a data URL encoding the payment context
  const data={
    boat: currentBoat.name,
    race: selectedRace?selectedRace.label:'Race',
    rev: getRevolutUser(),
    stripe: getStripeLink(),
    crew: sel.filter(p=>!p.paid).map(p=>({n:p.first+' '+p.last,t:p.type,a:fee(p)}))
  };
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(data))));
  // Self-contained link — opens the pay page embedded in this same file
  const link=window.location.href.split('#')[0]+'#pay='+encoded;

  document.getElementById('shareLinkBox').textContent=link;

  // Generate QR using a free API
  const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(link);
  document.getElementById('shareQR').innerHTML=
    '<img src="'+qrUrl+'" style="width:180px;height:180px;border-radius:8px;" alt="QR Code">'+
    '<div style="margin-top:8px;font-size:.78rem;color:#333;font-family:Barlow Condensed,sans-serif;font-weight:700">'+
    currentBoat.name+' · '+tot+' EUR outstanding</div>';

  document.getElementById('shareSheet').classList.add('open');
}

function copyShareLink(){
  const link=document.getElementById('shareLinkBox').textContent;
  navigator.clipboard.writeText(link).then(()=>toast('Link copied ✓')).catch(()=>{
    // Fallback
    const ta=document.createElement('textarea');ta.value=link;document.body.appendChild(ta);
    ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('Link copied ✓');
  });
}

// ── Submit to RC ──────────────────────────────────────────────
let settlementMethods=new Set();

function sendReport(){
  const s=roster.filter(p=>p.selected);
  if(!s.length){toast('No crew selected');return;}
  const unpaid=s.filter(p=>!p.paid);
  if(unpaid.length){
    if(!confirm(unpaid.length+' crew member'+(unpaid.length>1?'s are':' is')+' still unpaid. Submit anyway?'))return;
  }
  // Reset settlement sheet state
  settlementMethods=new Set();
  document.querySelectorAll('.settle-btn').forEach(b=>b.classList.remove('active'));
  document.getElementById('settlement-note').value='';
  document.getElementById('settlementSheet').classList.add('open');
}

function toggleSettle(method){
  const btn=document.getElementById('sb-'+method);
  if(settlementMethods.has(method)){
    settlementMethods.delete(method);
    btn.classList.remove('active');
  } else {
    settlementMethods.add(method);
    btn.classList.add('active');
  }
}

async function confirmSubmit(){
  const s=roster.filter(p=>p.selected);
  const rn=selectedRace?selectedRace.label:'Race';
  const tot=s.reduce((a,p)=>a+fee(p),0);
  const paid=s.filter(p=>p.paid).reduce((a,p)=>a+fee(p),0);
  const byMethod={};
  s.filter(p=>p.paid).forEach(p=>{const m=p.payMethod||'Unknown';byMethod[m]=(byMethod[m]||0)+fee(p);});
  const note=document.getElementById('settlement-note').value.trim();
  const settlement=Array.from(settlementMethods);

  closeSheet('settlementSheet');

  const result=await sbSaveRaceRecord({
    boat_id:currentBoat.id,
    race_name:rn,
    race_date:selectedRace?selectedRace.date.toISOString().split('T')[0]:new Date().toISOString().split('T')[0],
    crew_snapshot:s,
    total_due:tot,
    total_paid:paid,
    payment_methods:byMethod,
    settlement_methods:settlement,
    settlement_note:note||null
  });

  if(result&&result._err){
    toast('⚠ Could not submit — '+result._err.slice(0,60));
  } else {
    setSyncStatus('ok');
    toast('✅ Submitted to Race Officer');
  }
}

// ═══════════════════════════════════════════════════════════════
// RO PAYMENT REPORT
// ═══════════════════════════════════════════════════════════════
async function generatePaymentReport(){
  const statusEl=document.getElementById('reportStatus');
  if(!nextRace){statusEl.textContent='No upcoming race found';return;}
  const raceName=nextRace.label;
  const raceDate=nextRace.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  statusEl.textContent='⏳ Loading report…';

  // Fetch both registrations and payment submissions in parallel
  const [records, regs]=await Promise.all([
    sbLoadRaceRecords(raceName),
    sbLoadRegistrations(nextRace)
  ]);

  statusEl.textContent='';

  // Boats that registered but never submitted a payment report
  const submittedBoatIds=new Set(records.map(r=>r.boat_id));
  const missingBoats=(regs||[])
    .filter(r=>!submittedBoatIds.has(r.boat_id))
    .map(r=>boats.find(b=>b.id===r.boat_id))
    .filter(Boolean);

  // Aggregate totals from submissions
  let grandDue=0, grandPaid=0;
  const allMethods={};

  const boatRows=records.map(rec=>{
    const boat=boats.find(b=>b.id===rec.boat_id);
    const boatName=boat?boat.name:rec.boat_id;
    const crew=(rec.crew_snapshot||[]);
    const due=rec.total_due||0;
    const paid=rec.total_paid||0;
    const outstanding=due-paid;
    const methods=rec.payment_methods||{};
    grandDue+=due; grandPaid+=paid;
    Object.entries(methods).forEach(([m,a])=>{allMethods[m]=(allMethods[m]||0)+a;});

    const crewRows=crew.map(p=>{
      const tl=p.type==='full'?'Full Member':p.type==='crew'?'Crew Member':p.type==='student'?'Student':p.type==='kid'?'Junior':'Visitor';
      const statusCol=p.paid
        ?`<td style="color:#1a7a3a;font-weight:600">Paid €${fee(p)}</td><td style="color:#555">${p.payMethod||'—'}</td>`
        :`<td style="color:#c0392b;font-weight:600">Unpaid €${fee(p)}</td><td>—</td>`;
      return`<tr>
        <td>${p.first} ${p.last}</td>
        <td>${tl}</td>
        ${statusCol}
        <td style="color:#888;font-size:.85em">${p.payNote||''}</td>
      </tr>`;
    }).join('');

    const submittedAt=new Date(rec.submitted_at).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
    const methodStr=Object.entries(methods).map(([m,a])=>`${m}: €${a}`).join(' · ')||'—';
    const settlementStr=(rec.settlement_methods||[]).map(s=>s.charAt(0).toUpperCase()+s.slice(1)).join(', ')||'—';
    const settlementNote=rec.settlement_note||'';

    return`
      <div style="margin-bottom:28px;page-break-inside:avoid;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;
          border-bottom:2px solid #1B3E93;padding-bottom:4px;margin-bottom:8px;">
          <h3 style="font-size:1rem;color:#1B3E93;margin:0">${boatName}</h3>
          <span style="font-size:.8rem;color:#888">Submitted ${submittedAt}</span>
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:.85rem;margin-bottom:6px">
          <thead>
            <tr style="background:#f0f4ff;">
              <th style="text-align:left;padding:4px 8px;font-weight:600">Name</th>
              <th style="text-align:left;padding:4px 8px;font-weight:600">Type</th>
              <th style="text-align:left;padding:4px 8px;font-weight:600">Status</th>
              <th style="text-align:left;padding:4px 8px;font-weight:600">Method</th>
              <th style="text-align:left;padding:4px 8px;font-weight:600">Note</th>
            </tr>
          </thead>
          <tbody>${crewRows}</tbody>
        </table>
        <div style="display:flex;justify-content:space-between;font-size:.82rem;color:#555;padding:4px 0;flex-wrap:wrap;gap:4px">
          <span>Due: <b>€${due}</b> · Paid: <b style="color:#1a7a3a">€${paid}</b>${outstanding>0?' · <b style="color:#c0392b">Outstanding: €'+outstanding+'</b>':''}</span>
          <span style="color:#888">Crew payments: ${methodStr}</span>
        </div>
        <div style="font-size:.82rem;color:#555;padding:3px 0">
          Settlement to club: <b>${settlementStr}</b>${settlementNote?' — '+settlementNote:''}
        </div>
      </div>`;
  }).join('');

  const grandOutstanding=grandDue-grandPaid;
  const methodSummaryRows=Object.entries(allMethods)
    .map(([m,a])=>`<tr><td style="padding:3px 8px">${m}</td><td style="padding:3px 8px;font-weight:600;text-align:right">€${a}</td></tr>`)
    .join('');

  // Missing boats section — registered but no submission
  const missingSection=missingBoats.length?`
    <div style="margin-bottom:32px;page-break-inside:avoid;">
      <div style="background:#fff3cd;border:2px solid #e8a020;border-radius:8px;padding:14px;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800;
          color:#c0392b;letter-spacing:.04em;margin-bottom:10px;">
          ⚠ Registered — No Payment Submission (${missingBoats.length})
        </div>
        ${missingBoats.map(b=>`
          <div style="display:flex;align-items:center;justify-content:space-between;
            padding:7px 0;border-bottom:1px solid rgba(0,0,0,.08);">
            <span style="font-weight:600;font-size:.95rem">${b.name}</span>
            <span style="font-size:.8rem;color:#c0392b;font-weight:600">No submission received</span>
          </div>`).join('')}
      </div>
    </div>`:'';

  const printHtml=`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Race Fees — ${raceName}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Barlow',sans-serif;color:#1a1a2e;padding:32px;max-width:800px;margin:0 auto;font-size:13px;}
  h1{font-family:'Barlow Condensed',sans-serif;font-size:1.6rem;font-weight:800;color:#1B3E93;letter-spacing:.04em;}
  h2{font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#666;margin-bottom:20px;}
  table td, table th{padding:4px 8px;border-bottom:1px solid #e8eef8;}
  @media print{body{padding:16px;}@page{margin:15mm;}}
</style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">
    <div>
      <h1>Race Fee Report</h1>
      <h2>${raceName} · ${raceDate}</h2>
    </div>
    <div style="text-align:right;font-size:.8rem;color:#888">
      Generated ${new Date().toLocaleString('en-IE')}<br>
      GBSC Racing App
    </div>
  </div>

  <div style="display:flex;gap:24px;background:#f0f4ff;border-radius:8px;padding:14px;margin-bottom:28px;flex-wrap:wrap;">
    <div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Registered</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1B3E93;font-family:'Barlow Condensed',sans-serif">${(regs||[]).length}</div></div>
    <div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Submitted</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1B3E93;font-family:'Barlow Condensed',sans-serif">${records.length}</div></div>
    ${missingBoats.length?`<div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Missing</div>
      <div style="font-size:1.6rem;font-weight:800;color:#c0392b;font-family:'Barlow Condensed',sans-serif">${missingBoats.length}</div></div>`:''}
    <div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Total Due</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1B3E93;font-family:'Barlow Condensed',sans-serif">€${grandDue}</div></div>
    <div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Collected</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1a7a3a;font-family:'Barlow Condensed',sans-serif">€${grandPaid}</div></div>
    ${grandOutstanding>0?`<div><div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Outstanding</div>
      <div style="font-size:1.6rem;font-weight:800;color:#c0392b;font-family:'Barlow Condensed',sans-serif">€${grandOutstanding}</div></div>`:''}
    <div style="margin-left:auto">
      <div style="font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">By Method</div>
      <table style="margin-top:2px">${methodSummaryRows}</table>
    </div>
  </div>

  ${missingSection}
  ${boatRows}
</body></html>`;

  // Open in new window and trigger print
  const win=window.open('','_blank','width=900,height=700');
  win.document.write(printHtml);
  win.document.close();
  win.onload=()=>{ win.focus(); win.print(); };
}

// ═══════════════════════════════════════════════════════════════
// SPONSORS
// ═══════════════════════════════════════════════════════════════
const SPONSORS=[
  {
    match:/galway.?maritime/i,
    name:'Galway Maritime',
    tagline:'Marine Chandlery',
    logo:'https://i0.wp.com/galwaymaritime.com/wp-content/uploads/2025/07/cropped-Web-Logo-scaled-1.webp',
    url:'https://galwaymaritime.com'
  },
  {
    match:/mcswiggans/i,
    name:'McSwiggans',
    tagline:'Steak & Seafood Restaurant',
    logo:'https://www.google.com/s2/favicons?domain=mcswiggans.ie&sz=64',
    url:'https://mcswiggans.ie'
  },
  // Add more sponsors here as series are added:
];

function showSponsor(raceName){
  const widget=document.getElementById('sponsorWidget');
  if(!raceName||!widget){return;}
  const sponsor=SPONSORS.find(s=>s.match.test(raceName));
  if(!sponsor){widget.style.display='none';return;}
  document.getElementById('sponsorLogo').src=sponsor.logo;
  document.getElementById('sponsorLogo').alt=sponsor.name;
  document.getElementById('sponsorName').textContent=sponsor.name+(sponsor.tagline?' — '+sponsor.tagline:'');
  widget.href=sponsor.url;
  widget.style.display='flex';
}
let calLoaded=false, calView='list', calGridMonth=null, calSchedule=[];

async function loadCalendarIfNeeded(){
  if(calLoaded) return;
  calLoaded=true;
  document.getElementById('calendarContent').innerHTML=
    '<div class="empty-state"><div class="icon">⏳</div><div>Loading schedule from Halsail…</div></div>';

  const raw=await halFetch('/GetSchedule/'+HAL_CLUB);
  if(!raw||raw._err||!Array.isArray(raw)){
    calLoaded=false;
    document.getElementById('calendarContent').innerHTML=
      '<div class="empty-state"><div class="icon">⚠</div>'+
      '<div>Could not load schedule<br><span style="font-size:.75rem;color:var(--muted)">'+(raw&&raw._err?raw._err:'No data')+'</span></div>'+
      '<button class="btn btn-ghost" style="padding:8px 16px;margin-top:10px" onclick="calLoaded=false;loadCalendarIfNeeded()">Try Again</button></div>';
    return;
  }

  // Deduplicate by RaceID across all classes, sort by date
  const seen=new Set();
  calSchedule=raw
    .filter(r=>{ if(seen.has(r.RaceID))return false; seen.add(r.RaceID); return true; })
    .map(r=>({...r,dateObj:new Date(r.Start)}))
    .sort((a,b)=>a.dateObj-b.dateObj);

  // Share schedule data with Results tab if it hasn't loaded yet
  if(!halSchedule) halSchedule=raw;

  calGridMonth={year:new Date().getFullYear(),month:new Date().getMonth()};
  renderCalendar();
}

function setCalView(v){
  calView=v;
  const activeStyle='font-family:Barlow Condensed,sans-serif;font-size:.75rem;font-weight:700;padding:5px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--teal);background:var(--teal);color:var(--navy-dark);';
  const inactiveStyle='font-family:Barlow Condensed,sans-serif;font-size:.75rem;font-weight:700;padding:5px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);';
  document.getElementById('calListBtn').style.cssText=v==='list'?activeStyle:inactiveStyle;
  document.getElementById('calGridBtn').style.cssText=v==='grid'?activeStyle:inactiveStyle;
  renderCalendar();
}

function renderCalendar(){
  if(calView==='list') renderCalList();
  else renderCalGrid();
}

function renderCalList(){
  const wrap=document.getElementById('calendarContent');
  if(!calSchedule.length){wrap.innerHTML='<div class="empty-state"><div class="icon">📅</div><div>No races found</div></div>';return;}

  const now=new Date();
  const nextEvt=calSchedule.find(r=>r.dateObj>=now);

  // Group by series
  const groups={};
  calSchedule.forEach(r=>{
    if(!groups[r.Series]) groups[r.Series]={series:r.Series,races:[]};
    if(!groups[r.Series].races.find(x=>x.RaceID===r.RaceID))
      groups[r.Series].races.push(r);
  });
  const sorted=Object.values(groups).sort((a,b)=>a.races[0].dateObj-b.races[0].dateObj);

  let html='';
  sorted.forEach(g=>{
    const isKotb=g.series.toLowerCase().includes('king');
    html+=`<div class="cal-group"><div class="cal-group-title">${g.series}</div>`;
    g.races.forEach(r=>{
      const d=r.dateObj;
      const isPast=d<now;
      const isNext=nextEvt&&r.RaceID===nextEvt.RaceID;
      const dayNum=d.getDate();
      const mon=d.toLocaleDateString('en-IE',{month:'short'});
      const weekday=d.toLocaleDateString('en-IE',{weekday:'short'});
      const time=d.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
      html+=`<div class="cal-race-row${isNext?' next-race':''}${isPast?' past':''}">
        <div class="cal-date${isPast?' past':''}">
          <div class="cal-date-day">${dayNum}</div>
          <div class="cal-date-mon">${mon}</div>
        </div>
        <div class="cal-info">
          <div class="cal-race-name">${r.Notes&&r.Notes.trim()?r.Notes.trim():r.Race.replace(/_/g,' ')}</div>
          <div class="cal-series-name">${weekday} · ${time}</div>
        </div>
        ${isNext?'<div class="cal-badge next">Next</div>':isKotb&&!isPast?'<div class="cal-badge kotb">KOTB</div>':isPast?'<div class="cal-badge past">Done</div>':''}
      </div>`;
    });
    html+='</div>';
  });
  wrap.innerHTML=html;
}

function renderCalGrid(){
  const wrap=document.getElementById('calendarContent');
  const {year,month}=calGridMonth;
  const now=new Date();
  const monthName=new Date(year,month,1).toLocaleDateString('en-IE',{month:'long',year:'numeric'});

  // Event lookup by date string
  const events={};
  calSchedule.forEach(r=>{
    const key=r.dateObj.toISOString().split('T')[0];
    if(!events[key]) events[key]=[];
    if(!events[key].find(x=>x.RaceID===r.RaceID)) events[key].push(r);
  });

  const firstDay=new Date(year,month,1).getDay();
  const offset=(firstDay+6)%7; // Monday-first
  const daysInMonth=new Date(year,month+1,0).getDate();
  const daysInPrev=new Date(year,month,0).getDate();
  const DAY_LABELS=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  let html=`<div class="cal-month-nav">
    <button class="cal-nav-btn" onclick="calNavMonth(-1)">‹</button>
    <div class="cal-month-label">${monthName}</div>
    <button class="cal-nav-btn" onclick="calNavMonth(1)">›</button>
  </div>
  <div class="cal-grid">
    ${DAY_LABELS.map(d=>`<div class="cal-grid-header">${d}</div>`).join('')}`;

  for(let i=0;i<offset;i++){
    html+=`<div class="cal-cell other-month"><div class="cal-cell-num">${daysInPrev-offset+i+1}</div></div>`;
  }
  for(let d=1;d<=daysInMonth;d++){
    const date=new Date(year,month,d);
    const key=date.toISOString().split('T')[0];
    const dayEvents=events[key]||[];
    const isToday=date.toDateString()===now.toDateString();
    html+=`<div class="cal-cell${isToday?' today':''}">
      <div class="cal-cell-num">${d}</div>
      ${dayEvents.map(r=>{
        const isKotb=r.Series.toLowerCase().includes('king');
        const cls=isKotb?'kotb':'wed';
        return`<div class="cal-event ${cls}" title="${r.Series}">${r.Race.replace('Race_','R')}</div>`;
      }).join('')}
    </div>`;
  }
  const totalCells=offset+daysInMonth;
  const remaining=(7-totalCells%7)%7;
  for(let d=1;d<=remaining;d++){
    html+=`<div class="cal-cell other-month"><div class="cal-cell-num">${d}</div></div>`;
  }
  html+='</div>';
  wrap.innerHTML=html;
}

function calNavMonth(dir){
  let {year,month}=calGridMonth;
  month+=dir;
  if(month>11){month=0;year++;}
  if(month<0){month=11;year--;}
  calGridMonth={year,month};
  renderCalGrid();
}

function bearing(lat1,lng1,lat2,lng2){
  const dLng=(lng2-lng1)*Math.PI/180;
  const l1=lat1*Math.PI/180,l2=lat2*Math.PI/180;
  const y=Math.sin(dLng)*Math.cos(l2);
  const x=Math.cos(l1)*Math.sin(l2)-Math.sin(l1)*Math.cos(l2)*Math.cos(dLng);
  return((Math.atan2(y,x)*180/Math.PI)+360)%360;
}
function dist(lat1,lng1,lat2,lng2){
  const R=6371000;
  const dLat=(lat2-lat1)*Math.PI/180,dLng=(lng2-lng1)*Math.PI/180;
  const a=Math.sin(dLat/2)**2+Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLng/2)**2;
  return R*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a));
}

// ═══════════════════════════════════════════════════════════════
// COURSE DIAGRAM (SVG)
// ═══════════════════════════════════════════════════════════════
async function loadAndDrawCourse(){
  const c=await sbLoadCourse();
  if(c){ publishedCourse=c; }
  renderCourseDiagram();
}

function renderCourseDiagram(){
  const wrap=document.getElementById('courseDisplay');
  if(!publishedCourse||!publishedCourse.marks||!publishedCourse.marks.length){
    wrap.innerHTML='<div class="no-course-state"><div class="icon">🗺</div><div>No course published yet</div></div>';
    return;
  }
  const c=publishedCourse;
  // marks is array of {id,rounding} or legacy string IDs
  const markEntries=(c.marks||[]).map(m=>typeof m==='string'?{id:m,rounding:'port'}:m);
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const windDir=c.windDeg!=null?dirs[Math.round(c.windDeg/22.5)%16]:'—';
  const windDegDisp=c.windDeg!=null?c.windDeg+'° '+windDir:'—';

  // Build SVG diagram
  // Nodes: S/F + each mark + Finish (S/F again)
  const nodes=[{label:'S / F',colour:'#00b4d8',sub:'Start',sf:true}];
  markEntries.forEach((me,i)=>{
    const m=MARKS.find(x=>x.id===me.id);
    if(m) nodes.push({label:m.name,colour:m.colour,sub:null,rounding:me.rounding,markObj:m,idx:i+1});
  });
  nodes.push({label:'Finish',colour:'#00b4d8',sub:'Club Line',sf:true});

  const NODE_R=22, GAP=80, PAD=40;
  const totalNodes=nodes.length;
  // Layout: vertical stack
  const SVG_W=320;
  const SVG_H=PAD*2+totalNodes*NODE_R*2+(totalNodes-1)*GAP;
  const cx=SVG_W/2;

  let svgParts=[];
  // Draw connecting lines first (behind nodes)
  for(let i=0;i<nodes.length-1;i++){
    const y1=PAD+i*(NODE_R*2+GAP)+NODE_R;
    const y2=PAD+(i+1)*(NODE_R*2+GAP)+NODE_R;
    const midY=(y1+y2)/2;
    // dashed line
    svgParts.push(`<line x1="${cx}" y1="${y1+NODE_R}" x2="${cx}" y2="${y2-NODE_R}" stroke="rgba(0,180,216,0.35)" stroke-width="2" stroke-dasharray="5 4"/>`);
    // arrow at midpoint
    svgParts.push(`<polygon points="${cx},${midY+8} ${cx-5},${midY-4} ${cx+5},${midY-4}" fill="rgba(0,180,216,0.6)"/>`);
    // leg bearing/distance label — calc from geo
    if(i===0){
      // First leg: S/F to mark 1
      const toM=MARKS.find(x=>x.id===nodes[1]?.label);
      if(toM){
        const brg=Math.round(bearing(START_POS.lat,START_POS.lng,toM.lat,toM.lng));
        const d=Math.round(dist(START_POS.lat,START_POS.lng,toM.lat,toM.lng)/1852*10)/10;
        const dir=dirs[Math.round(brg/22.5)%16];
        svgParts.push(`<text x="${cx+14}" y="${midY+4}" fill="rgba(122,143,166,0.9)" font-family="Barlow Condensed,sans-serif" font-size="11" font-weight="600">${brg}° · ${d}nm</text>`);
      }
    } else if(!nodes[i].sf){
      const fromM=MARKS.find(x=>x.id===nodes[i].label);
      const toM=MARKS.find(x=>x.id===nodes[i+1].label);
      if(fromM&&toM){
        const brg=Math.round(bearing(fromM.lat,fromM.lng,toM.lat,toM.lng));
        const d=Math.round(dist(fromM.lat,fromM.lng,toM.lat,toM.lng)/1852*10)/10;
        const dir=dirs[Math.round(brg/22.5)%16];
        svgParts.push(`<text x="${cx+14}" y="${midY+4}" fill="rgba(122,143,166,0.9)" font-family="Barlow Condensed,sans-serif" font-size="11" font-weight="600">${brg}° · ${d}nm</text>`);
      }
    }
  }

  // Draw nodes
  nodes.forEach((n,i)=>{
    const y=PAD+i*(NODE_R*2+GAP)+NODE_R;
    if(n.sf){
      // S/F: double ring
      svgParts.push(`<circle cx="${cx}" cy="${y}" r="${NODE_R+4}" fill="none" stroke="${n.colour}" stroke-width="1.5" stroke-dasharray="4 3" opacity="0.5"/>`);
      svgParts.push(`<circle cx="${cx}" cy="${y}" r="${NODE_R}" fill="rgba(0,180,216,0.15)" stroke="${n.colour}" stroke-width="2"/>`);
      svgParts.push(`<text x="${cx}" y="${y-5}" text-anchor="middle" fill="${n.colour}" font-family="Barlow Condensed,sans-serif" font-size="11" font-weight="800">${n.label}</text>`);
      svgParts.push(`<text x="${cx}" y="${y+8}" text-anchor="middle" fill="rgba(122,143,166,0.9)" font-family="Barlow,sans-serif" font-size="9">${n.sub}</text>`);
    } else {
      // Mark node
      svgParts.push(`<circle cx="${cx}" cy="${y}" r="${NODE_R}" fill="${n.colour}22" stroke="${n.colour}" stroke-width="2.5"/>`);
      svgParts.push(`<circle cx="${cx}" cy="${y}" r="7" fill="${n.colour}"/>`);
      // Sequence number left of circle
      svgParts.push(`<text x="${cx-NODE_R-6}" y="${y+4}" text-anchor="end" fill="rgba(0,174,239,0.8)" font-family="Barlow Condensed,sans-serif" font-size="14" font-weight="800">${n.idx}</text>`);
      // Mark name to the right
      svgParts.push(`<text x="${cx+NODE_R+10}" y="${y+4}" fill="${n.colour}" font-family="Barlow Condensed,sans-serif" font-size="17" font-weight="800">${n.label}</text>`);
      // Rounding badge
      const rnd=n.rounding||'port';
      const rndColour=rnd==='port'?'#e63946':'#2dc653';
      const rndLabel=rnd==='port'?'◄ PORT':'STBD ►';
      svgParts.push(`<rect x="${cx+NODE_R+8}" y="${y+12}" width="58" height="16" rx="4" fill="${rndColour}22" stroke="${rndColour}" stroke-width="1"/>`);
      svgParts.push(`<text x="${cx+NODE_R+37}" y="${y+23}" text-anchor="middle" fill="${rndColour}" font-family="Barlow Condensed,sans-serif" font-size="10" font-weight="700">${rndLabel}</text>`);
    }
  });

  const svgEl=`<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto">${svgParts.join('')}</svg>`;

  // Leg-by-leg table — starts with the Start Line entry
  let legRows='';
  let prevLat=START_POS.lat, prevLng=START_POS.lng;

  // Row 0: Start Line
  legRows+=`<div class="leg-row">
    <span class="leg-num" style="color:var(--teal)">S</span>
    <span class="mark-colour" style="background:#00b4d8"></span>
    <span class="leg-mark">Start / Finish Line</span>
    <span class="leg-rounding" style="background:rgba(0,180,216,.1);color:var(--teal);border:1px solid rgba(0,180,216,.3)">S / F</span>
    <span class="leg-detail" style="color:var(--muted)">—</span>
  </div>`;
  markEntries.forEach((me,i)=>{
    const m=MARKS.find(x=>x.id===me.id); if(!m)return;
    const brg=Math.round(bearing(prevLat,prevLng,m.lat,m.lng));
    const d=Math.round(dist(prevLat,prevLng,m.lat,m.lng)/1852*10)/10;
    const dir=dirs[Math.round(brg/22.5)%16];
    const rnd=me.rounding||'port';
    const rndLabel=rnd==='port'?'◄ Port':'Stbd ►';
    legRows+=`<div class="leg-row">
      <span class="leg-num">${i+1}</span>
      <span class="mark-colour" style="background:${m.colour}"></span>
      <span class="leg-mark">${m.name}</span>
      <span class="leg-rounding ${rnd}">${rndLabel}</span>
      <span class="leg-detail">${brg}° · ${d}nm</span>
    </div>`;
    prevLat=m.lat; prevLng=m.lng;
  });
  // return leg
  const retBrg=Math.round(bearing(prevLat,prevLng,START_POS.lat,START_POS.lng));
  const retD=Math.round(dist(prevLat,prevLng,START_POS.lat,START_POS.lng)/1852*10)/10;
  const retDir=dirs[Math.round(retBrg/22.5)%16];
  legRows+=`<div class="leg-row">
    <span class="leg-num">${markEntries.length+1}</span>
    <span class="mark-colour" style="background:#00b4d8"></span>
    <span class="leg-mark">Finish — Club Start Line</span>
    <span class="leg-rounding" style="background:rgba(0,180,216,.1);color:var(--teal);border:1px solid rgba(0,180,216,.3)">S / F</span>
    <span class="leg-detail">${retBrg}° · ${retD}nm</span>
  </div>`;

  // Total distance — sum all legs including return
  let totalDist=0;
  let tLat=START_POS.lat, tLng=START_POS.lng;
  markEntries.forEach(me=>{
    const m=MARKS.find(x=>x.id===me.id); if(!m)return;
    totalDist+=dist(tLat,tLng,m.lat,m.lng);
    tLat=m.lat; tLng=m.lng;
  });
  totalDist+=dist(tLat,tLng,START_POS.lat,START_POS.lng);
  const totalNm=Math.round(totalDist/1852*10)/10;

  wrap.innerHTML=`
    <div class="course-diagram-wrap">
      <div class="course-header">
        <div>
          <div class="course-title-label">Course</div>
          <div class="course-name-text">${c.name||'Published Course'}</div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
          <div class="wind-badge">
            <span class="wind-badge-arrow">💨</span>
            <span class="wind-badge-label">${windDegDisp}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;background:rgba(0,174,239,.08);
            border:1px solid rgba(0,174,239,.2);border-radius:20px;padding:3px 10px;">
            <span style="font-size:.8rem">📏</span>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;color:var(--teal)">${totalNm} nm</span>
          </div>
        </div>
      </div>
      <div class="course-legs-list">${legRows}</div>
      <div class="course-svg-wrap" style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">${svgEl}</div>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// RACE OFFICER — COURSE BUILDER
// ═══════════════════════════════════════════════════════════════
function buildMarksGrid(){
  const g=document.getElementById('marksGrid'); g.innerHTML='';
  MARKS.forEach(m=>{
    const el=document.createElement('div');
    el.className='mark-toggle'; el.id='mt-'+m.id;
    el.innerHTML=
      '<div class="mark-toggle-id" style="display:flex;align-items:center;gap:4px">'+
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+m.colour+';flex-shrink:0"></span>'+
        m.name+'</div>'+
      '<div style="font-size:.62rem;color:var(--teal);margin-top:3px;font-family:Barlow Condensed,sans-serif;font-weight:600">+ ADD</div>';
    el.onclick=()=>addMarkToSequence(m.id);
    g.appendChild(el);
  });
}
function addMarkToSequence(id){
  // Always append — marks can appear multiple times
  courseMarks.push({id, rounding:'port'});
  // Highlight grid button to show mark is in use
  const btn=document.getElementById('mt-'+id);
  if(btn) btn.classList.add('selected');
  renderSelectedOrder();
}
function removeMarkFromSequence(idx){
  const removed=courseMarks[idx];
  courseMarks.splice(idx,1);
  // Remove highlight if this mark no longer appears anywhere in the sequence
  if(!courseMarks.some(x=>x.id===removed.id)){
    const btn=document.getElementById('mt-'+removed.id);
    if(btn) btn.classList.remove('selected');
  }
  renderSelectedOrder();
}
function setRounding(idx,rnd){
  if(courseMarks[idx]) courseMarks[idx].rounding=rnd;
  renderSelectedOrder();
}
function renderSelectedOrder(){
  const wrap=document.getElementById('selectedMarksOrder');
  const list=document.getElementById('smoList');
  list.innerHTML='';
  if(!courseMarks.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  courseMarks.forEach((entry,i)=>{
    const m=MARKS.find(x=>x.id===entry.id);
    const colour=m?m.colour:'#888';
    const isPort=entry.rounding==='port';
    const el=document.createElement('div');
    el.className='smo-item';
    el.style.cssText='display:flex;align-items:center;gap:6px;background:var(--navy);border:1px solid var(--border);border-radius:10px;padding:7px 10px;margin-bottom:6px;';
    el.innerHTML=
      '<span style="font-family:Barlow Condensed,sans-serif;font-size:.75rem;color:var(--teal);font-weight:700;min-width:16px">'+(i+1)+'.</span>'+
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+colour+';flex-shrink:0"></span>'+
      '<span style="font-family:Barlow Condensed,sans-serif;font-weight:800;font-size:.95rem;flex:1">'+(m?m.name:entry.id)+'</span>'+
      '<button onclick="setRounding('+i+',\'port\')" style="font-size:.65rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 7px;border-radius:6px;border:1px solid '+(isPort?'#e63946':'var(--border)')+';background:'+(isPort?'rgba(230,57,70,.2)':'transparent')+';color:'+(isPort?'#e63946':'var(--muted)')+';cursor:pointer">◄ Port</button>'+
      '<button onclick="setRounding('+i+',\'stbd\')" style="font-size:.65rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 7px;border-radius:6px;border:1px solid '+(isPort?'var(--border)':'#2dc653')+';background:'+(isPort?'transparent':'rgba(45,198,83,.2)')+';color:'+(isPort?'var(--muted)':'#2dc653')+';cursor:pointer">Stbd ►</button>'+
      '<span onclick="removeMarkFromSequence('+i+')" style="color:var(--muted);cursor:pointer;font-size:.9rem;padding:0 2px;line-height:1" title="Remove">✕</span>';
    list.appendChild(el);
  });
}
function updateWind(v){
  windDeg=parseInt(v);
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const dir=dirs[Math.round(windDeg/22.5)%16];
  document.getElementById('windDegLabel').textContent=windDeg+'° '+dir;
}
async function publishCourse(){
  if(!courseMarks.length){toast('Select at least one mark');return;}
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const dir=dirs[Math.round(windDeg/22.5)%16];
  const name='S/F – '+courseMarks.map(x=>{const m=MARKS.find(mk=>mk.id===x.id);return m?m.name:x.id;}).join(' – ')+' – Finish';
  const course={
    id:'current',
    name,
    marks:courseMarks,  // [{id, rounding}]
    windDeg,
    windDir:dir,
    race_name:selectedRace?selectedRace.label:'',
    published_at:new Date().toISOString()
  };
  setSyncStatus('syncing');
  const ok=await sbSaveCourse(course);
  if(ok){
    publishedCourse=course;
    setSyncStatus('ok');
    renderCourseDiagram();
    toast('✅ Course published to all skippers!');
  } else {
    setSyncStatus('offline');
    toast('⚠ Could not save to database');
  }
}
function buildPinMgmtList(){
  const list=document.getElementById('pinMgmtList'); if(!list)return;
  list.innerHTML='';
  boats.forEach(b=>{
    const pin=getBoatPin(b.id);
    const row=document.createElement('div');
    row.id='pinrow-'+b.id;
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;background:var(--navy);border-radius:10px;padding:9px 12px;margin-bottom:5px;';
    row.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<span style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:.9rem">'+b.name+'</span>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<span style="font-family:Barlow Condensed,sans-serif;font-size:.85rem;color:var(--muted);letter-spacing:.15em">'+pin+'</span>'+
        '<button onclick="openChangePinForBoat(\''+b.id+'\')" style="font-size:.7rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--teal);cursor:pointer">PIN</button>'+
        '<button onclick="deleteBoat(\''+b.id+'\')" style="font-size:.7rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(230,57,70,.4);background:transparent;color:#e63946;cursor:pointer">Delete</button>'+
      '</div>';
    list.appendChild(row);
  });
  const roRow=document.createElement('div');
  roRow.style.cssText='display:flex;align-items:center;justify-content:space-between;background:rgba(254,224,30,.06);border:1px solid rgba(254,224,30,.2);border-radius:10px;padding:9px 12px;margin-top:4px;';
  roRow.innerHTML=
    '<div style="display:flex;align-items:center;gap:8px">'+
      '<span style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:.9rem;color:var(--ro)">🎌 Race Officer</span>'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:6px">'+
      '<span style="font-family:Barlow Condensed,sans-serif;font-size:.85rem;color:var(--muted);letter-spacing:.15em">'+getRoPin()+'</span>'+
      '<button onclick="openChangePinForBoat(\'ro\')" style="font-size:.7rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(254,224,30,.4);background:transparent;color:var(--ro);cursor:pointer">PIN</button>'+
    '</div>';
  list.appendChild(roRow);
}

async function deleteBoat(id){
  const b=boats.find(x=>x.id===id);
  if(!b){return;}
  if(!confirm('Delete '+b.name+'?\n\nThis will remove the boat and all its crew from the database. This cannot be undone.')){return;}

  // Remove from DB — cascade will delete crew too
  const ok=await sbFetch('/rest/v1/boats?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});
  if(ok===null){toast('⚠ Could not delete from database');return;}

  // Remove from in-memory list
  boats=boats.filter(x=>x.id!==id);

  // Remove from localStorage custom list
  const c=loadCustom().filter(x=>x.id!==id);
  saveCustom(c);

  // Remove pin/config cache
  try{localStorage.removeItem('pin_'+id);localStorage.removeItem('cfg_'+id);}catch(e){}

  // Refresh the panel and boat grid
  buildPinMgmtList();
  toast('✅ '+b.name+' deleted');
}
function clearCourse(){
  courseMarks=[];
  document.querySelectorAll('.mark-toggle').forEach(el=>el.classList.remove('selected'));
  renderSelectedOrder();
}
function shareRegistrationInvite(){
  if(!nextRace){toast('No upcoming race found');return;}

  const raceName=nextRace.label;
  const raceDate=nextRace.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'});
  const raceTime=nextRace.date.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  const appUrl='https://gbscracing.netlify.app';

  const msg=
    '⛵ *GBSC Racing — Registration Open*\n\n'+
    '*'+raceName+'*\n'+
    raceDate+' · '+raceTime+'\n\n'+
    'Register your boat in the racing app:\n'+
    appUrl+'\n\n'+
    '_Open the link, select your boat and tap Register._';

  if(isMobile()){
    window.open('https://api.whatsapp.com/send?text='+encodeURIComponent(msg),'_blank');
  } else {
    // On desktop copy to clipboard and prompt to paste into WhatsApp Web
    navigator.clipboard.writeText(msg).then(()=>{
      toast('📋 Message copied — paste into WhatsApp');
    }).catch(()=>{
      // Fallback — show in a prompt so they can copy manually
      window.prompt('Copy this message and paste into WhatsApp:',msg);
    });
  }
}

async function loadRegistrations(){
  const list=document.getElementById('regList');
  if(!nextRace){list.innerHTML='<div class="empty-state" style="padding:16px"><div class="icon">⛵</div>No upcoming race found</div>';return;}
  list.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:8px 0">Loading…</div>';
  const regs=await sbLoadRegistrations(nextRace);
  registeredBoatIds=new Set(regs.map(r=>r.boat_id));
  if(!regs.length){
    list.innerHTML='<div class="empty-state" style="padding:16px"><div class="icon" style="font-size:1.6rem">⛵</div><div>No boats registered yet</div></div>';
    return;
  }
  list.innerHTML='';
  // Sort by registration time
  regs.sort((a,b)=>new Date(a.registered_at)-new Date(b.registered_at));
  regs.forEach((r,i)=>{
    const boat=boats.find(b=>b.id===r.boat_id);
    const icon=boat?boat.icon:'⛵';
    const name=boat?boat.name:r.boat_id;
    const t=new Date(r.registered_at).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
    const row=document.createElement('div'); row.className='reg-row';
    row.innerHTML=
      '<div style="display:flex;align-items:center;gap:10px">'+
        '<span style="font-size:1.2rem">'+icon+'</span>'+
        '<div><div class="reg-boat-name">'+name+'</div>'+
        '<div class="reg-meta">Registered '+t+'</div></div>'+
      '</div>'+
      '<div class="reg-status paid">#'+(i+1)+'</div>';
    list.appendChild(row);
  });
}

// ═══════════════════════════════════════════════════════════════
// HALSAIL RESULTS
// ═══════════════════════════════════════════════════════════════
const HAL_URL='https://halsail.com/HalApi';
const HAL_CLUB=3725;
// Match any class name containing these strings (case-insensitive)
const HAL_IRC_MATCH='irc';
const HAL_ECHO_MATCH=/echo|cru.*e\b|\be.*cru/i;

function isIrcClass(name){ return name.toLowerCase().includes(HAL_IRC_MATCH); }
function isEchoClass(name){ return HAL_ECHO_MATCH.test(name); }

let halSchedule=null;       // raw GetSchedule response
let halSeriesList=[];        // [{label, ircId, echoId}] — one per series name
let halCurrentFleet='irc';  // 'irc' | 'echo'
let halCurrentSeries=null;  // currently selected {label, ircId, echoId}
let halResultsCache={};     // seriesId -> GetSeriesResult response
let halResultsLoaded=false;

// Halsail fetch — tries direct first, falls back to Supabase proxy if CORS blocks it
const HAL_PROXY=SB_URL+'/functions/v1/halsail-proxy'; // Edge Function (deploy if needed)
let halUsesProxy=false;

async function halFetch(path){
  const url=(halUsesProxy?HAL_PROXY+'?path=':HAL_URL)+path;
  const opts=halUsesProxy?{headers:{...SBH}}:{mode:'cors'};
  try{
    const r=await fetch(url,opts);
    if(!r.ok){ console.error('Halsail',r.status,path); return {_err:'HTTP '+r.status}; }
    return await r.json();
  }catch(e){
    // If direct fetch fails with a TypeError (CORS / network), try proxy once
    if(!halUsesProxy&&(e instanceof TypeError)){
      console.warn('Halsail direct blocked, trying proxy',e.message);
      halUsesProxy=true;
      return halFetch(path);
    }
    console.error('Halsail fetch error',e.message,path);
    return {_err: e.message||'Network error'};
  }
}

async function refreshResults(){
  halResultsLoaded=false;
  halResultsCache={};
  halSeriesList=[];
  document.getElementById('resultSeriesSelect').innerHTML='<option value="">Loading…</option>';
  document.getElementById('resultsContent').innerHTML=
    '<div class="empty-state"><div class="icon" style="font-size:1.6rem">⏳</div><div>Refreshing from Halsail…</div></div>';
  await loadResultsIfNeeded();
}
async function loadResultsIfNeeded(){
  if(halResultsLoaded) return;
  halResultsLoaded=true;
  const wrap=document.getElementById('resultsContent');
  wrap.innerHTML='<div class="empty-state"><div class="icon" style="font-size:1.6rem">⏳</div><div>Loading GBSC results from Halsail…</div></div>';

  const schedule=await halFetch('/GetSchedule/'+HAL_CLUB);

  if(!schedule||schedule._err||!Array.isArray(schedule)){
    const errMsg=schedule&&schedule._err?schedule._err:'No data returned';
    halResultsLoaded=false; // allow retry
    wrap.innerHTML=`
      <div class="empty-state">
        <div class="icon">⚠</div>
        <div style="margin-bottom:10px">Could not reach Halsail<br><span style="font-size:.75rem;color:var(--muted)">${errMsg}</span></div>
        <button class="btn btn-ghost" style="padding:8px 16px" onclick="halResultsLoaded=false;loadResultsIfNeeded()">Try Again</button>
      </div>`;
    return;
  }
  halSchedule=schedule;

  // Build series list — find all unique series that have both IRC and ECHO entries
  const seriesMap={};
  schedule.forEach(r=>{
    const key=r.Series;
    if(!seriesMap[key]) seriesMap[key]={label:key,ircId:null,echoId:null,latestStart:null};
    if(isIrcClass(r.Class))  seriesMap[key].ircId=r.SeryID;
    if(isEchoClass(r.Class)) seriesMap[key].echoId=r.SeryID;
    // Track most recent start to sort
    const d=new Date(r.Start);
    if(!seriesMap[key].latestStart||d>seriesMap[key].latestStart) seriesMap[key].latestStart=d;
  });

  // Keep only series with at least one of IRC/ECHO
  halSeriesList=Object.values(seriesMap)
    .filter(s=>s.ircId||s.echoId)
    .sort((a,b)=>b.latestStart-a.latestStart);

  // Populate selector
  const sel=document.getElementById('resultSeriesSelect');
  sel.innerHTML='';
  halSeriesList.forEach((s,i)=>{
    const o=document.createElement('option');
    o.value=i;
    o.textContent=s.label;
    sel.appendChild(o);
  });

  if(halSeriesList.length){
    halCurrentSeries=halSeriesList[0];
    await renderResultsForSeries(halCurrentSeries);
  } else {
    document.getElementById('resultsContent').innerHTML=
      '<div class="empty-state"><div class="icon">🏆</div><div>No IRC or ECHO cruiser series found</div></div>';
  }
}

async function onResultSeriesChange(){
  const i=parseInt(document.getElementById('resultSeriesSelect').value);
  if(isNaN(i)) return;
  halCurrentSeries=halSeriesList[i];
  await renderResultsForSeries(halCurrentSeries);
}

function showFleet(fleet){
  halCurrentFleet=fleet;
  document.getElementById('ircBtn').className='';
  document.getElementById('echoBtn').className='';
  document.getElementById('ircBtn').style.cssText='font-family:Barlow Condensed,sans-serif;font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:7px 12px;border-radius:8px;cursor:pointer;'+(fleet==='irc'?'border:1px solid var(--teal);background:var(--teal);color:var(--navy);':'border:1px solid var(--border);background:transparent;color:var(--muted);');
  document.getElementById('echoBtn').style.cssText='font-family:Barlow Condensed,sans-serif;font-size:.75rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;padding:7px 12px;border-radius:8px;cursor:pointer;'+(fleet==='echo'?'border:1px solid var(--teal);background:var(--teal);color:var(--navy);':'border:1px solid var(--border);background:transparent;color:var(--muted);');
  if(halCurrentSeries) renderResultsForSeries(halCurrentSeries);
}

async function renderResultsForSeries(series){
  const seriesId=halCurrentFleet==='irc'?series.ircId:series.echoId;
  const fleetLabel=halCurrentFleet==='irc'?'Cruiser (IRC)':'Cruiser (ECHO)';
  const wrap=document.getElementById('resultsContent');

  if(!seriesId){
    wrap.innerHTML='<div class="empty-state"><div class="icon">🏆</div><div>No '+fleetLabel+' results for this series</div></div>';
    return;
  }

  wrap.innerHTML='<div class="empty-state"><div class="icon" style="font-size:1.4rem">⏳</div><div>Loading…</div></div>';

  // Use cache if available
  if(!halResultsCache[seriesId]){
    const data=await halFetch('/GetSeriesResult/'+seriesId);
    if(!data||data._err){
      wrap.innerHTML=`<div class="empty-state"><div class="icon">⚠</div><div>Could not load results<br><span style="font-size:.75rem;color:var(--muted)">${data&&data._err?data._err:'No data'}</span></div></div>`;
      return;
    }
    halResultsCache[seriesId]=data;
  }
  const data=halResultsCache[seriesId];
  buildResultsTable(data, series.label, fleetLabel, wrap);
}

function buildResultsTable(data, seriesLabel, fleetLabel, wrap){
  const resultBoats=data.ResultsOverall||[];
  if(!resultBoats.length){ wrap.innerHTML='<div class="empty-state"><div class="icon">🏆</div><div>No results yet</div></div>'; return; }

  // Find my boat's position based on helm name matching current boat name (best effort)
  const myBoatName=currentBoat&&!isRO?currentBoat.name.toLowerCase():'';
  const myResult=resultBoats.find(b=>{
    const helm=(b.HelmOrGuestName||'').toLowerCase();
    const boatName=myBoatName;
    return boatName&&(helm.includes(boatName)||boatName.includes(helm.split(' ')[0]));
  });

  // Gather all unique RaceIDs in order
  const raceIds=[];
  resultBoats.forEach(b=>(b.Results||[]).forEach(r=>{ if(!raceIds.includes(r.RaceID)) raceIds.push(r.RaceID); }));
  raceIds.sort((a,b)=>a-b);

  // My position summary card
  let summaryHtml='';
  if(myResult){
    summaryHtml=`<div class="results-my-pos">
      <div class="results-my-rank">${myResult.RankString||'—'}</div>
      <div>
        <div class="results-my-label">${currentBoat.name} — ${fleetLabel}</div>
        <div class="results-my-pts">${myResult.NetPointsString} pts · ${myResult.Results?myResult.Results.length:0} races</div>
      </div>
    </div>`;
  }

  // Race column headers
  const raceHeaders=raceIds.map((_,i)=>`<th class="num" style="min-width:32px">R${i+1}</th>`).join('');

  // Build a lookup: helm name (lowercase) -> boat name from our fleet
  // This matches Halsail entries to GBSC boat names
  const helmToBoat={};
  boats.forEach(b=>{
    // Each boat's helm in Halsail is typically the skipper's name
    // We match on boat name words appearing in the helm field
    const bName=b.name.toLowerCase();
    helmToBoat[bName]=b.name;
  });

  function resolveBoatDisplay(halBoat){
    const helm=halBoat.HelmOrGuestName||'—';
    const helmLower=helm.toLowerCase();
    // Try to match against our boat names
    const matched=boats.find(b=>{
      const bName=b.name.toLowerCase();
      // Match if boat name appears in helm, or first word of helm appears in boat name
      return helmLower.includes(bName)||bName.includes(helmLower.split(' ')[0]);
    });
    if(matched){
      return {primary:matched.name, secondary:helm, icon:matched.icon};
    }
    return {primary:helm, secondary:null, icon:null};
  }

  // Rows
  const rows=resultBoats.map((b,bi)=>{
    const rank=b.Rank||bi+1;
    const podiumClass=rank===1?'podium-1':rank===2?'podium-2':rank===3?'podium-3':'';
    const isMe=b===myResult;
    const display=resolveBoatDisplay(b);

    const nameCell=display.secondary
      ? `<div style="font-weight:600;line-height:1.2">${display.icon?display.icon+' ':''} ${display.primary}</div>`+
        `<div style="font-size:.7rem;color:var(--muted)">${display.secondary}</div>`
      : `<div style="font-weight:600">${display.primary}</div>`;

    // Per-race points cells
    const raceCells=raceIds.map(rid=>{
      const r=(b.Results||[]).find(x=>x.RaceID===rid);
      if(!r) return '<td class="num"><span class="race-pts dns">—</span></td>';
      const pts=r.PointsString||'';
      const isDiscard=pts.startsWith('(');
      const isOk=r.StatusString==='OK'||r.StatusString==='';
      const cls=isDiscard?'discarded':(!isOk?'dns':'ok');
      return `<td class="num"><span class="race-pts ${cls}">${pts.replace(/[()]/g,'')}</span></td>`;
    }).join('');

    return `<tr class="${isMe?'my-boat':''} ${podiumClass}">
      <td class="rank-cell">${rank}</td>
      <td class="boat-name${isMe?' ':''}">${nameCell}</td>
      <td class="num" style="color:var(--teal);font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:800">${b.NetPointsString}</td>
      ${raceCells}
    </tr>`;
  }).join('');

  wrap.innerHTML=`
    ${summaryHtml}
    <div class="results-race-header">
      <div class="results-series-name">${seriesLabel} · ${fleetLabel}</div>
      <div class="results-updated">via Halsail</div>
    </div>
    <div style="overflow-x:auto;">
      <table class="results-table">
        <thead>
          <tr>
            <th style="width:28px"></th>
            <th>Boat</th>
            <th class="num">Pts</th>
            ${raceHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:.7rem;color:var(--muted);margin-top:10px;text-align:center">
      Points in () are discards · Red = DNS/DNF/OCS
    </div>
  `;
}
function closeSheet(id){
  document.getElementById(id).classList.remove('open');
  if(id==='collectSheet'||id==='pnSheet') renderCrew();
}

// ── Crew Pay Page (opened via shared QR link) ─────────────────
function checkPayHash(){
  const hash=window.location.hash;
  if(!hash.startsWith('#pay=')) return;
  try{
    const data=JSON.parse(decodeURIComponent(escape(atob(hash.slice(5)))));
    showCrewPayPage(data);
  }catch(e){ console.warn('Invalid pay hash',e); }
}
function showCrewPayPage(data){
  // Build a standalone pay page that overlays everything
  const tot=data.crew.reduce((a,c)=>a+c.a,0);
  const crewRows=data.crew.map(c=>`
    <div style="display:flex;justify-content:space-between;align-items:center;
      padding:10px 0;border-bottom:1px solid rgba(255,255,255,.08);">
      <div>
        <div style="font-weight:600;font-size:.95rem">${c.n}</div>
        <div style="font-size:.72rem;color:#7a8fa6;text-transform:uppercase;
          letter-spacing:.06em">${c.t==='full'?'Full Member':c.t==='crew'?'Crew Member':c.t==='student'?'Student':c.t==='kid'?'Junior':'Visitor'}</div>
      </div>
      <span style="font-family:Barlow Condensed,sans-serif;font-size:1.2rem;
        font-weight:800;color:#f0f4f8">€${c.a}</span>
    </div>`).join('');

  const revBtn=data.rev?`
    <a href="https://revolut.me/${data.rev}" target="_blank"
      style="display:flex;align-items:center;justify-content:center;gap:10px;
      background:linear-gradient(135deg,#191c82,#6e40d8);color:white;border-radius:12px;
      padding:14px;text-decoration:none;font-family:Barlow Condensed,sans-serif;
      font-size:1rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px;">
      💜 Pay €${tot} via Revolut
    </a>`:'';

  const stripeBtn=data.stripe?`
    <a href="${data.stripe}" target="_blank"
      style="display:flex;align-items:center;justify-content:center;gap:10px;
      background:linear-gradient(135deg,#0d6efd,#0dcaf0);color:white;border-radius:12px;
      padding:14px;text-decoration:none;font-family:Barlow Condensed,sans-serif;
      font-size:1rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:10px;">
      💳 Pay €${tot} by Card / Apple Pay / Google Pay
    </a>`:'';

  const noPayOptions=!data.rev&&!data.stripe?`
    <div style="background:rgba(255,255,255,.05);border-radius:10px;padding:14px;
      text-align:center;font-size:.85rem;color:#7a8fa6;margin-bottom:10px;">
      Pay your skipper directly — cash or Revolut
    </div>`:'';

  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:#0a1628;z-index:900;overflow-y:auto;'+
    'padding:24px 16px;font-family:Barlow,sans-serif;color:#f0f4f8;';
  overlay.innerHTML=`
    <div style="max-width:420px;margin:0 auto;">
      <div style="text-align:center;margin-bottom:20px;">
        <div style="font-family:Barlow Condensed,sans-serif;font-size:1.8rem;font-weight:800;
          letter-spacing:.04em;color:#00b4d8;margin-bottom:2px">GBSC Racing</div>
        <div style="font-size:.85rem;color:#7a8fa6">${data.race}</div>
      </div>
      <div style="background:#112240;border:1px solid rgba(0,180,216,.18);border-radius:14px;
        padding:16px;margin-bottom:16px;">
        <div style="font-size:.7rem;color:#7a8fa6;font-weight:600;letter-spacing:.1em;
          text-transform:uppercase;margin-bottom:8px">Race Fees Due — ${data.boat}</div>
        ${crewRows}
        <div style="display:flex;justify-content:space-between;padding-top:12px;margin-top:4px">
          <span style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:1rem;color:#f0f4f8">Total Due</span>
          <span style="font-family:Barlow Condensed,sans-serif;font-size:1.6rem;font-weight:800;color:#00b4d8">€${tot}</span>
        </div>
      </div>
      ${revBtn}${stripeBtn}${noPayOptions}
      <div style="text-align:center;font-size:.7rem;color:#7a8fa6;margin-top:16px">
        GBSC Racing App · Race fees collected on behalf of Galway Bay Sailing Club
      </div>
    </div>`;
  document.body.appendChild(overlay);
}
let _tt;
function toast(msg){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('show'),2600);}
document.addEventListener('click',function(e){
  ['collectSheet','editSheet','pnSheet','shareSheet','settingsSheet'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&el.classList.contains('open')&&e.target===el)closeSheet(id);
  });
});

// ═══════════════════════════════════════════════════════════════
// WIND WIDGET — Open-Meteo (no API key required)
// ═══════════════════════════════════════════════════════════════
const GBSC_LAT=53.2744, GBSC_LNG=-9.0490; // Galway Bay

async function loadWindWidget(){
  try{
    const url='/.netlify/functions/wind';
    const r=await fetch(url);
    if(!r.ok) throw new Error('HTTP '+r.status);
    const d=await r.json();
    const c=d.current;
    const spd=Math.round(c.wind_speed_10m);
    const gust=Math.round(c.wind_gusts_10m);
    const deg=Math.round(c.wind_direction_10m);

    // Cardinal direction
    const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dir=dirs[Math.round(deg/22.5)%16];

    // Beaufort scale
    const beaufort=spd<1?0:spd<4?1:spd<7?2:spd<11?3:spd<17?4:spd<22?5:spd<28?6:spd<34?7:spd<41?8:spd<48?9:spd<56?10:spd<64?11:12;
    const bNames=['Calm','Light air','Light breeze','Gentle breeze','Moderate breeze','Fresh breeze',
      'Strong breeze','Near gale','Gale','Strong gale','Storm','Violent storm','Hurricane'];

    // Rotate arrow emoji using a CSS transform on a Unicode arrow instead
    document.getElementById('windArrow').innerHTML=
      `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:rotate(${deg}deg);transition:transform .6s ease">
        <circle cx="16" cy="16" r="14" fill="rgba(0,174,239,.15)" stroke="rgba(0,174,239,.3)" stroke-width="1.5"/>
        <polygon points="16,4 20,22 16,19 12,22" fill="#00aeef"/>
        <circle cx="16" cy="16" r="3" fill="#00aeef"/>
      </svg>`;

    document.getElementById('windSpeed').textContent=spd+' kn'+(gust>spd+5?' (gusts '+gust+')':'');
    document.getElementById('windDir').textContent=`From ${dir} · ${deg}°`;
    document.getElementById('windBeaufort').textContent=`F${beaufort} · ${bNames[beaufort]}`;

  }catch(e){
    document.getElementById('windDir').textContent='Wind data unavailable';
    console.warn('Wind widget error:',e);
  }
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
checkPayHash();
loadWindWidget();
buildBoatGrid();
