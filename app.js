// ═══════════════════════════════════════════════════════════════
// CLUB CONFIG  (populated by /club-config.js edge function)
// ═══════════════════════════════════════════════════════════════
const _C = window.CLUB || {};
if(!window.CLUB) console.warn('window.CLUB not set — /club-config.js may have failed to load');

// Apply club branding immediately — before any async work
(function applyClubBranding(){
  const short  = _C.short || 'GBSC';
  const name   = _C.name  || 'Galway Bay Sailing Club';
  const logoUrl= _C.logoUrl|| _C.logoURL|| _C.logourl|| _C.logo_url|| _C.logo|| '';
  // Page title
  document.title = short + ' Racing \u2014 ' + name;
  // Header: logo image
  const img = document.getElementById('clubLogoImg');
  if(img && logoUrl){
    img.src = logoUrl;
    img.alt = short;
    img.style.display = '';
    const fb = document.getElementById('hlf');
    if(fb) fb.style.display = 'none';
  } else if(img && !logoUrl){
    // No logo URL — show text fallback immediately
    img.style.display = 'none';
    const fb = document.getElementById('hlf');
    if(fb){ fb.textContent = short; fb.style.display = 'block'; }
  }
  // Header: text labels
  const sl = document.getElementById('clubShortLabel');
  if(sl) sl.textContent = short + ' Racing';
  const fn = document.getElementById('clubFullName');
  if(fn) fn.textContent = name;
  // Optional club colour theme — overrides --teal CSS variable
  if(_C.primaryColor){
    document.documentElement.style.setProperty('--teal', _C.primaryColor);
    document.documentElement.style.setProperty('--border', _C.primaryColor.replace(/^#/, '') ? 'rgba('+hexToRgb(_C.primaryColor)+',0.18)' : '');
  }
  if(_C.roColor) document.documentElement.style.setProperty('--ro', _C.roColor);
})();
function hexToRgb(hex){
  const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}

// ── Supabase ──────────────────────────────────────────────────
const SB_URL = _C.sbUrl || '';
const SB_KEY = _C.sbKey || '';
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
  // Returns {pin, revolut_user} or null if offline
  const r=await sbFetch('/rest/v1/boats?id=eq.'+id+'&select=pin,revolut_user');
  if(!r||!r.length) return null;
  return r[0];
}
async function sbSaveBoatConfig(id,fields){
  // fields: any subset of {pin, revolut_user}
  return sbFetch('/rest/v1/boats?id=eq.'+id,{
    method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify(fields)
  });
}
async function sbLoadClubSettings(){
  // Full query including migration-020 columns
  const fullSelect=
    'stripe_link_member,stripe_link_student,stripe_link_visitor,'
    +'pre_race_window_hours,estella_url,worldtides_key,ro_revolut_user,'
    +'results_published_race_key,features,'
    +'logo_url,favicon_url,primary_color,ro_color,'
    +'start_lat,start_lng,wind_lat,wind_lng,'
    +'tide_station,tide_odm_offset,'
    +'fee_full,fee_crew,fee_visitor,fee_student,fee_kid,'
    +'visitor_max,crew_max_yrs,ro_pin,'
    +'noticeboard_url,results_url,hal_club,vapid_public_key';
  let r=await sbFetch('/rest/v1/settings?id=eq.club&select='+fullSelect);
  if(r&&r._err){
    // Migration 020 likely not run yet — fall back to base columns so features still load
    console.warn('sbLoadClubSettings: extended columns missing, falling back (run migration 020)');
    r=await sbFetch('/rest/v1/settings?id=eq.club&select='
      +'stripe_link_member,stripe_link_student,stripe_link_visitor,'
      +'pre_race_window_hours,estella_url,worldtides_key,ro_revolut_user,'
      +'results_published_race_key,features');
  }
  if(!r||r._err) return null;
  if(!r.length) return null;
  return r[0];
}
async function sbSaveClubSettings(fields){
  // Upsert: insert the row if it doesn't exist, merge if it does
  return sbFetch('/rest/v1/settings',{
    method:'POST',
    headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({id:'club',...fields})
  });
}
async function sbLoadCrew(id){const r=await sbFetch('/rest/v1/crew?boat_id=eq.'+id+'&order=id.asc');if(!r||r._err)return null;if(!r.length)return[];return r.map(x=>({id:x.id,first:x.first,last:x.last,type:x.type,joinYear:x.join_year,outings:x.outings,phone:x.phone||'',selected:x.selected||false,paid:false}));}
async function sbUpsertCrew(bid,p){return sbFetch('/rest/v1/crew?on_conflict=id',{method:'POST',headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({id:p.id,boat_id:bid,first:p.first,last:p.last,type:p.type,join_year:p.joinYear||null,outings:p.outings||0,phone:p.phone||null,selected:p.selected||false})});}
async function sbSetCrewSelected(crewId,selected){return sbFetch('/rest/v1/crew?id=eq.'+crewId,{method:'PATCH',headers:{...SBH,'Prefer':'return=minimal'},body:JSON.stringify({selected})});}
async function sbDeleteCrew(id){return sbFetch('/rest/v1/crew?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});}
async function sbSaveRaceRecord(rec){return sbFetch('/rest/v1/race_records?on_conflict=boat_id,race_key',{method:'POST',headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(rec)});}
async function sbUpsertRacePayment(data){
  return sbFetch('/rest/v1/race_payments?on_conflict=crew_id,race_key',{
    method:'POST',
    headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify(data)
  });
}
async function sbDeleteRacePayment(crewId,raceKey){
  return sbFetch('/rest/v1/race_payments?crew_id=eq.'+encodeURIComponent(crewId)+'&race_key=eq.'+encodeURIComponent(raceKey),{
    method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}
  });
}
async function sbLoadRacePayments(boatId,raceKey){
  return sbFetch('/rest/v1/race_payments?boat_id=eq.'+encodeURIComponent(boatId)+'&race_key=eq.'+encodeURIComponent(raceKey));
}
async function sbLoadRaceAttendees(boatId,key){
  return sbFetch('/rest/v1/race_attendees?boat_id=eq.'+encodeURIComponent(boatId)+'&race_key=eq.'+encodeURIComponent(key));
}
async function sbUpsertRaceAttendee(boatId,key,raceName,raceDate,crewId){
  return sbFetch('/rest/v1/race_attendees?on_conflict=boat_id,race_key,crew_id',{
    method:'POST',
    headers:{...SBH,'Prefer':'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({boat_id:boatId,race_key:key,race_name:raceName,race_date:raceDate,crew_id:crewId})
  });
}
async function sbDeleteRaceAttendee(boatId,key,crewId){
  return sbFetch('/rest/v1/race_attendees?boat_id=eq.'+encodeURIComponent(boatId)+'&race_key=eq.'+encodeURIComponent(key)+'&crew_id=eq.'+encodeURIComponent(crewId),{
    method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}
  });
}
async function sbLoadRaceRecords(key){
  const r=await sbFetch('/rest/v1/race_records?race_key=eq.'+encodeURIComponent(key)+'&order=submitted_at.asc');
  return r||[];
}
// Auto-save race record on every payment change — replaces manual Submit
function autoSaveRaceRecord(){
  const race=selectedRace||nextRace;
  if(!race||!currentBoat) return;
  const s=roster.filter(p=>p.selected);
  if(!s.length) return;
  const tot=s.reduce((a,p)=>a+fee(p),0);
  const paid=s.filter(p=>p.paid).reduce((a,p)=>a+fee(p),0);
  const byMethod={};
  s.filter(p=>p.paid).forEach(p=>{ const m=p.payMethod||'Unknown'; byMethod[m]=(byMethod[m]||0)+fee(p); });
  const settlement=[...new Set(s.filter(p=>p.paid).map(p=>p.payMethod).filter(Boolean))];
  sbSaveRaceRecord({
    boat_id:currentBoat.id,
    race_name:race.label,
    race_date:race.date.toISOString().split('T')[0],
    race_key:raceKey(race),
    crew_snapshot:s,
    total_due:tot,
    total_paid:paid,
    payment_methods:byMethod,
    settlement_methods:settlement
  });
}

// Increment visitor outings — called once when all crew transition to paid
function incrementVisitorOutings(){
  const s=roster.filter(p=>p.selected);
  const visitors=s.filter(p=>p.type==='visitor'&&!p._outingsIncremented);
  visitors.forEach(p=>{
    p._outingsIncremented=true;
    p.outings=(p.outings||0)+1;
    sbFetch('/rest/v1/crew?id=eq.'+p.id,{method:'PATCH',
      headers:{...SBH,'Prefer':'return=minimal'},
      body:JSON.stringify({outings:p.outings})});
  });
  if(visitors.length) renderCrew();
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
    notes: course.notes||'',
    published_at: course.published_at,
    start_line_id: course.startLineId||'club',
    finish_line_id: course.finishLineId||'club',
    // Course card fields (RCYC) — null for traditional mark-builder courses
    course_number: course.courseNumber||null,
    rounds: course.rounds||null
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
  let rounds=row.rounds||null;
  if(typeof rounds==='string'){try{rounds=JSON.parse(rounds);}catch(e){rounds=null;}}
  return{
    id: row.id,
    name: row.name,
    marks,
    windDeg: row.wind_deg,
    windDir: row.wind_dir,
    race_name: row.race_name,
    notes: row.notes||'',
    published_at: row.published_at,
    startLineId: row.start_line_id||'club',
    finishLineId: row.finish_line_id||'club',
    courseNumber: row.course_number||null,
    rounds
  };
}

// ── Skipper declarations (RCYC feature) ──────────────────────────────────────
async function sbLoadDeclaration(boatId, season){
  const r=await sbFetch('/rest/v1/skipper_declarations?boat_id=eq.'+boatId+'&season=eq.'+season+'&limit=1');
  if(!r||!r.length) return null;
  return r[0];
}
async function sbSaveDeclaration(boatId, skipperName, season){
  return sbFetch('/rest/v1/skipper_declarations?on_conflict=boat_id,season',{
    method:'POST',
    headers:{...SBH,'Prefer':'resolution=merge-duplicates,return=minimal'},
    body:JSON.stringify({
      boat_id:boatId, skipper_name:skipperName, season,
      read_sis:true, read_rrs:true, read_safety:true, accept_responsibility:true,
      declared_at:new Date().toISOString()
    })
  });
}

// ── Course card (RCYC feature) ────────────────────────────────────────────────
async function sbLoadCourseCard(){
  const r=await sbFetch('/rest/v1/course_card_courses?order=number.asc');
  if(!r||r._err) return [];
  return r;
}

// ── Series fees (RCYC feature) ────────────────────────────────────────────────
async function sbLoadSeriesFees(boatId, season){
  const r=await sbFetch('/rest/v1/series_fees?boat_id=eq.'+boatId+'&season=eq.'+season+'&order=paid_at.asc');
  if(!r||r._err) return [];
  return r;
}
async function sbSaveSeriesFee(boatId, seriesName, season, amount, method, notes){
  return sbFetch('/rest/v1/series_fees',{
    method:'POST',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({boat_id:boatId,series_name:seriesName,season,amount,method,notes:notes||null,paid_at:new Date().toISOString()})
  });
}
async function sbDeleteSeriesFee(id){
  return sbFetch('/rest/v1/series_fees?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});
}
function setSyncStatus(s){const el=document.getElementById('syncStatus');if(!el)return;if(s==='syncing'){el.textContent='⏳';el.style.color='var(--gold)';}else if(s==='ok'){el.textContent='☁';el.style.color='var(--success)';setTimeout(()=>{el.textContent='';},3000);}else{el.textContent='⚠';el.style.color='var(--warn)';}}

// ═══════════════════════════════════════════════════════════════
// MARKS DATA  (from GBSC Sailing Instructions 2026, Appendix A)
// ═══════════════════════════════════════════════════════════════
let MARKS = [
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
// ── Named start / finish lines ────────────────────────────────────────────
// Each line is defined by two endpoints: lat1/lng1 = pin end,
// lat2/lng2 = committee boat / outer mark end.
// TODO: Replace placeholder coords for Ballyvaughan and Galway Docks
//       with the real transits / GPS fixes once confirmed on the water.
let LINES=[
  { id:'club',
    name:'Club Start/Finish',
    lat1:_C.startLat != null ? _C.startLat : 53+(14.5687/60),
    lng1:_C.startLng != null ? _C.startLng : -(8+(58.6148/60)),
    lat2:53+(14.7106/60), lng2:-(8+(58.6084/60)),  // committee boat end  53°14.7106'N 008°58.6084'W
    isDefault:true, isActive:true },
  { id:'ballyvaughan',
    name:'Ballyvaughan Finish',
    // TODO: replace with real finish-line coords once confirmed
    lat1:53.1165, lng1:-9.1490,
    lat2:53.1155, lng2:-9.1495,
    isActive:true },
  { id:'galway_docks',
    name:'Galway Docks Start',
    lat1:53+(16.0355/60), lng1:-(9+(2.6577/60)),  // 53°16.0355'N 009°02.6577'W
    lat2:53+(16.0090/60), lng2:-(9+(2.8005/60)),  // 53°16.0090'N 009°02.8005'W
    isActive:true },
];
function getLineById(id){ return LINES.find(l=>l.id===id)||LINES[0]; }
function lineMidpoint(l){ return {lat:(l.lat1+l.lat2)/2, lng:(l.lng1+l.lng2)/2}; }

// Legacy single-point reference — kept so any code not yet migrated still works
const START_POS = lineMidpoint(LINES[0]);

// ═══════════════════════════════════════════════════════════════
// MAP TILE BACKGROUND
// ═══════════════════════════════════════════════════════════════
let mapTileMode=(()=>{try{return localStorage.getItem('mapTileMode')||'off';}catch(e){return 'off';}})();
function toggleMapMode(){
  mapTileMode=mapTileMode==='off'?'satellite':'off';
  try{localStorage.setItem('mapTileMode',mapTileMode);}catch(e){}
  renderCourseDiagram();
}
function buildSatTiles(refLat,refLng,cosLat,scale,ox,oy,W,H){
  const z=13;
  // Inverse projection: SVG px → lat/lng
  const s2g=(sx,sy)=>({lng:(sx-ox)/scale/cosLat+refLng, lat:-((sy-oy)/scale)+refLat});
  const tl=s2g(0,0), br=s2g(W,H);
  // Tile index helpers
  const lngToTX=lng=>Math.floor((lng+180)/360*Math.pow(2,z));
  const latToTY=lat=>{const r=lat*Math.PI/180;return Math.floor((1-Math.log(Math.tan(r)+1/Math.cos(r))/Math.PI)/2*Math.pow(2,z));};
  const txToLng=tx=>tx/Math.pow(2,z)*360-180;
  const tyToLat=ty=>{const n=Math.PI*(1-2*ty/Math.pow(2,z));return 180/Math.PI*Math.atan((Math.exp(n)-Math.exp(-n))/2);};
  const tx0=lngToTX(tl.lng)-1, tx1=lngToTX(br.lng)+1;
  const ty0=latToTY(tl.lat)-1, ty1=latToTY(br.lat)+1;
  // Forward projection: lat/lng → SVG px
  const g2s=(lat,lng)=>({x:(lng-refLng)*cosLat*scale+ox, y:-(lat-refLat)*scale+oy});
  const parts=[];
  for(let tx=tx0;tx<=tx1;tx++){
    for(let ty=ty0;ty<=ty1;ty++){
      const lng0=txToLng(tx),lng1=txToLng(tx+1);
      const lat0=tyToLat(ty),lat1=tyToLat(ty+1); // lat0 > lat1 (top > bottom)
      const p0=g2s(lat0,lng0),p1=g2s(lat1,lng1);
      const url=`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${ty}/${tx}`;
      parts.push(`<image href="${url}" x="${p0.x.toFixed(1)}" y="${p0.y.toFixed(1)}" width="${(p1.x-p0.x).toFixed(1)}" height="${(p1.y-p0.y).toFixed(1)}" preserveAspectRatio="none"/>`);
    }
  }
  // Semi-transparent dark overlay so marks stay readable
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="rgba(3,10,28,0.45)"/>`);
  return parts;
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS & STATE
// ═══════════════════════════════════════════════════════════════
// Fees/limits/PIN start with env-var or hard-coded defaults; overwritten from DB
// after settings load (see loadClubSettings below).
let FEES=Object.assign({full:4,crew:4,visitor:10,student:5,kid:0}, _C.fees||{});
let VISITOR_MAX=_C.visitorMax||6;
let CREW_MAX_YRS=_C.crewMaxYrs||2;
const CY=new Date().getFullYear();
let RO_PIN=_C.roPin||'0000';

// ── Per-club feature flags ────────────────────────────────────────────────────
// Sourced from window.CLUB.features; safe defaults preserve existing GBSC behaviour.
// Behaviour flags — env var sets the initial value; DB overrides via applyAllFeatureVisibility().
const FEAT={
  feeModel:    (_C.features&&_C.features.feeModel)||'per-race',  // 'per-race' | 'per-series'
  declaration: !!(_C.features&&_C.features.declaration),         // true = skipper declaration gate
  courseCard:  !!(_C.features&&_C.features.courseCard),          // true = RO course card picker
};

// Map from feature key → tile element IDs that applyAllFeatureVisibility() shows/hides.
// A key can map to multiple tiles (e.g. 'feeStatements' controls both the RO and skipper tiles).
const FEAT_TILE_MAP={
  // RO tiles
  startTimer:     ['tile-ro-startTimer'],
  halsail:        ['tile-ro-halsail'],
  paymentReport:  ['tile-ro-paymentReport'],
  marksManager:   ['tile-ro-marksManager'],
  publishResults: ['tile-ro-publishResults'],
  usageStats:     ['tile-ro-usageStats'],
  feeStatements:  ['tile-ro-feeStatements','tile-sk-feeHistory'],
  viewCourse:     ['tile-ro-viewCourse'],
  registrations:  ['tile-ro-registrations'],
  protests:       ['tile-ro-protests'],
  boatMgmt:       ['tile-ro-boatMgmt'],
  clubSettings:   ['tile-ro-clubSettings'],
  raceSchedule:   ['tile-ro-raceSchedule'],
  // Skipper tiles
  crew:           ['tile-sk-crew'],
  fees:           ['tile-sk-fees'],
  protest:        ['tile-sk-protest'],
  boatSettings:   ['tile-sk-settings'],
  feeHistory:     ['tile-sk-feeHistory'],
  // Public tiles
  selfPay:        ['tile-pub-selfPay'],
  weather:        ['tile-pub-weather'],
  calendar:       ['tile-pub-calendar'],
  documents:      ['tile-pub-documents'],
  results:        ['tile-pub-results'],
  // Additive-only tiles (hidden by default, DB turns them on)
  courseCard:     ['roCourseCardTile'],
};

// Default visibility for each tile-mapped feature (true=shown, false=hidden by default).
// DB features column overrides these at startup via applyAllFeatureVisibility().
const FEAT_DEFAULTS={
  startTimer:true, halsail:true, paymentReport:true, marksManager:true,
  publishResults:true, usageStats:true, feeStatements:true, viewCourse:true,
  registrations:true, protests:true, boatMgmt:true, clubSettings:true,
  raceSchedule:true,
  courseCard:false,
  crew:true, fees:true, protest:true, boatSettings:true, feeHistory:true,
  selfPay:true, weather:true, calendar:true, documents:true, results:true,
};
// Feature catalog for the admin panel UI (rendered by renderFeaturesPanel).
const FEAT_CATALOG=[
  {key:'feeModel',    label:'Fee Model',               type:'select', options:['per-race','per-series'], group:'Behaviour'},
  {key:'declaration', label:'Skipper Declaration Gate', type:'bool',                                     group:'Behaviour'},
  {key:'viewCourse',     label:'View / Publish Course', type:'bool', group:'RO Tiles'},
  {key:'courseCard',     label:'Course Card Picker',    type:'bool', group:'RO Tiles'},
  {key:'registrations',  label:'Registrations',         type:'bool', group:'RO Tiles'},
  {key:'protests',       label:'Protests',              type:'bool', group:'RO Tiles'},
  {key:'boatMgmt',       label:'Boat Management',       type:'bool', group:'RO Tiles'},
  {key:'clubSettings',   label:'Club Settings',         type:'bool', group:'RO Tiles'},
  {key:'raceSchedule',   label:'Race Schedule',         type:'bool', group:'RO Tiles'},
  {key:'usageStats',     label:'Usage Stats',           type:'bool', group:'RO Tiles'},
  {key:'startTimer',     label:'Start Timer',           type:'bool', group:'RO Tiles'},
  {key:'halsail',        label:'Halsail',               type:'bool', group:'RO Tiles'},
  {key:'publishResults', label:'Publish Results',       type:'bool', group:'RO Tiles'},
  {key:'feeStatements',  label:'Fee Statements',        type:'bool', group:'RO Tiles'},
  {key:'paymentReport',  label:'Payment Report',        type:'bool', group:'RO Tiles'},
  {key:'marksManager',   label:'Marks Manager',         type:'bool', group:'RO Tiles'},
  {key:'crew',         label:'Crew Roster',   type:'bool', group:'Skipper Tiles'},
  {key:'fees',         label:'Fees',          type:'bool', group:'Skipper Tiles'},
  {key:'protest',      label:'Protest',       type:'bool', group:'Skipper Tiles'},
  {key:'boatSettings', label:'Boat Settings', type:'bool', group:'Skipper Tiles'},
  {key:'feeHistory',   label:'Fee History',   type:'bool', group:'Skipper Tiles'},
  {key:'selfPay',   label:'Self Pay',  type:'bool', group:'Public Tiles'},
  {key:'weather',   label:'Weather',   type:'bool', group:'Public Tiles'},
  {key:'calendar',  label:'Calendar',  type:'bool', group:'Public Tiles'},
  {key:'documents', label:'Documents', type:'bool', group:'Public Tiles'},
  {key:'results',   label:'Results',   type:'bool', group:'Public Tiles'},
];
function liftVeil(){
  const v=document.getElementById('appVeil');
  if(!v||v.dataset.lifted) return;
  v.dataset.lifted='1';
  v.style.opacity='0';
  setTimeout(()=>v.remove(),300);
}

// Apply any locally-cached features RIGHT NOW (synchronous — no DB wait, no race condition).
// This ensures tiles are hidden/shown correctly even before loadClubSettings() resolves.
// Lifts the startup veil once branding + feature flags are in place.
(function applyLocalFeatures(){
  try{
    const f=JSON.parse(localStorage.getItem('__features__')||'null');
    if(!f||typeof f!=='object'){ liftVeil(); return; }
    Object.keys(FEAT_TILE_MAP).forEach(key=>{
      if(f[key]===undefined) return;
      const on=!!f[key];
      FEAT_TILE_MAP[key].forEach(id=>{
        const el=document.getElementById(id);
        if(el) el.style.display=on?'':'none';
      });
    });
    if(f.feeModel!==undefined) FEAT.feeModel=f.feeModel;
    if(f.declaration!==undefined) FEAT.declaration=!!f.declaration;
    if(f.courseCard!==undefined) FEAT.courseCard=!!f.courseCard;
  }catch(e){}
  liftVeil();
})();

// Convenience: document links for the declaration form (RCYC-specific)
const DECL_DOCS=Object.assign(
  {sis:'',rrs:'https://www.racingrulesofsailing.org/',safety:''},
  _C.declarationDocs||{}
);

let boats=[], currentBoat=null, isRO=false, isGuest=false, currentSessionId=null;
let roster=[], allRaces=[], selectedRace=null, nextRace=null;
let editingId=null, pnId=null, pnMethod=null;
let windDeg=225, forecastWindDeg=null;
let courseMarks=[];
let publishedCourse=null;
let selectedStartLineId='club';   // id from LINES[]
let selectedFinishLineId='club';  // can differ for destination-finish races
let registeredBoatIds=new Set(); // boat IDs registered for the next race
let roDashRegsCount=0, roDashProtestsCount=0, roDashCoursePublished=false;

// ═══════════════════════════════════════════════════════════════
// RACE SCHEDULE — loaded from DB (races table)
// ═══════════════════════════════════════════════════════════════
// allRaces and nextRace are populated by loadRaceSchedule() (DB) or buildAllRaces() (GBSC fallback).

async function loadRaceSchedule(){
  const rows=await sbFetch('/rest/v1/races?active=eq.true&order=race_date.asc,sort_order.asc');
  if(!rows||rows._err||!rows.length){
    console.warn('Could not load race schedule from DB');
    return;
  }
  allRaces=rows.map(r=>{
    const d=new Date(r.race_date+'T00:00:00'); // local midnight, no UTC shift
    d.setHours(r.start_hour||19, r.start_min||0, 0, 0);
    return {id:r.id, label:r.label, date:d, series:r.series||''};
  });
  nextRace=getNextRace();
}

// GBSC hardcoded schedule — used as fallback if races table is empty / DB unavailable
const WED=[
  {name:"McSwiggans Series",d:["Apr 8","Apr 15","Apr 22","Apr 29"]},
  {name:"Grealy Stores Series",d:["May 6","May 13","May 20","May 27"]},
  {name:"Seahorse Series",d:["Jun 3","Jun 10","Jun 17","Jun 24","Jul 1"]},
  {name:"Aquabroker Series",d:["Jul 8","Jul 15","Jul 22","Jul 29"]},
  {name:"GM Series",d:["Aug 5","Aug 12","Aug 19","Aug 26"]},
  {name:"O'Tuairisg Series",d:["Sep 2","Sep 9","Sep 16","Sep 23","Sep 30"]},
];
const KOTB=["King of the Bay: Spring Cup|May 2, 2026|14,0","King of the Bay: Barna|May 16, 2026","King of the Bay: Ballyvaughan|May 30, 2026","King of the Bay: Aran Cup|Jun 19, 2026","King of the Bay: Kinvara|Aug 15, 2026","King of the Bay: Clarinbridge Cup|Aug 29, 2026","King of the Bay: Morans|Sep 12, 2026","King of the Bay: Oyster Festival|Sep 26, 2026"];

function raceDate(dateStr,hour=19,min=0){
  // Build the date in Europe/Dublin time regardless of where the user's device is.
  // Strategy: find Dublin's UTC offset at noon on the race date via Intl, then
  // subtract that offset from the "naive UTC" timestamp to get the correct UTC instant.
  const tmp=new Date(dateStr);
  const y=tmp.getFullYear();
  const mo=String(tmp.getMonth()+1).padStart(2,'0');
  const day=String(tmp.getDate()).padStart(2,'0');
  const h=String(hour).padStart(2,'0');
  const m=String(min).padStart(2,'0');
  // Ask Intl what hour Dublin shows when it's 12:00 UTC on this date — gives the offset
  const noonUtc=new Date(`${y}-${mo}-${day}T12:00:00Z`);
  const dublinHour=parseInt(new Intl.DateTimeFormat('en',{timeZone:'Europe/Dublin',hour:'numeric',hour12:false}).format(noonUtc));
  const offsetMs=(dublinHour-12)*3600000; // e.g. BST=+1h → 3600000
  return new Date(new Date(`${y}-${mo}-${day}T${h}:${m}:00Z`).getTime()-offsetMs);
}
function buildAllRaces(){
  allRaces=[];
  WED.forEach(s=>s.d.forEach(d=>allRaces.push({label:s.name+' — Wed '+d,date:raceDate(d+' 2026',19,0),g:'w'})));
  KOTB.forEach(r=>{
    const[n,d,t]=r.split('|');
    const[h,m]=t?t.split(',').map(Number):[11,0];
    allRaces.push({label:n,date:raceDate(d,h,m),g:'k'});
  });
  allRaces.push({label:'Expert Forklifts October Series',date:raceDate('Oct 7, 2026',19,0),g:'o'});
  allRaces.sort((a,b)=>a.date-b.date);
}

// Patch allRaces start times from Halsail — called once on startup.
// Matches by calendar date (one race per day), so times set in Halsail
// (e.g. adjusted for tide/weather) override the hardcoded defaults.
async function patchRaceTimesFromHalsail(){
  const raw=await halFetch('/GetSchedule/'+HAL_CLUB);
  if(!raw||raw._err||!Array.isArray(raw)) return;
  if(!halSchedule) halSchedule=raw;

  // Build a map of dateString → earliest Start from Halsail (dedup IRC/ECHO pairs)
  const timeByDate={};
  raw.forEach(r=>{
    if(!isCruiserClass(r.Class)) return;
    const d=new Date(r.Start);
    const key=d.toDateString();
    if(!timeByDate[key]||d<timeByDate[key]) timeByDate[key]=d;
  });

  // Patch allRaces dates where Halsail has a matching day
  let patched=false;
  allRaces.forEach(r=>{
    const hal=timeByDate[r.date.toDateString()];
    if(!hal) return;
    if(hal.getHours()!==r.date.getHours()||hal.getMinutes()!==r.date.getMinutes()){
      r.date=hal;
      patched=true;
    }
  });

  if(!patched) return;

  // Rebuild nextRace and refresh public view
  nextRace=getNextRace();
  const el=document.getElementById('guestDashRaceName');
  const mel=document.getElementById('guestDashMeta');
  const tel=document.getElementById('guestDashTime');
  if(el&&nextRace) el.textContent=nextRace.label;
  if(mel&&nextRace) mel.textContent=nextRace.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'});
  if(tel&&nextRace) tel.textContent=nextRace.date.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  const guestEyebrow=document.getElementById('guestRaceEyebrow');
  if(guestEyebrow&&nextRace) guestEyebrow.textContent=getRaceEyebrow(nextRace);
  const raceEl=document.getElementById('loginRaceLabel');
  if(raceEl&&nextRace) raceEl.textContent=getRaceEyebrow(nextRace)+': '+nextRace.label+' · '+nextRace.date.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'});
}
function getRaceEyebrow(race){
  if(!race) return 'Next Race';
  const diff=race.date-new Date();
  if(diff > 3600000)  return 'Next Race';
  if(diff > 0)        return 'Starting Soon';
  if(diff > -3600000) return 'Race In Progress';
  if(race.date.toDateString()===new Date().toDateString()) return "Tonight's Race";
  return 'Last Race';
}
function getNextRace(){
  // Priority 1: upcoming race within 48h → registration/pre-race mode (takes over from linger)
  // Priority 2: past race within 48h → post-race mode (protests, payments, results)
  // Priority 3: next future race (idle state)
  // Priority 4: last race of season (off-season fallback)
  if(!allRaces.length) return null;
  const now=new Date();
  const WINDOW_MS=48*3600*1000;
  const upcoming=allRaces.find(r=>r.date>now&&r.date-now<=WINDOW_MS);
  if(upcoming) return upcoming;
  const recent=[...allRaces].reverse().find(r=>r.date<=now&&now-r.date<=WINDOW_MS);
  if(recent) return recent;
  const next=allRaces.find(r=>r.date>now);
  if(next) return next;
  return allRaces[allRaces.length-1];
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
function saveCrewSelection(boatId){
  try{localStorage.setItem('sel_'+boatId,JSON.stringify(roster.filter(p=>p.selected).map(p=>p.id)));}catch(e){}
}
function restoreCrewSelection(boatId){
  try{
    const stored=localStorage.getItem('sel_'+boatId);
    if(!stored)return;
    const ids=new Set(JSON.parse(stored));
    roster.forEach(p=>{p.selected=ids.has(p.id);});
  }catch(e){}
}
const _cacheKey='gr_custom_'+(_C.slug||'gbsc');
function loadCustom(){try{return JSON.parse(localStorage.getItem(_cacheKey)||'[]');}catch(e){return[];}}
function saveCustom(a){try{localStorage.setItem(_cacheKey,JSON.stringify(a));}catch(e){}}
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
  await loadRaceSchedule(); // load from DB — populates allRaces + nextRace

  // Show next race label
  const raceEl=document.getElementById('loginRaceLabel');
  if(nextRace&&raceEl) raceEl.textContent='Next race: '+nextRace.label+' · '+nextRace.date.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'});
  if(nextRace) showSponsor(nextRace.label);
  renderDocs();

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
  renderRegisteredTab(); // boats now loaded — starting line will resolve correctly

  // Load registration badges in background
  sbLoadRegistrations(nextRace).then(regs=>{
    registeredBoatIds=new Set((regs||[]).map(r=>r.boat_id));
    renderBoatGrid();
    updateHomeChips();
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
  renderBoatGrid();
  updateHomeChips();
  if(!isRO&&!isGuest) updateSkipperDash();
}
function loginAs(id){
  const b=boats.find(x=>x.id===id); if(!b)return;
  document.querySelectorAll('.boat-btn').forEach(e=>e.classList.remove('active'));
  const btn=document.getElementById('bb-'+id); if(btn)btn.classList.add('active');
  openPinOverlay(id);
}
function openLoginSheet(){
  document.getElementById('loginSheet').classList.add('open');
}
async function enterApp(b,ro){
  currentBoat=b; isRO=ro;
  document.body.classList.remove('role-skipper','role-ro');
  document.body.classList.add(ro?'role-ro':'role-skipper');
  try{localStorage.setItem('gr_last',b.id);}catch(e){}
  sbStartSession(ro?'ro':'skipper', ro?null:b.id, b.name).then(id=>{currentSessionId=id;}).catch(()=>{});
  closeSheet('loginSheet');
  // Show boat tag, hide login button
  document.getElementById('loginBtn').style.display='none';
  const tag=document.getElementById('boatTag');
  tag.removeAttribute('style'); // clear any previous inline styles
  tag.style.display='';         // make visible (uses default CSS display)
  document.getElementById('headerBoat').textContent=ro?'Race Officer':b.name;
  document.getElementById('changePinBtn').style.display=ro?'none':'flex';
  if(ro){
    tag.style.background='rgba(232,160,32,.1)';
    tag.style.borderColor='rgba(232,160,32,.4)';
    document.getElementById('headerBoat').style.color='var(--ro)';
    // Land directly on RO tab
    showTab('roTab', null);
    updateRODash();
    buildMarksGrid();
    loadMarks();
    loadLines();
    loadAndDrawCourse();
    loadRegistrations();
    buildPinMgmtList();
    buildRoReportDropdown();
    loadProtests();
    initRoFeatures();
    return;
  }
  document.getElementById('crewList').innerHTML='<div class="empty-state"><div class="icon">⏳</div>Loading…</div>';
  setSyncStatus('syncing');
  await sbEnsureBoat(b);
  await Promise.all([loadBoatConfig(b.id), loadClubSettings()]);
  // Load crew
  const sbCrew=await sbLoadCrew(b.id);
  if(sbCrew!==null){
    roster=sbCrew; // selected state comes from DB — no need to restore from localStorage
    cacheRosterLocally(b.id, roster);
    saveCrewSelection(b.id); // keep localStorage in sync for offline fallback
    setSyncStatus('ok');
  } else {
    // Offline — use local cache and restore saved selection
    roster=loadRoster(b.id)||[];
    restoreCrewSelection(b.id);
    setSyncStatus('offline');toast('⚠ Offline — using local data');
  }

  showTab('feesTab', null);
  // Update fee tile label to match the active fee model
  const feesLbl=document.getElementById('dc-fees-label');
  if(feesLbl) feesLbl.textContent=FEAT.feeModel==='per-series'?'Series Fees':'Race Fees';
  buildRaceDropdown();
  // Refresh registration state for this boat
  updateRegisterButton();
  loadAndDrawCourse();
  renderCrew();
  updateSkipperDash();
  // Apply per-race attendance snapshot — overrides global crew.selected if records exist
  if(nextRace) await applyRaceAttendance(nextRace);
  // Load payment state so dashboard summary is correct from first render
  await loadAndApplyPayments(nextRace);
  // Check if this boat is under protest for the current race
  checkForProtestsAgainstMe();
  // Feature: declaration gate (RCYC) — must come last so UI is ready
  if(FEAT.declaration) checkAndShowDeclaration();
}
function switchBoat(){
  sbEndSession(currentSessionId).catch(()=>{});
  currentSessionId=null;
  currentBoat=null;roster=[];isRO=false;isGuest=false;boatConfig={};
  document.body.classList.remove('role-skipper','role-ro');
  // Stop countdown timer so it doesn't keep firing after logout
  if(_countdownInterval){clearInterval(_countdownInterval);_countdownInterval=null;}
  halResultsCache={};halBoatCache={};
  // Return to public view — show login button, hide boat tag
  document.getElementById('boatTag').style.display='none';
  document.getElementById('boatTag').removeAttribute('style');
  document.getElementById('boatTag').style.display='none';
  document.getElementById('headerBoat').removeAttribute('style');
  document.getElementById('loginBtn').style.display='';
  document.getElementById('changePinBtn').style.display='none';
  showTab('registeredTab', null);
  renderRegisteredTab();  // refresh starting line on return to home
}

// ═══════════════════════════════════════════════════════════════
// PER-CLUB FEATURE MODULES
// ═══════════════════════════════════════════════════════════════

// ── RO feature initialisation ─────────────────────────────────────────────────
function initRoFeatures(){
  applyAllFeatureVisibility();
}

// ── RO Features Admin Panel ───────────────────────────────────────────────────
async function openRoFeaturesPanel(){
  openPanel('roFeaturesPanel');
  const fresh=await sbLoadClubSettings();
  if(fresh){ clubSettings=fresh; try{localStorage.setItem('__club_settings__',JSON.stringify(fresh));}catch(e){} }
  renderFeaturesPanel();
}
function renderFeaturesPanel(){
  const f=(clubSettings&&clubSettings.features)||{};
  const groups={};
  FEAT_CATALOG.forEach(item=>{
    if(!groups[item.group]) groups[item.group]=[];
    groups[item.group].push(item);
  });
  let html='';
  Object.keys(groups).forEach(group=>{
    html+=`<div class="sec-head" style="margin-top:16px;margin-bottom:4px"><div class="sec-title">${group}</div></div>`;
    groups[group].forEach(item=>{
      if(item.type==='select'){
        const val=f[item.key]!==undefined?f[item.key]:(FEAT_DEFAULTS[item.key]||item.options[0]);
        const opts=item.options.map(o=>`<option value="${o}"${val===o?' selected':''}>${o}</option>`).join('');
        html+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:.9rem;color:var(--white)">${item.label}</span>
          <select onchange="saveFeatureSetting('${item.key}',this.value)"
            style="background:var(--navy);color:var(--white);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-size:.85rem;cursor:pointer">
            ${opts}
          </select>
        </div>`;
      } else {
        const def=FEAT_DEFAULTS[item.key]!==undefined?FEAT_DEFAULTS[item.key]:true;
        const on=f[item.key]!==undefined?!!f[item.key]:def;
        html+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:.9rem;color:var(--white)">${item.label}${!def?' <span style="font-size:.7rem;color:var(--muted)">(off by default)</span>':''}</span>
          <input type="checkbox" ${on?'checked':''} onchange="saveFeatureSetting('${item.key}',this.checked)"
            style="width:20px;height:20px;accent-color:#00aeef;cursor:pointer;flex-shrink:0">
        </div>`;
      }
    });
  });
  document.getElementById('roFeaturesPanelBody').innerHTML=html;
}
async function saveFeatureSetting(key, value){
  const f=Object.assign({}, (clubSettings&&clubSettings.features)||{}, {[key]:value});
  clubSettings=Object.assign({}, clubSettings, {features:f});
  // Write to both caches immediately — DB save can fail without losing the setting
  try{localStorage.setItem('__features__',JSON.stringify(f));}catch(e){}
  try{localStorage.setItem('__club_settings__',JSON.stringify(clubSettings));}catch(e){}
  applyAllFeatureVisibility();
  const r=await sbSaveClubSettings({features:f});
  if(!r||r._err){ toast('⚠ Saved locally — run migration 012 to persist to DB'); return; }
  toast('✅ Saved');
}

// ── Skipper Declaration (RCYC) ────────────────────────────────────────────────
// Checks whether the current boat's skipper has signed the season declaration.
// Uses localStorage as a fast cache; always verifies against Supabase on first check.
async function checkAndShowDeclaration(){
  if(!currentBoat||!FEAT.declaration) return;
  const key='decl_'+(_C.slug||'club')+'_'+currentBoat.id+'_'+CY;
  const cached=localStorage.getItem(key);
  if(cached==='1') return; // already declared this season — skip DB check
  // Try DB
  const decl=await sbLoadDeclaration(currentBoat.id, CY);
  if(decl){
    try{localStorage.setItem(key,'1');}catch(e){}
    return; // already on record
  }
  // Not declared — show the gate
  openDeclarationPanel();
}

function openDeclarationPanel(){
  const p=document.getElementById('declarationPanel');
  if(!p) return;
  // Render
  const docsHtml=(sis,rrs,safety)=>`
    <a href="${sis||'#'}" target="_blank" rel="noopener" style="color:var(--teal);font-size:.8rem">View Sailing Instructions ↗</a>
    <a href="${rrs||'#'}" target="_blank" rel="noopener" style="color:var(--teal);font-size:.8rem;margin-left:12px">View RRS ↗</a>
    <a href="${safety||'#'}" target="_blank" rel="noopener" style="color:var(--teal);font-size:.8rem;margin-left:12px">View Safety Documents ↗</a>
  `;
  document.getElementById('declBoatName').textContent=currentBoat.name;
  const yrEl=document.getElementById('declYear'); if(yrEl) yrEl.textContent=CY;
  document.getElementById('declDocLinks').innerHTML=docsHtml(DECL_DOCS.sis,DECL_DOCS.rrs,DECL_DOCS.safety);
  // Reset form
  ['declReadSIs','declReadRRS','declReadSafety','declAccept'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.checked=false;
  });
  const nameEl=document.getElementById('declSkipperName'); if(nameEl) nameEl.value='';
  p.style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>p.classList.add('open')));
}

async function submitDeclaration(){
  const nameEl=document.getElementById('declSkipperName');
  const name=(nameEl&&nameEl.value.trim())||'';
  if(!name){toast('Please enter the skipper name');return;}
  const checks=['declReadSIs','declReadRRS','declReadSafety','declAccept'];
  for(const id of checks){
    const el=document.getElementById(id);
    if(!el||!el.checked){toast('Please confirm all boxes');return;}
  }
  const btn=document.getElementById('declSubmitBtn');
  if(btn){btn.disabled=true;btn.textContent='Submitting…';}
  const ok=await sbSaveDeclaration(currentBoat.id,name,CY);
  if(btn){btn.disabled=false;btn.textContent='Sign & Continue';}
  if(ok&&!ok._err){
    const key='decl_'+(_C.slug||'club')+'_'+currentBoat.id+'_'+CY;
    try{localStorage.setItem(key,'1');}catch(e){}
    const p=document.getElementById('declarationPanel');
    if(p){p.classList.remove('open');setTimeout(()=>{p.style.display='none';},300);}
    toast('✅ Declaration submitted — thank you');
  } else {
    toast('⚠ Could not save declaration — please try again');
  }
}

// ── Course Card (RCYC) ────────────────────────────────────────────────────────
let courseCardData=[]; // cached course card entries

async function openCourseCardPanel(){
  const p=document.getElementById('roCourseCardPanel');
  if(!p) return;
  p.style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>p.classList.add('open')));
  if(!courseCardData.length) courseCardData=await sbLoadCourseCard();
  populateCcLineSelects();
  renderCourseCardList();
}

function populateCcLineSelects(){
  const startSel=document.getElementById('ccStartLineSel');
  const finishSel=document.getElementById('ccFinishLineSel');
  if(!startSel||!finishSel) return;
  const opts=LINES.filter(l=>l.isActive!==false).map(l=>
    `<option value="${l.id}">${l.name}</option>`).join('');
  startSel.innerHTML=opts;
  finishSel.innerHTML=opts;
  startSel.value=selectedStartLineId;
  finishSel.value=selectedFinishLineId;
}

function ccLineChange(which, id){
  if(which==='start') selectedStartLineId=id;
  else selectedFinishLineId=id;
}

function renderCourseCardList(filter){
  const list=document.getElementById('courseCardList');
  if(!list) return;
  if(!courseCardData.length){
    list.innerHTML='<div class="empty-state"><div class="icon">📋</div><div>No courses loaded</div></div>';
    return;
  }
  const q=(filter||'').toLowerCase();
  const visible=q?courseCardData.filter(c=>String(c.number).includes(q)||c.wind_direction.toLowerCase().includes(q)||(c.name||'').toLowerCase().includes(q)):courseCardData;
  if(!visible.length){list.innerHTML='<div class="empty-state" style="padding:16px;color:var(--muted)">No matching courses</div>';return;}
  // Group by wind direction
  const groups={};
  visible.forEach(c=>{
    if(!groups[c.wind_direction]) groups[c.wind_direction]=[];
    groups[c.wind_direction].push(c);
  });
  list.innerHTML=Object.entries(groups).map(([dir,courses])=>`
    <div style="margin-bottom:14px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;color:var(--muted);letter-spacing:.1em;text-transform:uppercase;margin-bottom:6px">
        ${dir} Wind
      </div>
      ${courses.map(c=>{
        const rounds=Array.isArray(c.rounds)?c.rounds:(typeof c.rounds==='string'?JSON.parse(c.rounds):[]);
        const lastDist=rounds.length?rounds[rounds.length-1].distance_nm:'—';
        return `<div onclick="selectCourseCardCourse(${c.number})"
          style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;
          padding:12px 14px;margin-bottom:6px;cursor:pointer;transition:border-color .15s"
          onmouseover="this.style.borderColor='var(--teal)'" onmouseout="this.style.borderColor='var(--border)'">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.05rem;font-weight:800;color:var(--white)">
              Course ${c.number}${c.name?' — '+c.name:''}${c.grassy_walk_note?'<span style="font-size:.7rem;color:var(--gold);margin-left:6px">**GW</span>':''}
            </span>
            <span style="font-size:.8rem;color:var(--muted)">${lastDist} nm</span>
          </div>
          ${rounds.map(r=>`<div style="font-size:.8rem;color:var(--muted);margin-bottom:2px">
            <span style="color:var(--teal);font-weight:700">${r.label}:</span> ${r.marks} <em style="color:rgba(255,255,255,.35)">(${r.distance_nm} nm)</em>
          </div>`).join('')}
        </div>`;
      }).join('')}
    </div>
  `).join('');
}

let selectedCourseCardEntry=null;

function selectCourseCardCourse(number){
  selectedCourseCardEntry=courseCardData.find(c=>c.number===number)||null;
  if(!selectedCourseCardEntry) return;
  const preview=document.getElementById('courseCardPreview');
  if(!preview) return;
  const rounds=Array.isArray(selectedCourseCardEntry.rounds)
    ?selectedCourseCardEntry.rounds
    :(typeof selectedCourseCardEntry.rounds==='string'?JSON.parse(selectedCourseCardEntry.rounds):[]);
  const lastDist=rounds.length?rounds[rounds.length-1].distance_nm:'—';
  const gwNote=selectedCourseCardEntry.grassy_walk_note
    ?'<div style="font-size:.75rem;color:var(--gold);margin-top:6px">** When Grassy Walk line in use: insert Dosco (P) as Mark 1</div>':''
  ;
  preview.innerHTML=`
    <div style="background:rgba(0,188,212,.08);border:1px solid rgba(0,188,212,.3);border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;color:var(--white);margin-bottom:8px">
        Course ${selectedCourseCardEntry.number}${selectedCourseCardEntry.name?' — '+selectedCourseCardEntry.name:''}
        <span style="font-size:.8rem;font-weight:400;color:var(--muted);margin-left:8px">${selectedCourseCardEntry.wind_direction} Wind · ${lastDist} nm</span>
      </div>
      ${rounds.map(r=>`<div style="margin-bottom:5px">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;color:var(--teal)">${r.label}:</span>
        <span style="font-size:.88rem;color:var(--fg)"> ${r.marks}</span>
        <span style="font-size:.78rem;color:var(--muted)"> (${r.distance_nm} nm)</span>
      </div>`).join('')}
      ${gwNote}
    </div>
    <button onclick="publishFromCourseCard()" class="btn btn-ro" style="width:100%;padding:12px">
      🚀 Publish Course ${selectedCourseCardEntry.number} to Skippers
    </button>
  `;
  preview.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function publishFromCourseCard(){
  if(!selectedCourseCardEntry){toast('Select a course first');return;}
  const rounds=Array.isArray(selectedCourseCardEntry.rounds)
    ?selectedCourseCardEntry.rounds
    :(typeof selectedCourseCardEntry.rounds==='string'?JSON.parse(selectedCourseCardEntry.rounds):[]);
  const course={
    id:'current',
    name:'Course '+selectedCourseCardEntry.number+(selectedCourseCardEntry.name?' — '+selectedCourseCardEntry.name:''),
    marks:[],  // course card courses use text descriptions, not individual lat/lng marks
    windDeg,
    windDir:selectedCourseCardEntry.wind_direction,
    race_name:selectedRace?selectedRace.label:'',
    notes:(document.getElementById('courseCardNotes')&&document.getElementById('courseCardNotes').value.trim())||'',
    published_at:new Date().toISOString(),
    startLineId:selectedStartLineId,
    finishLineId:selectedFinishLineId,
    courseNumber:selectedCourseCardEntry.number,
    rounds
  };
  setSyncStatus('syncing');
  const ok=await sbSaveCourse(course);
  if(ok){
    publishedCourse=course;
    setSyncStatus('ok');
    roDashCoursePublished=true;
    updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
    updateHomeChips();
    closePanel('roCourseCardPanel');
    toast('✅ Course '+selectedCourseCardEntry.number+' published to all skippers!');
  } else {
    setSyncStatus('offline');
    toast('⚠ Could not save course — check connection');
  }
}

// ── Series Fees (RCYC) ────────────────────────────────────────────────────────
// Routes the fee tile to the correct panel depending on feeModel.
function openFeePanel(){
  if(FEAT.feeModel==='per-series') openSeriesFeesPanel();
  else openRaceFeesPanel();
}

async function openSeriesFeesPanel(){
  const p=document.getElementById('seriesFeesPanel');
  if(!p) return;
  p.style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    p.classList.add('open');
    renderSeriesFeesPanel();
  }));
}

async function renderSeriesFeesPanel(){
  const body=document.getElementById('seriesFeesBody');
  if(!body) return;
  body.innerHTML='<div style="text-align:center;padding:24px;color:var(--muted)">Loading…</div>';
  if(!currentBoat){body.innerHTML='<div style="padding:16px;color:var(--warn)">No boat selected</div>';return;}
  const fees=await sbLoadSeriesFees(currentBoat.id, CY);
  // Get distinct series names from allRaces
  const seriesNames=[...new Set(allRaces.map(r=>r.series).filter(Boolean))];

  const paidSeriesNames=new Set(fees.map(f=>f.series_name));
  body.innerHTML=`
    <div style="margin-bottom:18px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">${CY} Series — Payment Status</div>
      ${seriesNames.length?seriesNames.map(s=>`
        <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,.04);border:1px solid ${paidSeriesNames.has(s)?'rgba(45,198,83,.35)':'var(--border)'};border-radius:10px;padding:11px 14px;margin-bottom:6px">
          <div>
            <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.95rem;color:var(--white)">${s}</div>
            ${paidSeriesNames.has(s)?'<div style="font-size:.75rem;color:var(--success)">✓ Paid</div>':'<div style="font-size:.75rem;color:var(--muted)">Not yet recorded</div>'}
          </div>
          ${paidSeriesNames.has(s)
            ?''
            :`<button onclick="showSeriesPaymentForm('${s.replace(/'/g,"\\\'")}')"
              style="font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;padding:6px 12px;border-radius:8px;background:var(--teal);color:#fff;border:none;cursor:pointer">
              Record
            </button>`
          }
        </div>
      `).join('')
      :'<div style="padding:16px;text-align:center;color:var(--muted);font-size:.85rem">No series found in schedule</div>'}
    </div>
    <div id="seriesPaymentFormDiv" style="display:none"></div>
    ${fees.length?`
      <div style="margin-top:10px">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;color:var(--muted);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Payment History</div>
        ${fees.map(f=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-size:.88rem;color:var(--fg)">${f.series_name}</div>
              <div style="font-size:.75rem;color:var(--muted)">${f.method} · ${new Date(f.paid_at).toLocaleDateString('en-IE')}</div>
            </div>
            <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;color:var(--success)">€${Number(f.amount).toFixed(2)}</span>
          </div>
        `).join('')}
      </div>
    `:''}
  `;
}

function showSeriesPaymentForm(seriesName){
  const div=document.getElementById('seriesPaymentFormDiv');
  if(!div) return;
  div.style.display='block';
  div.innerHTML=`
    <div style="background:rgba(0,188,212,.07);border:1px solid rgba(0,188,212,.3);border-radius:10px;padding:14px;margin-bottom:12px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;margin-bottom:10px;color:var(--white)">Record payment for <em>${seriesName}</em></div>
      <div class="ro-row" style="margin-bottom:8px">
        <label style="min-width:70px;font-size:.85rem">Amount (€)</label>
        <input id="sfAmount" type="number" step="0.01" min="0" placeholder="0.00"
          style="flex:1;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--navy);color:var(--white);font-size:.9rem">
      </div>
      <div class="ro-row" style="margin-bottom:10px">
        <label style="min-width:70px;font-size:.85rem">Method</label>
        <select id="sfMethod" style="flex:1;padding:7px 10px;border-radius:8px;border:1px solid var(--border);background:var(--navy);color:var(--white);font-size:.9rem">
          <option>Cash</option><option>Revolut</option><option>Card</option>
        </select>
      </div>
      <div style="display:flex;gap:8px">
        <button onclick="confirmSeriesPayment('${seriesName.replace(/'/g,"\\\'")}')"
          style="flex:1;padding:9px;border-radius:9px;background:var(--teal);color:#fff;border:none;font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:700;cursor:pointer">
          Save Payment
        </button>
        <button onclick="document.getElementById('seriesPaymentFormDiv').style.display='none'"
          style="padding:9px 14px;border-radius:9px;background:transparent;color:var(--muted);border:1px solid var(--border);cursor:pointer">
          Cancel
        </button>
      </div>
    </div>
  `;
  div.scrollIntoView({behavior:'smooth',block:'nearest'});
}

async function confirmSeriesPayment(seriesName){
  const amount=parseFloat(document.getElementById('sfAmount')?.value)||0;
  const method=document.getElementById('sfMethod')?.value||'Cash';
  if(amount<=0){toast('Enter a valid amount');return;}
  const ok=await sbSaveSeriesFee(currentBoat.id,seriesName,CY,amount,method,'');
  if(ok&&!ok._err){
    toast('✅ Payment recorded');
    renderSeriesFeesPanel();
  } else {
    toast('⚠ Could not save — try again');
  }
}

async function renderRegisteredTab(){
  const label=document.getElementById('regRaceLabel'); // legacy — may be null in new dashboard
  const list=document.getElementById('registeredList');
  if(!nextRace){if(list)list.innerHTML='<div class="empty-state"><div class="icon">📅</div><div>No upcoming race found</div></div>';return;}
  if(label) label.textContent=nextRace.label+' · '+nextRace.date.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'});
  list.innerHTML='<div class="empty-state"><div class="icon">⏳</div><div>Loading…</div></div>';
  const regs=await sbLoadRegistrations(nextRace);
  if(!regs||!regs.length){
    list.innerHTML='<div class="empty-state"><div class="icon">⛵</div><div>No boats registered yet</div></div>';
    return;
  }
  const regBoats=regs.map(r=>{
    const b=boats.find(x=>x.id===r.boat_id);
    return b?b:null;
  }).filter(Boolean);
  list.innerHTML=regBoats.map(b=>
    '<div onclick="loginAs(\''+b.id+'\')" style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:rgba(255,255,255,.04);'+
    'border:1px solid var(--border);border-radius:10px;margin-bottom:8px;cursor:pointer;">'+
    '<span style="font-size:1.4rem">'+b.icon+'</span>'+
    '<span style="font-family:\'Barlow Condensed\',sans-serif;font-size:1rem;font-weight:800;color:var(--white)">'+b.name+'</span>'+
    '<span style="margin-left:auto;font-size:.8rem;color:var(--muted)">Tap to log in →</span>'+
    '</div>'
  ).join('');
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

// RO-only add boat (no loginAs — just refresh the panel and boat grid)
function roShowAddBoatForm(){
  document.getElementById('roAddBoatForm').style.display='block';
  document.getElementById('roAddBoatBtn').style.display='none';
  document.getElementById('ro-newBoatName').focus();
}
function roHideAddBoatForm(){
  document.getElementById('roAddBoatForm').style.display='none';
  document.getElementById('roAddBoatBtn').style.display='block';
  document.getElementById('ro-newBoatName').value='';
}
function roSubmitAddBoat(){
  const name=document.getElementById('ro-newBoatName').value.trim();
  if(!name){toast('Enter a boat name');return;}
  const id=name.toLowerCase().replace(/[^a-z0-9]/g,'')||'boat'+Date.now();
  if(boats.find(b=>b.id===id)){toast('Boat already exists');return;}
  const nb={id,name,icon:'⛵'};
  boats.push(nb);
  const c=loadCustom();c.push(nb);saveCustom(c);
  sbFetch('/rest/v1/boats',{method:'POST',
    headers:{...SBH,'Prefer':'resolution=ignore-duplicates,return=minimal'},
    body:JSON.stringify({id,name,icon:'⛵',pin:'0000',revolut_user:'',stripe_link:''})
  });
  roHideAddBoatForm();
  renderBoatGrid();
  buildPinMgmtList();
  toast('✅ '+name+' added');
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
  } else {
    const b=boats.find(x=>x.id===ctx);
    document.getElementById('pinTitle').textContent=(b?b.icon+' '+b.name:'Boat');
    document.getElementById('pinSubtitle').textContent='Enter your 4-digit PIN';
  }
  document.getElementById('pinOverlay').classList.add('open');
}
function closePinOverlay(){ document.getElementById('pinOverlay').classList.remove('open'); pinContext=null; }
function pinKey(k){ if(pinEntry.length>=4)return; pinEntry+=k; updatePinDots(); if(pinEntry.length===4)checkPin(); }
function pinBack(){ pinEntry=pinEntry.slice(0,-1); updatePinDots(); }
function pinClear(){ pinEntry=''; updatePinDots(); }
function updatePinDots(){ for(let i=0;i<4;i++) document.getElementById('pd'+i).classList.toggle('filled',i<pinEntry.length); }
async function checkPin(){
  const ctx=pinContext; // save before closePinOverlay nulls it
  const errEl=document.getElementById('pinError');

  // RO PIN lives only in localStorage — no DB lookup needed
  if(ctx==='ro'){
    const correct=getRoPin();
    if(pinEntry===correct){
      closePinOverlay();
      await _settingsReady.catch(()=>{});
      enterApp({id:'ro',name:'Race Officer',icon:'🎌'},true);
    } else {
      errEl.textContent='Incorrect PIN';
      pinEntry=''; updatePinDots();
      setTimeout(()=>{ errEl.textContent=''; },2000);
    }
    return;
  }

  // Boat PIN — always fetch live from DB, fall back to cache if offline
  errEl.textContent='Checking…';
  const cfg=await sbLoadBoatConfig(ctx);
  const correct=cfg ? cfg.pin||'0000' : getBoatPin(ctx); // cache fallback if offline
  // Update local cache with fresh value
  if(cfg){ try{localStorage.setItem('cfg_'+ctx,JSON.stringify(cfg));}catch(e){} }

  if(pinEntry===correct){
    errEl.textContent='';
    closePinOverlay();
    await _settingsReady.catch(()=>{});
    const b=boats.find(x=>x.id===ctx);
    if(b) enterApp(b,false).then(()=>{
      if(correct==='0000') showDefaultPinModal();
    });
  } else {
    errEl.textContent='Incorrect PIN';
    pinEntry=''; updatePinDots();
    setTimeout(()=>{ errEl.textContent=''; },2000);
  }
}

function showDefaultPinModal(){
  const m=document.getElementById('defaultPinModal');
  if(m) m.style.display='flex';
}
function closeDefaultPinModal(changePinNow){
  const m=document.getElementById('defaultPinModal');
  if(m) m.style.display='none';
  if(changePinNow) openChangePinFlow();
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
async function confirmChangePin(){
  if(cpEntry.length!==4){ document.getElementById('cpError').textContent='Enter 4 digits'; return; }
  if(cpTargetId==='ro'){
    setRoPin(cpEntry);
    closeChangePinOverlay();
    toast('✅ RO PIN updated');
    return;
  }
  const b=boats.find(x=>x.id===cpTargetId);
  const ok=await setBoatPin(cpTargetId,cpEntry);
  if(!ok){
    document.getElementById('cpError').textContent='Could not save — check connection';
    cpEntry=''; updateCpDots();
    return;
  }
  closeChangePinOverlay();
  toast('✅ PIN updated'+(b?' for '+b.name:''));
  if(isRO) buildPinMgmtList();
}

// ═══════════════════════════════════════════════════════════════
// TABS
// ═══════════════════════════════════════════════════════════════
function showTab(id,btn){
  document.querySelectorAll('.tab-wrap').forEach(t=>t.classList.remove('active'));
  const el=document.getElementById(id);
  if(el){ el.classList.add('active'); el.scrollTop=0; }
  if(btn) btn.classList.add('active');
}

// ── Panel system ─────────────────────────────────────────────
function openPanel(id){
  const p=document.getElementById(id);if(!p)return;
  p.style.display='flex';
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    p.classList.add('open');
    if(id==='roCoursePanel'){
      populateLineSelects();
      if(forecastWindDeg!=null){
        const sl=document.getElementById('windSlider');
        if(sl) sl.value=forecastWindDeg;
        updateWind(forecastWindDeg);
      }
      // Load any saved draft into the builder
      if(!courseMarks.length) loadDraftIfExists();
    }
    if(id==='roMarksPanel'){ buildMarksMgrList(); buildLinesMgrList(); }
    if(id==='roCourseViewPanel') renderCourseDiagram('roCourseDisplay');
  }));
}
function closePanel(id){
  const p=document.getElementById(id);if(!p)return;
  p.classList.remove('open');
  setTimeout(()=>{p.style.display='none';},300);
}

// ── Skipper dashboard update ─────────────────────────────────
function updateSkipperDash(){
  const r=selectedRace||nextRace;
  const nameEl=document.getElementById('dashRaceName');
  const metaEl=document.getElementById('dashRaceMeta');
  const regEl=document.getElementById('dashRegStatus');
  const crewRaceName=document.getElementById('crewPanelRaceName');
  const eyebrow=document.getElementById('skipperRaceEyebrow');
  if(!nameEl)return;
  if(eyebrow) eyebrow.textContent=getRaceEyebrow(r);
  if(r){
    nameEl.textContent=r.label;
    if(metaEl) metaEl.textContent=r.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'});
    if(crewRaceName) crewRaceName.textContent=r.label;
  } else {
    nameEl.textContent='No upcoming race';
    if(metaEl) metaEl.textContent='';
    if(crewRaceName) crewRaceName.textContent='—';
  }
  const isReg=registeredBoatIds.has(currentBoat?.id);
  if(regEl) regEl.innerHTML=isReg
    ?'<span class="dash-reg-pill registered">✓ Registered</span>'
    :'<span class="dash-reg-pill unregistered">Not registered</span>';
}

// ── Results embargo ───────────────────────────────────────────
// Returns true when the RO has used the publish feature for at least one race
// AND has not yet published results for the current race.
// Only active within 48 hours of the race (same window as nextRace resolution).
function isResultsBlocked(){
  const published=clubSettings.results_published_race_key||'';
  if(!published) return false;   // feature never used — show results by default
  if(!nextRace) return false;
  const hoursSince=(Date.now()-nextRace.date.getTime())/3600000;
  if(hoursSince<0||hoursSince>48) return false;  // outside post-race window
  return published!==raceKey(nextRace);
}
async function publishResults(){
  if(!nextRace){toast('No recent race found');return;}
  const key=raceKey(nextRace);
  const r=await sbSaveClubSettings({results_published_race_key:key});
  if(r&&r._err){toast('⚠ Could not publish — '+r._err.slice(0,60));return;}
  clubSettings.results_published_race_key=key;
  try{localStorage.setItem('__club_settings__',JSON.stringify(clubSettings));}catch(e){}
  toast('Results published ✓');
  updateROResultsStatus();
}
function updateROResultsStatus(){
  const el=document.getElementById('roResultsStatus');
  if(!el)return;
  if(!nextRace){el.textContent='No upcoming race';el.style.color='';return;}
  const blocked=isResultsBlocked();
  el.textContent=blocked?'Embargoed':'Published ✓';
  el.style.color=blocked?'var(--warn)':'var(--success)';
}

// ── RO dashboard update ──────────────────────────────────────
function updateRODash(){
  const r=nextRace;
  const nameEl=document.getElementById('roDashRaceName');
  const metaEl=document.getElementById('roDashMeta');
  if(nameEl&&r){ nameEl.textContent=r.label; }
  if(metaEl&&r){ metaEl.textContent=r.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'}); }
  updateROResultsStatus();
}
function updateROChips(regsCount,protestsCount,coursePublished){
  const chips=document.getElementById('roDashChips');
  if(!chips)return;
  const cstate=getCourseState();
  const courseChip=
    cstate==='live'   ?'<span class="dash-chip course-ok">✅ Course published</span>':
    cstate==='pending'?'<span class="dash-chip course-no">🕐 Course not set</span>':
    cstate==='stale'  ?'<span class="dash-chip course-no">⚠ Previous course</span>':
                       '<span class="dash-chip course-no">Course not set</span>';
  chips.innerHTML=
    '<span class="dash-chip regs">⛵ '+regsCount+' registered</span>'+
    (protestsCount>0?'<span class="dash-chip protests">🚩 '+protestsCount+' protest'+(protestsCount>1?'s':'')+'</span>':'')+
    courseChip;
  const regsStatus=document.getElementById('roRegsStatus');
  const protestStatus=document.getElementById('roProtestsStatus');
  const courseStatus=document.getElementById('roCourseStatus');
  if(regsStatus) regsStatus.textContent=regsCount>0?regsCount+' boat'+(regsCount>1?'s':'')+' registered':'No registrations yet';
  if(protestStatus) protestStatus.textContent=protestsCount>0?protestsCount+' filed':'None filed';
  if(courseStatus){
    const state=getCourseState();
    if(state==='live') courseStatus.textContent='✅ Published for today';
    else if(state==='pending') courseStatus.textContent='⚠ Not yet set for today';
    else if(state==='stale') courseStatus.textContent='Previous course — update needed';
    else courseStatus.textContent='Not published';
  }
}

// ── Guest nav helper ─────────────────────────────────────────
function guestNav(tabId){
  const panelId=tabId.replace('Tab','Panel');
  openPanel(panelId);
  if(tabId==='resultsTab') loadResultsIfNeeded();
  if(tabId==='calendarTab') loadCalendarIfNeeded();
  if(tabId==='docsTab') loadAndRenderDocs();
}

// ═══════════════════════════════════════════════════════════════
// RACE SCHEDULE FUNCTIONS
// ═══════════════════════════════════════════════════════════════
let roReportRace=null;
function buildRoReportDropdown(){
  const sel=document.getElementById('roReportRaceSelect'); if(!sel) return;
  const nr=nextRace||getNextRace();
  sel.innerHTML='';
  // Show all races, most recent first — past races are the main use case here
  const sorted=[...allRaces].sort((a,b)=>b.date-a.date);
  sorted.forEach(r=>{
    const o=document.createElement('option');
    o.value=r.label;
    o.textContent=r.date.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'})+' · '+r.label;
    sel.appendChild(o);
  });
  // Default to nextRace
  roReportRace=nr||allRaces[0];
  if(roReportRace) sel.value=roReportRace.label;
}
function roReportRaceChanged(){
  const sel=document.getElementById('roReportRaceSelect'); if(!sel) return;
  roReportRace=allRaces.find(r=>r.label===sel.value)||nextRace;
}

function buildRaceDropdown(){
  // allRaces populated from DB by loadRaceSchedule()
  const nr=nextRace||getNextRace();
  const ci=allRaces.indexOf(nr)>=0?allRaces.indexOf(nr):0;
  const sel=document.getElementById('raceDropdown'); sel.innerHTML='';
  // Group by series name dynamically — no hardcoded group keys
  const og={};
  allRaces.forEach((r,i)=>{
    const grp=r.series||'Other';
    if(!og[grp]){og[grp]=document.createElement('optgroup');og[grp].label=grp;}
    const o=document.createElement('option');o.value=i;o.textContent=r.label;
    og[grp].appendChild(o);
  });
  Object.values(og).forEach(g=>sel.appendChild(g));
  sel.value=ci; onRaceSelect(sel,true);
}
async function onRaceSelect(el,silent){
  const i=parseInt(el.value);if(isNaN(i))return;
  selectedRace=allRaces[i];
  document.getElementById('raceBadge').textContent=selectedRace.date.toLocaleDateString('en-IE',{day:'numeric',month:'short'});
  if(!isRO&&!isGuest) updateSkipperDash();
  if(!silent){
    toast('Race set ✓');
    if(!isRO&&!isGuest){
      await applyRaceAttendance(selectedRace);
      await loadAndApplyPayments(selectedRace);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// RACE ATTENDANCE
// ═══════════════════════════════════════════════════════════════
// Loads the per-race attendance snapshot from DB and applies it to
// roster.selected. Falls back to the global crew.selected flag only
// for nextRace (backward compatibility before records exist).
async function applyRaceAttendance(race){
  if(!currentBoat||!race)return;
  const attendees=await sbLoadRaceAttendees(currentBoat.id,raceKey(race));
  if(attendees===null||attendees?._err){
    // DB/network error — leave selection unchanged rather than wiping it
    console.error('race_attendees load failed for',raceKey(race),attendees);
    toast('⚠ Could not load attendance — check connection');
    renderCrew();
    return;
  }
  // Empty array = no records for this race (correct empty state)
  const ids=new Set(attendees.map(a=>a.crew_id));
  roster.forEach(p=>{p.selected=ids.has(p.id);if(!p.selected)p.paid=false;});
  renderCrew();
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
          (p.type==='visitor'?'<span style="font-size:.8rem;color:'+(warn?'var(--warn)':'var(--muted)')+'">'+p.outings+'/'+VISITOR_MAX+' outings</span>':'')+
          (p.type==='crew'&&p.joinYear?'<span style="font-size:.8rem;color:var(--muted)">since '+p.joinYear+'</span>':'')+
          (p.phone?'<span style="font-size:.8rem;color:var(--muted)">📱 '+p.phone+'</span>':'')+
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
  // Dash strip & crew badge
  const dCrew=document.getElementById('dash-crew');
  const dTotal=document.getElementById('dash-total');
  const dOwed=document.getElementById('dash-owed');
  const dBadge=document.getElementById('dc-crew-badge');
  if(dCrew) dCrew.textContent=s.length;
  if(dTotal) dTotal.textContent='€'+tot;
  if(dOwed) dOwed.textContent='€'+(tot-paid);
  if(dBadge) dBadge.textContent=s.length+' selected';
  // Fees tile badge
  const fBadge=document.getElementById('dc-fees-badge');
  if(fBadge){
    const unpaid=s.filter(p=>!p.paid);
    fBadge.textContent=s.length===0?'Collect & submit':unpaid.length===0?'All paid ✓':'€'+(tot-paid)+' outstanding';
  }
}
function toggleSel(id){
  const p=roster.find(r=>r.id===id);
  if(!p)return;
  p.selected=!p.selected;
  if(!p.selected)p.paid=false;
  renderCrew();
  saveCrewSelection(currentBoat?.id);       // localStorage (offline fallback)
  sbSetCrewSelected(p.id,p.selected);       // global flag kept in sync (offline fallback)
  const race=selectedRace||nextRace;
  if(race&&currentBoat){
    const key=raceKey(race);
    if(p.selected){
      sbUpsertRaceAttendee(currentBoat.id,key,race.label,race.date.toISOString().split('T')[0],p.id)
        .then(r=>{if(r?._err) console.error('race_attendees upsert failed',r._err);});
    } else {
      sbDeleteRaceAttendee(currentBoat.id,key,p.id)
        .then(r=>{if(r?._err) console.error('race_attendees delete failed',r._err);});
    }
  }
}
function togglePaid(id){const p=roster.find(r=>r.id===id);if(!p)return;if(p.paid){p.paid=false;p.payMethod='';p.payNote='';renderCrew();toast(p.first+' marked unpaid');}else openPNSheet(id);}

// add crew
function onCrewTypeChange(){const t=document.getElementById('cf-type').value;document.getElementById('cf-joinGrp').style.display=t==='crew'?'flex':'none';document.getElementById('cf-outGrp').style.display=t==='visitor'?'flex':'none';}
function toggleCrewForm(){
  const f=document.getElementById('crewForm');
  const btn=document.getElementById('crewAddBtn');
  f.classList.toggle('open');
  const isOpen=f.classList.contains('open');
  if(btn) btn.style.display=isOpen?'none':'flex';
  if(isOpen) document.getElementById('cf-first').focus();
}
async function addCrewMember(){
  const first=document.getElementById('cf-first').value.trim();
  const last=document.getElementById('cf-last').value.trim();
  const type=document.getElementById('cf-type').value;
  if(!first||!last){toast('Enter a name');return;}
  const joinYear=type==='crew'?(parseInt(document.getElementById('cf-join').value)||CY):null;
  const outings=type==='visitor'?(parseInt(document.getElementById('cf-out').value)||0):0;
  const phone=document.getElementById('cf-phone').value.trim();

  // Close the form immediately so the UI feels responsive
  document.getElementById('cf-first').value='';document.getElementById('cf-last').value='';
  document.getElementById('cf-type').value='full';document.getElementById('cf-phone').value='';
  document.getElementById('cf-joinGrp').style.display='none';document.getElementById('cf-outGrp').style.display='none';
  document.getElementById('crewForm').classList.remove('open');
  const _ab=document.getElementById('crewAddBtn');if(_ab)_ab.style.display='flex';

  const newP={id:newCrewId(),first,last,type,joinYear,outings,phone,selected:true,paid:false};

  // Save to DB first — only add to roster / show success if it works
  setSyncStatus('syncing');
  const result=await sbUpsertCrew(currentBoat.id,newP);

  if(result&&result._err){
    // HTTP error from Supabase (e.g. RLS denied, constraint violation)
    toast('⚠ Could not save '+first+' — '+result._err.slice(0,60));
    setSyncStatus('offline');
    return; // do NOT add to in-memory roster — stay in sync with DB
  }
  if(result===null){
    // Network failure
    toast('⚠ No database connection — '+first+' was not saved');
    setSyncStatus('offline');
    return;
  }

  // DB save succeeded — now update in-memory state
  roster.push(newP);
  setSyncStatus('ok');
  cacheRosterLocally(currentBoat.id,roster);
  saveCrewSelection(currentBoat?.id);
  renderCrew();
  toast(first+' '+last+' added ✓');
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
  document.getElementById('ef-phone').value=p.phone||'';
  onEditTypeChange();
  document.getElementById('editSheet').classList.add('open');
}
async function saveEdit(){
  const p=roster.find(r=>r.id===editingId);if(!p)return;
  const first=document.getElementById('ef-first').value.trim();
  const last=document.getElementById('ef-last').value.trim();
  if(!first||!last){toast('Enter a name');return;}
  // Capture original values in case we need to roll back
  const orig={first:p.first,last:p.last,type:p.type,joinYear:p.joinYear,outings:p.outings,phone:p.phone};
  p.first=first;p.last=last;p.type=document.getElementById('ef-type').value;
  p.joinYear=p.type==='crew'?(parseInt(document.getElementById('ef-join').value)||CY):null;
  p.outings=p.type==='visitor'?(parseInt(document.getElementById('ef-out').value)||0):0;
  p.phone=document.getElementById('ef-phone').value.trim();
  closeSheet('editSheet');
  setSyncStatus('syncing');
  const result=await sbUpsertCrew(currentBoat.id,p);
  if(result&&result._err){
    Object.assign(p,orig); // roll back in-memory change
    toast('⚠ Could not save changes — '+result._err.slice(0,60));
    setSyncStatus('offline');
    renderCrew();
    return;
  }
  if(result===null){
    Object.assign(p,orig);
    toast('⚠ No database connection — changes not saved');
    setSyncStatus('offline');
    renderCrew();
    return;
  }
  setSyncStatus('ok');
  cacheRosterLocally(currentBoat.id,roster);
  renderCrew();
  toast(first+' updated ✓');
}
function deleteCrew(){
  const p=roster.find(r=>r.id===editingId);if(!p)return;
  if(!confirm('Remove '+p.first+' '+p.last+'?'))return;
  const delId=editingId;
  roster=roster.filter(r=>r.id!==editingId);
  sbDeleteCrew(delId).then(()=>{setSyncStatus('ok');cacheRosterLocally(currentBoat.id,roster);});
  saveCrewSelection(currentBoat?.id);
  closeSheet('editSheet');renderCrew();toast(p.first+' removed');
}
// ── Boat config: PIN, Revolut, Stripe ────────────────────────
// In-memory cache loaded from DB on login, written back on change
// localStorage used as fallback when offline
let boatConfig={};    // {pin, revolut_user} for currentBoat
let clubSettings={stripe_link_member:'',stripe_link_student:'',stripe_link_visitor:'',pre_race_window_hours:12,estella_url:'',worldtides_key:'',ro_revolut_user:'',results_published_race_key:''};  // club-wide

async function loadBoatConfig(boatId){
  // Try DB first
  const cfg=await sbLoadBoatConfig(boatId);
  if(cfg){
    boatConfig=cfg;
    try{localStorage.setItem('cfg_'+boatId,JSON.stringify(cfg));}catch(e){}
  } else {
    try{
      const cached=localStorage.getItem('cfg_'+boatId);
      boatConfig=cached?JSON.parse(cached):{pin:'0000',revolut_user:''};
    }catch(e){ boatConfig={pin:'0000',revolut_user:''}; }
  }
}
async function loadClubSettings(){
  const cfg=await sbLoadClubSettings();
  if(cfg){
    clubSettings=cfg;
    try{localStorage.setItem('__club_settings__',JSON.stringify(cfg));}catch(e){}
    if(cfg.features) try{localStorage.setItem('__features__',JSON.stringify(cfg.features));}catch(e){}
    _applyDbClubConfig(cfg);
  } else {
    try{
      const cached=localStorage.getItem('__club_settings__');
      clubSettings=cached?JSON.parse(cached):{stripe_link_member:'',stripe_link_student:'',stripe_link_visitor:'',pre_race_window_hours:12,estella_url:''};
    }catch(e){ clubSettings={stripe_link_member:'',stripe_link_student:'',stripe_link_visitor:'',estella_url:''}; }
  }
  applyAllFeatureVisibility();
}

// Merge DB-sourced club config into _C and refresh anything that depends on it.
// DB values take precedence over env var values so clubs can update without a
// Netlify redeploy.  Fields with no DB value fall back to the existing _C value.
function _applyDbClubConfig(cfg){
  // Geography
  if(cfg.start_lat  != null) _C.startLat       = cfg.start_lat;
  if(cfg.start_lng  != null) _C.startLng       = cfg.start_lng;
  if(cfg.wind_lat   != null) _C.windLat        = cfg.wind_lat;
  if(cfg.wind_lng   != null) _C.windLng        = cfg.wind_lng;

  // Tides
  if(cfg.tide_station)       _C.tideStation    = cfg.tide_station;
  if(cfg.tide_odm_offset != null) _C.tideOdmOffset = cfg.tide_odm_offset;

  // External links
  if(cfg.noticeboard_url)    _C.noticeboardUrl = cfg.noticeboard_url;
  if(cfg.results_url)        _C.resultsUrl     = cfg.results_url;

  // Integrations
  if(cfg.hal_club     != null){ _C.halClub = cfg.hal_club; HAL_CLUB = cfg.hal_club; }
  if(cfg.vapid_public_key){ _C.vapidPublicKey = cfg.vapid_public_key; VAPID_PUBLIC_KEY = cfg.vapid_public_key; }

  // Fees & limits
  if(cfg.fee_full  != null) FEES.full      = cfg.fee_full;
  if(cfg.fee_crew  != null) FEES.crew      = cfg.fee_crew;
  if(cfg.fee_visitor != null) FEES.visitor  = cfg.fee_visitor;
  if(cfg.fee_student != null) FEES.student  = cfg.fee_student;
  if(cfg.fee_kid   != null) FEES.kid       = cfg.fee_kid;
  if(cfg.visitor_max  != null) VISITOR_MAX  = cfg.visitor_max;
  if(cfg.crew_max_yrs != null) CREW_MAX_YRS = cfg.crew_max_yrs;

  // RO PIN
  if(cfg.ro_pin) RO_PIN = cfg.ro_pin;

  // Branding — re-apply only if DB provides values not present in env var
  let brandingChanged = false;
  if(cfg.logo_url && !(_C.logoUrl||_C.logoURL||_C.logourl||_C.logo_url||_C.logo)){
    _C.logoUrl = cfg.logo_url; brandingChanged = true;
  }
  if(cfg.favicon_url && !(_C.faviconUrl||_C.faviconurl)){
    _C.faviconUrl = cfg.favicon_url; brandingChanged = true;
  }
  if(cfg.primary_color && !_C.primaryColor){
    _C.primaryColor = cfg.primary_color; brandingChanged = true;
  }
  if(cfg.ro_color && !_C.roColor){
    _C.roColor = cfg.ro_color; brandingChanged = true;
  }
  if(brandingChanged) _reapplyBranding();
}

function _reapplyBranding(){
  const short   = _C.short || 'GBSC';
  const logoUrl = _C.logoUrl||_C.logoURL||_C.logourl||_C.logo_url||_C.logo||'';
  const img = document.getElementById('clubLogoImg');
  if(img && logoUrl){
    img.src = logoUrl; img.alt = short; img.style.display = '';
    const fb = document.getElementById('hlf'); if(fb) fb.style.display = 'none';
  }
  const faviconUrl = _C.faviconUrl||_C.faviconurl||logoUrl||'';
  if(faviconUrl){
    const fi = document.querySelector('link[rel="icon"]');
    const ai = document.querySelector('link[rel="apple-touch-icon"]');
    const ext = faviconUrl.split('.').pop().toLowerCase();
    const mime = ext==='svg'?'image/svg+xml':ext==='png'?'image/png':'image/jpeg';
    if(fi){ fi.href=faviconUrl; fi.type=mime; }
    if(ai)  ai.href=faviconUrl;
  }
  if(_C.primaryColor){
    document.documentElement.style.setProperty('--teal', _C.primaryColor);
    document.documentElement.style.setProperty('--border', 'rgba('+hexToRgb(_C.primaryColor)+',0.18)');
  }
  if(_C.roColor) document.documentElement.style.setProperty('--ro', _C.roColor);
}
function applyAllFeatureVisibility(){
  // Use DB-loaded features if available; fall back to the fast-apply localStorage cache.
  let f=(clubSettings&&clubSettings.features);
  if(!f||typeof f!=='object'){
    try{ f=JSON.parse(localStorage.getItem('__features__')||'{}'); }catch(e){ f={}; }
  }
  Object.keys(FEAT_TILE_MAP).forEach(key=>{
    const def=FEAT_DEFAULTS[key]!==undefined?FEAT_DEFAULTS[key]:true;
    const on=f[key]!==undefined?!!f[key]:def;
    FEAT_TILE_MAP[key].forEach(id=>{
      const el=document.getElementById(id);
      if(el) el.style.display=on?'':'none';
    });
  });
  if(f.feeModel!==undefined) FEAT.feeModel=f.feeModel;
  // Fee summary in crew panel is irrelevant when billing is per-series
  const crewTotals=document.getElementById('crewTotalsPanel');
  if(crewTotals) crewTotals.style.display=FEAT.feeModel==='per-series'?'none':'';
  if(f.declaration!==undefined) FEAT.declaration=!!f.declaration;
  if(f.courseCard!==undefined) FEAT.courseCard=!!f.courseCard;
  else FEAT.courseCard=(FEAT_DEFAULTS.courseCard===true);
  const feeLabel=document.getElementById('dc-fees-label');
  if(feeLabel) feeLabel.textContent=FEAT.feeModel==='per-series'?'Series Fees':'Fees';
}

function getBoatPin(id){
  // For login screen we need the PIN before loading config — use localStorage cache
  if(currentBoat&&currentBoat.id===id) return boatConfig.pin||'0000';
  try{ const c=localStorage.getItem('cfg_'+id); return c?JSON.parse(c).pin||'0000':'0000'; }catch(e){ return'0000'; }
}
function getRoPin(){ try{return localStorage.getItem('pin_ro')||RO_PIN;}catch(e){return RO_PIN;} }
function setRoPin(pin){ try{localStorage.setItem('pin_ro',pin);}catch(e){} }

async function setBoatPin(id,pin){
  // Persist to DB first — only update local cache on success
  const result=await sbSaveBoatConfig(id,{pin});
  if(!result||result._err) return false;
  if(currentBoat&&currentBoat.id===id) boatConfig.pin=pin;
  try{
    const c=localStorage.getItem('cfg_'+id);
    const obj=c?JSON.parse(c):{};
    obj.pin=pin;
    localStorage.setItem('cfg_'+id,JSON.stringify(obj));
  }catch(e){}
  return true;
}

function getRevolutUser(){
  return boatConfig.revolut_user||'';
}
function getStripeLink(type){
  if(type==='student') return clubSettings.stripe_link_student||'';
  if(type==='visitor') return clubSettings.stripe_link_visitor||'';
  return clubSettings.stripe_link_member||''; // full, crew, kid (kid is free anyway)
}
function hasAnyStripeLink(){
  return !!(clubSettings.stripe_link_member||clubSettings.stripe_link_student||clubSettings.stripe_link_visitor);
}
function getRORevolutUser(){ return clubSettings.ro_revolut_user||''; }
async function saveBoatSettings(revolut_user){
  boatConfig.revolut_user=revolut_user;
  try{
    const c=localStorage.getItem('cfg_'+currentBoat?.id)||'{}';
    const obj=JSON.parse(c);
    obj.revolut_user=revolut_user;
    localStorage.setItem('cfg_'+currentBoat?.id,JSON.stringify(obj));
  }catch(e){}
  await sbSaveBoatConfig(currentBoat.id,{revolut_user});
}
async function saveClubStripeLinks(links){
  Object.assign(clubSettings,links);
  try{localStorage.setItem('__club_settings__',JSON.stringify(clubSettings));}catch(e){}
  const r=await sbSaveClubSettings(links);
  if(!r||r._err){
    toast('⚠ Settings saved locally only — DB error: '+(r&&r._err?r._err.slice(0,60):'network error'));
    console.error('sbSaveClubSettings failed',r);
  }
}

// ── Push notifications ────────────────────────────────────────
let VAPID_PUBLIC_KEY=_C.vapidPublicKey||''; // updated from DB settings in _applyDbClubConfig

function urlBase64ToUint8Array(b64){
  const pad='='.repeat((4-b64.length%4)%4);
  const raw=atob((b64+pad).replace(/-/g,'+').replace(/_/g,'/'));
  return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
}

async function checkNotifSupport(){
  return ('serviceWorker' in navigator)&&('PushManager' in window)&&('Notification' in window);
}

async function openSettingsSheet(){
  document.getElementById('settings-revolut').value=getRevolutUser();
  // Notification toggle state
  const supported=await checkNotifSupport();
  const row=document.getElementById('notif-row');
  const hint=document.getElementById('notif-hint');
  if(!supported){
    if(row) row.style.display='none';
  } else {
    if(row) row.style.display='';
    const reg=await navigator.serviceWorker.ready;
    const sub=await reg.pushManager.getSubscription();
    const granted=Notification.permission==='granted';
    // Only show as enabled when browser subscription + permission + DB save all confirmed
    const savedEndpoint=localStorage.getItem('_push_endpoint');
    const isEnabled=!!(sub&&granted&&savedEndpoint&&savedEndpoint===sub.endpoint);
    document.getElementById('notif-toggle').checked=isEnabled;
    if(hint){
      if(Notification.permission==='denied')
        hint.textContent='Notifications blocked in browser settings — enable them there first';
      else if(isEnabled)
        hint.textContent='You\'ll be notified when the RO publishes today\'s course';
      else
        hint.textContent='';
    }
  }
  document.getElementById('settingsSheet').classList.add('open');
}

async function onNotifToggle(enabled){
  const hint=document.getElementById('notif-hint');
  const setHint=(msg,color)=>{if(hint){hint.textContent=msg;hint.style.color=color||'var(--muted)';}};
  const uncheck=()=>{document.getElementById('notif-toggle').checked=false;};

  if(enabled){
    // iOS requires the app to be installed to the home screen
    const isIOS=/iPhone|iPad|iPod/i.test(navigator.userAgent);
    const isStandalone=window.navigator.standalone===true||window.matchMedia('(display-mode:standalone)').matches;
    if(isIOS&&!isStandalone){
      uncheck();
      setHint('On iPhone, install the app to your home screen first — see Help → Install as an App');
      toast('Install app to home screen first');
      return;
    }

    if(Notification.permission==='denied'){
      uncheck();
      setHint('Notifications blocked — enable them in iPhone Settings → Notifications → GBSC Racing');
      return;
    }

    let permission;
    try{ permission=await Notification.requestPermission(); }
    catch(e){ uncheck(); setHint('Notifications not supported on this browser'); return; }

    if(permission!=='granted'){
      uncheck();
      setHint('Permission not granted');
      return;
    }

    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      const saveErr=await savePushSub(sub);
      if(!saveErr){
        localStorage.setItem('_push_endpoint', sub.endpoint);
        toast('Notifications enabled ✓');
        setHint('You\'ll be notified when the RO publishes today\'s course','var(--teal)');
      } else {
        // DB save failed — clean up the browser subscription too so state stays in sync
        try{ await sub.unsubscribe(); }catch(e){}
        localStorage.removeItem('_push_endpoint');
        uncheck();
        setHint('Save failed: '+saveErr,'var(--danger)');
        toast('⚠ '+saveErr.slice(0,60));
      }
    }catch(err){
      console.error('Push subscribe error',err);
      localStorage.removeItem('_push_endpoint');
      uncheck();
      const msg=err.message||String(err);
      setHint('Error: '+msg,'var(--danger)');
      toast('⚠ '+msg.slice(0,60));
    }

  } else {
    try{
      const reg=await navigator.serviceWorker.ready;
      const sub=await reg.pushManager.getSubscription();
      if(sub){
        await sbFetch('/rest/v1/push_subscriptions?endpoint=eq.'+encodeURIComponent(sub.endpoint),
          {method:'DELETE',headers:{...SBH}});
        await sub.unsubscribe();
      }
      localStorage.removeItem('_push_endpoint');
      toast('Notifications disabled');
      setHint('');
    }catch(err){
      console.error('Push unsubscribe error',err);
      toast('Could not disable notifications');
    }
  }
}

async function savePushSub(sub){
  if(!currentBoat) return 'No boat loaded — log in first';
  const j=sub.toJSON();
  if(!j.keys) return 'Subscription missing keys (browser compatibility issue)';
  const r=await sbFetch('/rest/v1/push_subscriptions',{
    method:'POST',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({boat_id:currentBoat.id,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth})
  });
  if(r===null) return 'Network error — check connection';
  if(r&&r._err){
    // 23505 = unique_violation — endpoint already in DB, treat as success
    if(r._err.includes('23505')||r._err.includes('unique')) return null;
    return 'DB error: '+r._err;
  }
  return null;
}

// ── Help sheet ────────────────────────────────────────────────
function openHelpSheet(){
  document.getElementById('helpSheet').classList.add('open');
}
function toggleHelpSection(id){
  const body=document.getElementById(id);
  const chev=document.getElementById(id+'-chev');
  const isOpen=body.classList.contains('open');
  body.classList.toggle('open',!isOpen);
  chev.classList.toggle('open',!isOpen);
}
function saveSettings(){
  const rev=document.getElementById('settings-revolut').value.trim().replace(/^@/,'');
  saveBoatSettings(rev);
  closeSheet('settingsSheet');
  toast('Settings saved ✓');
}
async function openROClubSettings(){
  // Always reload from DB first so form reflects actual saved values,
  // not potentially stale in-memory state
  const fresh=await sbLoadClubSettings();
  if(fresh) { clubSettings=fresh; try{localStorage.setItem('__club_settings__',JSON.stringify(fresh));}catch(e){} }
  document.getElementById('ro-stripe-member').value=clubSettings.stripe_link_member||'';
  document.getElementById('ro-stripe-student').value=clubSettings.stripe_link_student||'';
  document.getElementById('ro-stripe-visitor').value=clubSettings.stripe_link_visitor||'';
  document.getElementById('ro-pre-race-window').value=clubSettings.pre_race_window_hours||12;
  document.getElementById('ro-estella-url').value=clubSettings.estella_url||'';
  document.getElementById('ro-worldtides-key').value=clubSettings.worldtides_key||'';
  document.getElementById('ro-revolut-user').value=clubSettings.ro_revolut_user||'';
  document.getElementById('roClubSettingsSheet').classList.add('open');
}
function saveROClubSettings(){
  const windowHours=parseInt(document.getElementById('ro-pre-race-window').value)||12;

  // For each stripe link: use the typed value if non-empty,
  // otherwise keep the existing saved value — never overwrite with blank
  const memberVal =document.getElementById('ro-stripe-member').value.trim();
  const studentVal=document.getElementById('ro-stripe-student').value.trim();
  const visitorVal=document.getElementById('ro-stripe-visitor').value.trim();
  const estellaVal=document.getElementById('ro-estella-url').value.trim();
  const tidesKeyVal=document.getElementById('ro-worldtides-key').value.trim();
  const roRevolutVal=document.getElementById('ro-revolut-user').value.trim().replace(/^@/,'');

  saveClubStripeLinks({
    stripe_link_member:   memberVal  !==''?memberVal  :clubSettings.stripe_link_member||'',
    stripe_link_student:  studentVal !==''?studentVal :clubSettings.stripe_link_student||'',
    stripe_link_visitor:  visitorVal !==''?visitorVal :clubSettings.stripe_link_visitor||'',
    pre_race_window_hours: windowHours,
    estella_url: estellaVal,
    worldtides_key: tidesKeyVal,
    ro_revolut_user: roRevolutVal,
  });
  clubSettings.pre_race_window_hours=windowHours;
  clubSettings.estella_url=estellaVal;
  clubSettings.worldtides_key=tidesKeyVal;
  clubSettings.ro_revolut_user=roRevolutVal;
  updateEstellaLink();
  closeSheet('roClubSettingsSheet');
  toast('Club settings saved ✓');
  renderCourseDiagram();
}

// ── Race Schedule Management (RO) ────────────────────────────────────────
async function openRaceSchedulePanel(){
  openPanel('roRacePanel');
  hideRaceForm();
  await renderRaceScheduleList();
  // Update subtile count
  const sub=document.getElementById('roRaceScheduleSub');
  if(sub) sub.textContent=allRaces.length+' races loaded';
}

async function renderRaceScheduleList(){
  const list=document.getElementById('roRaceList');
  list.innerHTML='<div style="text-align:center;color:var(--muted);padding:20px">Loading…</div>';
  // Fetch ALL races (including cancelled) for management view
  const rows=await sbFetch('/rest/v1/races?order=race_date.asc,sort_order.asc&select=*');
  if(!rows||rows._err){
    list.innerHTML='<div class="empty-state"><div class="icon">⚠️</div><div>Could not load races</div></div>';
    return;
  }
  if(!rows.length){
    list.innerHTML='<div class="empty-state"><div class="icon">📅</div><div>No races scheduled yet</div></div>';
    return;
  }
  // Populate series datalist for the form
  const seriesSet=new Set(rows.map(r=>r.series).filter(Boolean));
  const dl=document.getElementById('rf-series-list');
  if(dl) dl.innerHTML=[...seriesSet].map(s=>`<option value="${s}">`).join('');
  // Group by series
  const groups={};
  rows.forEach(r=>{
    const s=r.series||'Other';
    if(!groups[s]) groups[s]=[];
    groups[s].push(r);
  });
  let html='';
  Object.entries(groups).forEach(([series,races])=>{
    html+=`<div class="race-mgmt-series">${series}</div>`;
    races.forEach(r=>{
      const d=new Date(r.race_date+'T00:00:00');
      const dateStr=d.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'});
      const hh=String(r.start_hour||19).padStart(2,'0');
      const mm=String(r.start_min||0).padStart(2,'0');
      const cancelled=!r.active;
      html+=`<div class="race-mgmt-row${cancelled?' cancelled':''}" data-id="${r.id}">
        <div class="race-mgmt-info">
          <div class="race-mgmt-label">${r.label}</div>
          <div class="race-mgmt-date">${dateStr} · ${hh}:${mm}</div>
        </div>
        <div class="race-mgmt-actions">
          <button class="race-mgmt-btn edit" onclick="openEditRaceForm(${r.id})" title="Edit">✏️</button>
          <button class="race-mgmt-btn ${cancelled?'uncancel':'cancel'}"
            onclick="toggleRaceCancelled(${r.id},${r.active})"
            title="${cancelled?'Restore':'Cancel'}">${cancelled?'↩':'✕'}</button>
        </div>
      </div>`;
    });
  });
  list.innerHTML=html;
}

async function toggleRaceCancelled(id,currentlyActive){
  await sbFetch('/rest/v1/races?id=eq.'+id,{
    method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({active:!currentlyActive})
  });
  await renderRaceScheduleList();
  await loadRaceSchedule(); // keep in-memory schedule in sync
}

function openAddRaceForm(){
  const form=document.getElementById('roRaceForm');
  document.getElementById('roRaceFormTitle').textContent='Add Race';
  document.getElementById('rf-id').value='';
  document.getElementById('rf-label').value='';
  document.getElementById('rf-date').value='';
  document.getElementById('rf-time').value='19:00';
  document.getElementById('rf-series').value='';
  document.getElementById('rf-sort').value='99';
  form.style.display='block';
  form.scrollIntoView({behavior:'smooth'});
}

async function openEditRaceForm(id){
  const rows=await sbFetch('/rest/v1/races?id=eq.'+id+'&select=*');
  if(!rows||!rows.length) return;
  const r=rows[0];
  const form=document.getElementById('roRaceForm');
  document.getElementById('roRaceFormTitle').textContent='Edit Race';
  document.getElementById('rf-id').value=r.id;
  document.getElementById('rf-label').value=r.label;
  document.getElementById('rf-date').value=r.race_date;
  const hh=String(r.start_hour||19).padStart(2,'0');
  const mm=String(r.start_min||0).padStart(2,'0');
  document.getElementById('rf-time').value=hh+':'+mm;
  document.getElementById('rf-series').value=r.series||'';
  document.getElementById('rf-sort').value=r.sort_order||0;
  form.style.display='block';
  form.scrollIntoView({behavior:'smooth'});
}

function hideRaceForm(){
  const f=document.getElementById('roRaceForm');
  if(f) f.style.display='none';
}

async function saveRace(){
  const id=document.getElementById('rf-id').value;
  const label=document.getElementById('rf-label').value.trim();
  const date=document.getElementById('rf-date').value;
  const time=document.getElementById('rf-time').value||'19:00';
  const [hourStr,minStr]=time.split(':');
  const series=document.getElementById('rf-series').value.trim();
  const sort=parseInt(document.getElementById('rf-sort').value,10)||0;
  if(!label||!date){alert('Race name and date are required');return;}
  const payload={label,race_date:date,start_hour:parseInt(hourStr,10),
    start_min:parseInt(minStr,10),series,sort_order:sort};
  if(id){
    await sbFetch('/rest/v1/races?id=eq.'+id,{
      method:'PATCH',headers:{...SBH,'Prefer':'return=minimal'},body:JSON.stringify(payload)});
  } else {
    await sbFetch('/rest/v1/races',{
      method:'POST',headers:{...SBH,'Prefer':'return=minimal'},body:JSON.stringify(payload)});
  }
  hideRaceForm();
  await renderRaceScheduleList();
  await loadRaceSchedule();
}

async function browseEstelaRaces(){
  const content=document.getElementById('estelaPickerContent');
  content.innerHTML='<div class="empty-state"><div class="icon">⏳</div><div>Loading your races from eStela…</div></div>';
  document.getElementById('estelaPickerSheet').classList.add('open');

  let data;
  try{ const r=await fetch('/.netlify/functions/estela-races'); data=await r.json(); }
  catch(e){ data={error:String(e)}; }

  if(data.error){
    const isNotConfigured=data.error.includes('not configured');
    content.innerHTML=
      '<div class="empty-state">'+
        '<div class="icon">⚠</div>'+
        '<div style="font-size:.9rem;color:var(--white);margin-bottom:6px">'+(isNotConfigured?'API key not yet set up':'Could not reach eStela')+'</div>'+
        '<div style="font-size:.75rem;color:var(--muted);line-height:1.5;max-width:280px;text-align:center">'+
          (isNotConfigured
            ? 'Add <strong style="color:var(--white)">ESTELA_API_KEY</strong> to your Netlify environment variables, then redeploy.'
            : data.error.slice(0,120))+
        '</div>'+
      '</div>';
    return;
  }

  if(!data.races||!data.races.length){
    content.innerHTML='<div class="empty-state"><div class="icon">📡</div><div>No races found on your eStela account</div></div>';
    return;
  }

  window._estelaRaces=data.races;
  content.innerHTML=data.races.map((race,i)=>{
    const d=race.start_at?new Date(race.start_at).toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'}):'';
    return `<div onclick="pickEstelaRace(${i})"
      style="display:flex;align-items:center;gap:12px;padding:12px 14px;
        background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;
        margin-bottom:8px;cursor:pointer;">
      <span style="font-size:1.2rem;flex-shrink:0">📡</span>
      <div style="flex:1;min-width:0;">
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:800;color:var(--white);
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${race.name}</div>
        ${d?`<div style="font-size:.8rem;color:var(--muted);margin-top:2px">${d}</div>`:''}
      </div>
      <span style="font-size:.75rem;color:var(--teal);font-weight:700;flex-shrink:0">Select →</span>
    </div>`;
  }).join('');
}

function pickEstelaRace(idx){
  const race=(window._estelaRaces||[])[idx];
  if(!race) return;
  document.getElementById('ro-estella-url').value=race.link;
  closeSheet('estelaPickerSheet');
  toast('Selected: '+race.name);
}

async function downloadDatabaseBackup(){
  toast('⏳ Preparing backup…');
  try{
    // Fetch all tables in parallel
    const [boats,settings,crew,registrations,courses,marks,records,protests]=await Promise.all([
      sbFetch('/rest/v1/boats?order=name.asc'),
      sbFetch('/rest/v1/settings'),
      sbFetch('/rest/v1/crew?order=boat_id.asc,last.asc'),
      sbFetch('/rest/v1/registrations?order=race_date.desc'),
      sbFetch('/rest/v1/published_courses'),
      sbFetch('/rest/v1/marks?order=sort_order.asc'),
      sbFetch('/rest/v1/race_records?order=submitted_at.desc'),
      sbFetch('/rest/v1/protests?order=filed_at.desc'),
    ]);

    const backup={
      _meta:{
        generated_at: new Date().toISOString(),
        app: 'GBSC Racing App',
        tables: ['boats','settings','crew','registrations','published_courses','marks','race_records','protests'],
      },
      boats:            boats||[],
      settings:         settings||[],
      crew:             crew||[],
      registrations:    registrations||[],
      published_courses:courses||[],
      marks:            marks||[],
      race_records:     records||[],
      protests:         protests||[],
    };

    const json=JSON.stringify(backup,null,2);
    const blob=new Blob([json],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    const date=new Date().toISOString().split('T')[0];
    a.href=url;
    a.download='gbsc-backup-'+date+'.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    const rowCount=Object.entries(backup)
      .filter(([k])=>k!=='_meta')
      .reduce((n,[,v])=>n+v.length,0);
    toast('✅ Backup downloaded — '+rowCount+' records');
  }catch(e){
    console.error('Backup failed',e);
    toast('⚠ Backup failed — check console');
  }
}

// Loads self-payments + skipper-marked payments from DB for a race and
// applies them to roster.paid. Calls renderCrew() so all summary elements
// (dashboard strip, crew panel totals, fees badge) reflect the fresh state.
async function loadAndApplyPayments(race){
  if(!race||!currentBoat)return;
  const key=raceKey(race);
  const [selfPays,racePayments]=await Promise.all([
    sbLoadSelfPayments(currentBoat.id,key),
    sbLoadRacePayments(currentBoat.id,key)
  ]);
  roster.forEach(p=>{p.paid=false;p.payMethod='';});
  if(Array.isArray(selfPays)){
    selfPays.forEach(sp=>{
      const p=roster.find(r=>r.id===sp.crew_id);
      if(p){p.paid=true;p.payMethod=(sp.method||'Paid')+' ✦ self-paid';}
    });
  }
  if(Array.isArray(racePayments)){
    racePayments.forEach(rp=>{
      const p=roster.find(r=>r.id===rp.crew_id);
      if(p){p.paid=true;p.payMethod=rp.method;}
    });
  }
  renderCrew();
}

// ═══════════════════════════════════════════════════════════════
// RACE FEES PANEL — unified collect / send / submit flow
// ═══════════════════════════════════════════════════════════════
async function openRaceFeesPanel(){
  // Always re-fetch crew from DB to catch additions from other devices / sessions
  if(currentBoat){
    const fresh=await sbLoadCrew(currentBoat.id);
    if(fresh!==null){
      // Preserve in-memory selected state where possible, then update roster
      const selSet=new Set(roster.filter(p=>p.selected).map(p=>p.id));
      roster=fresh.map(p=>({...p,selected:selSet.has(p.id),paid:false}));
      cacheRosterLocally(currentBoat.id,roster);
      renderCrew(); // keep crew tab in sync
    }
  }
  const sel=roster.filter(p=>p.selected);
  if(!sel.length){toast('Select crew in the Crew Roster first');return;}
  // Restore payment state from DB — self-payments (crew-initiated) + race_payments (skipper-marked)
  await loadAndApplyPayments(selectedRace||nextRace);
  renderRaceFeesPanel();
  openPanel('raceFeesPanel');
}

function renderRaceFeesPanel(){
  const body=document.getElementById('raceFeesBody'); if(!body)return;
  const sel=roster.filter(p=>p.selected);
  const unpaid=sel.filter(p=>!p.paid);
  const outstanding=unpaid.reduce((a,p)=>a+fee(p),0);
  const race=(selectedRace||nextRace)?.label||'Race';
  const revUser=getRevolutUser();

  // ── Summary ─────────────────────────────────────────────────
  let summary;
  if(outstanding>0){
    summary=`<div style="font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:800;color:var(--danger)">€${outstanding} outstanding</div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:2px">${unpaid.length} of ${sel.length} unpaid · ${race}</div>`;
  } else {
    const paid=sel.filter(p=>p.paid);
    const cashAmt=paid.filter(p=>p.payMethod==='Cash').reduce((a,p)=>a+fee(p),0);
    const revAmt=paid.filter(p=>p.payMethod&&p.payMethod.startsWith('Revolut')).reduce((a,p)=>a+fee(p),0);
    const toSubmit=cashAmt+revAmt;
    const roRev=getRORevolutUser();
    const roRevLink=roRev?`https://revolut.me/${roRev}`:'';
    let submitLines='';
    if(cashAmt) submitLines+=`<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">
      <span>💵 Cash — hand envelope to RO</span><span style="font-weight:800">€${cashAmt}</span></div>`;
    if(revAmt){
      const revAction=roRevLink
        ?`<a href="${roRevLink}" target="_blank" rel="noopener"
            style="font-family:'Barlow Condensed',sans-serif;font-size:.82rem;font-weight:800;
            padding:4px 10px;border-radius:6px;border:1px solid rgba(110,64,216,.5);
            background:rgba(110,64,216,.18);color:#a78bfa;text-decoration:none;white-space:nowrap">
            💜 Open Revolut</a>`
        :'<span style="font-size:.78rem;color:var(--muted)">Send via Revolut</span>';
      submitLines+=`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:6px 0">
        <span>💜 Revolut — send €${revAmt} to RO</span>${revAction}</div>`;
    }
    const submitCard=toSubmit>0
      ?`<div style="margin-top:12px;padding:12px 14px;background:rgba(232,160,32,.08);border:1px solid rgba(232,160,32,.3);border-radius:10px;font-size:.82rem;color:var(--white)">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:.9rem;font-weight:800;color:var(--ro);letter-spacing:.04em;margin-bottom:6px">SUBMIT TO RACE OFFICER · €${toSubmit}</div>
          ${submitLines}
        </div>`
      :`<div style="margin-top:10px;font-size:.78rem;color:var(--muted)">Card payments went directly to the club — nothing to submit.</div>`;
    summary=`<div style="font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:800;color:var(--success)">All fees collected ✓</div>
      <div style="font-size:.78rem;color:var(--muted);margin-top:2px">${sel.length} crew · ${race}</div>
      ${submitCard}`;
  }

  // ── Send link button ─────────────────────────────────────────
  const sendBtn=unpaid.length
    ?`<button onclick="openSharePayLink()"
        style="width:100%;display:flex;align-items:center;justify-content:center;gap:8px;
        background:rgba(0,174,239,.1);border:1px solid rgba(0,174,239,.3);border-radius:12px;
        padding:13px;cursor:pointer;font-family:'Barlow Condensed',sans-serif;font-size:1rem;
        font-weight:800;color:var(--teal);letter-spacing:.04em;margin-bottom:16px">
        📲 Send payment link to crew
      </button>`:'';

  // ── Crew rows ────────────────────────────────────────────────
  const rfBtn=(label,onclick,style)=>
    `<button onclick="${onclick}"
      style="display:flex;align-items:center;justify-content:center;gap:5px;
      font-family:'Barlow Condensed',sans-serif;font-size:.92rem;font-weight:800;
      letter-spacing:.03em;padding:11px 6px;border-radius:10px;cursor:pointer;width:100%;${style}">
      ${label}</button>`;

  const revStyle='background:rgba(110,64,216,.18);border:1px solid rgba(110,64,216,.5);color:#a78bfa';
  const cashStyle='background:rgba(45,198,83,.12);border:1px solid rgba(45,198,83,.4);color:var(--success)';
  const cardStyle='background:rgba(0,174,239,.1);border:1px solid rgba(0,174,239,.35);color:var(--teal)';
  const offStyle='background:transparent;border:1px dashed rgba(255,255,255,.12);color:var(--muted);opacity:.4;cursor:default';

  let crewRows='';
  sel.forEach(p=>{
    const amt=fee(p);
    const typeLabel=p.type==='full'?'Member':p.type==='crew'?'Crew Member':p.type==='student'?'Student':p.type==='visitor'?'Visitor':'Junior';
    if(p.paid){
      crewRows+=`<div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div class="cc-avatar" style="width:36px;height:36px;font-size:.8rem;flex-shrink:0">${ini(p)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-size:.92rem;font-weight:700">${p.first} ${p.last}</div>
          <div style="font-size:.78rem;color:var(--success);font-weight:600">✓ ${p.payMethod||'Paid'}</div>
        </div>
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:800;color:var(--success)">€${amt}</span>
        <button onclick="rfUnpay('${p.id}')"
          style="font-size:.75rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;
          padding:4px 10px;border-radius:6px;border:1px solid var(--border);
          background:transparent;color:var(--muted);cursor:pointer">Undo</button>
      </div>`;
    } else {
      const revBtn=revUser
        ?rfBtn('💜 Revolut',`rfPayRevolut('${p.id}')`,revStyle)
        :rfBtn('💜 Revolut',`toast('Set your Revolut @username in Settings ⚙')`,offStyle);
      const cashBtn=rfBtn('💵 Cash',`rfMarkPaid('${p.id}','Cash')`,cashStyle);
      const stripeLink=getStripeLink(p.type);
      const cardBtn=stripeLink
        ?rfBtn('💳 Card',`rfPayCard('${p.id}')`,cardStyle)
        :rfBtn('💳 Card',`toast('Card links not configured — see RO Club Settings')`,offStyle);
      crewRows+=`<div style="padding:12px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          <div class="cc-avatar" style="width:36px;height:36px;font-size:.8rem;flex-shrink:0">${ini(p)}</div>
          <div style="flex:1">
            <div style="font-size:.95rem;font-weight:700">${p.first} ${p.last}</div>
            <div style="font-size:.78rem;color:var(--muted)">${typeLabel}</div>
          </div>
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:800;color:var(--danger)">€${amt}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px">
          ${revBtn}${cashBtn}${cardBtn}
        </div>
      </div>`;
    }
  });

  // ── Footer ───────────────────────────────────────────────────
  const allPaid=unpaid.length===0;
  const footer=allPaid
    ?`<div style="padding:14px 0 4px;border-top:1px solid var(--border);margin-top:4px;
        text-align:center;color:var(--success);font-family:'Barlow Condensed',sans-serif;
        font-size:1rem;font-weight:700;letter-spacing:.04em">✅ All paid — record auto-saved</div>`
    :`<div style="display:flex;gap:8px;padding:16px 0 4px;border-top:1px solid var(--border);
        margin-top:4px;position:sticky;bottom:0;background:var(--navy)">
        ${unpaid.length>1?`<button onclick="rfMarkAllCash()"
          style="flex:1;padding:12px;font-family:'Barlow Condensed',sans-serif;font-size:.92rem;
          font-weight:800;letter-spacing:.04em;border-radius:10px;cursor:pointer;
          background:rgba(45,198,83,.12);border:1px solid rgba(45,198,83,.4);color:var(--success)">
          ✓ All Cash</button>`:''}
      </div>`;

  body.innerHTML=
    `<div style="padding:4px 0 16px;border-bottom:1px solid var(--border);margin-bottom:16px">${summary}</div>`+
    sendBtn+
    `<div>${crewRows}</div>`+
    footer;
}

// ── Race Fees panel actions ───────────────────────────────────
function rfMarkPaid(id,method){
  const p=roster.find(r=>r.id===id); if(!p)return;
  const sel=roster.filter(q=>q.selected);
  const wasAllPaid=sel.every(q=>q.paid);
  p.paid=true; p.payMethod=method;
  renderCrew(); renderRaceFeesPanel();
  toast(p.first+' — '+method+' ✓');
  const race=selectedRace||nextRace;
  if(race&&currentBoat){
    sbUpsertRacePayment({
      boat_id:currentBoat.id, crew_id:id,
      race_key:raceKey(race), race_name:race.label,
      race_date:race.date.toISOString().split('T')[0],
      method, amount:fee(p)
    });
    autoSaveRaceRecord();
    if(!wasAllPaid&&sel.every(q=>q.paid)) incrementVisitorOutings();
  }
}
function rfUnpay(id){
  const p=roster.find(r=>r.id===id); if(!p)return;
  p.paid=false; p.payMethod='';
  renderCrew(); renderRaceFeesPanel();
  const race=selectedRace||nextRace;
  if(race){ sbDeleteRacePayment(id,raceKey(race)); autoSaveRaceRecord(); }
}
function rfMarkAllCash(){
  const unpaid=roster.filter(p=>p.selected&&!p.paid);
  if(!unpaid.length){toast('All already paid ✓');return;}
  const wasAllPaid=false; // there are unpaid crew, so definitely not all paid
  unpaid.forEach(p=>{p.paid=true;p.payMethod='Cash';});
  renderCrew(); renderRaceFeesPanel();
  toast('All '+unpaid.length+' marked Cash ✓');
  const race=selectedRace||nextRace;
  if(race&&currentBoat){
    const key=raceKey(race);
    unpaid.forEach(p=>{
      sbUpsertRacePayment({
        boat_id:currentBoat.id, crew_id:p.id,
        race_key:key, race_name:race.label,
        race_date:race.date.toISOString().split('T')[0],
        method:'Cash', amount:fee(p)
      });
    });
    autoSaveRaceRecord();
    if(roster.filter(q=>q.selected).every(q=>q.paid)) incrementVisitorOutings();
  }
}
function rfPayRevolut(id){
  // Skipper confirms they received a Revolut payment — just mark paid
  rfMarkPaid(id,'Revolut');
}
function rfPayCard(id){
  // Skipper confirms card payment received — just mark paid
  rfMarkPaid(id,'Card');
}

// ── Phone number normaliser (wa.me format) ────────────────────
function isMobile(){ return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent); }
function fmtWaPhone(ph){
  let d=ph.replace(/[^\d+]/g,'');
  if(d.startsWith('+')) d=d.slice(1);
  else if(d.startsWith('00')) d=d.slice(2);
  else if(d.startsWith('0')) d='353'+d.slice(1);
  return d;
}

// ── Stripe QR modal ───────────────────────────────────────────
function showStripeQR(firstName,stripeLink,amt){
  const existing=document.getElementById('_stripeQROverlay');
  if(existing) existing.remove();
  const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(stripeLink);
  const el=document.createElement('div');
  el.id='_stripeQROverlay';
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;';
  el.innerHTML=`
    <div style="background:#112240;border:1px solid rgba(0,180,216,.3);border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;color:#f0f4f8;margin-bottom:4px">💳 Card Payment — ${firstName}</div>
      <div style="font-size:.8rem;color:#7a8fa6;margin-bottom:16px">Ask them to scan to pay €${amt}</div>
      <div style="background:white;border-radius:10px;padding:12px;display:inline-block;margin-bottom:16px">
        <img src="${qrUrl}" style="width:200px;height:200px;display:block">
      </div>
      <button onclick="document.getElementById('_stripeQROverlay').remove()"
        style="width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.2);
        border-radius:10px;color:#7a8fa6;cursor:pointer;font-family:'Barlow Condensed',sans-serif;
        font-size:.95rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Close</button>
    </div>`;
  el.addEventListener('click',e=>{if(e.target===el)el.remove();});
  document.body.appendChild(el);
}

// ── Revolut QR modal ──────────────────────────────────────────
function showRevolutQR(firstName,revLink,amt){
  const existing=document.getElementById('_revolutQROverlay');
  if(existing) existing.remove();
  const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(revLink);
  const el=document.createElement('div');
  el.id='_revolutQROverlay';
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;';
  el.innerHTML=`
    <div style="background:#112240;border:1px solid rgba(110,64,216,.4);border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;color:#f0f4f8;margin-bottom:4px">💜 Revolut — ${firstName}</div>
      <div style="font-size:.8rem;color:#7a8fa6;margin-bottom:4px">Ask them to scan with their camera</div>
      <div style="font-size:.78rem;color:#a78bfa;margin-bottom:16px;font-family:'Barlow Condensed',sans-serif;font-weight:600">Amount: €${amt}</div>
      <div style="background:white;border-radius:10px;padding:12px;display:inline-block;margin-bottom:16px">
        <img src="${qrUrl}" style="width:200px;height:200px;display:block">
      </div>
      <div style="font-size:.78rem;color:#7a8fa6;margin-bottom:14px">${revLink}</div>
      <button onclick="document.getElementById('_revolutQROverlay').remove()"
        style="width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.2);
        border-radius:10px;color:#7a8fa6;cursor:pointer;font-family:'Barlow Condensed',sans-serif;
        font-size:.95rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Close</button>
    </div>`;
  el.addEventListener('click',e=>{if(e.target===el)el.remove();});
  document.body.appendChild(el);
}

// ════════════════════════════════════════════════════════════
// RACE DAY WEATHER PANEL
// Source: Open-Meteo (free, no key) + WorldTides (optional key)
// ════════════════════════════════════════════════════════════

const GBSC_LAT=53.262, GBSC_LNG=-8.942; // Rinville, Oranmore, Galway Bay

function openWeatherPanel(){
  openPanel('weatherPanel');
  loadRaceWeather();
}

async function loadRaceWeather(){
  const body=document.getElementById('weatherBody'); if(!body) return;

  // If the current race has already passed, don't show a (misleading) forecast
  const race=nextRace||getNextRace();
  if(race&&race.date<new Date()){
    const nextFuture=allRaces.find(r=>r.date>new Date());
    const hint=nextFuture
      ? 'Next race: '+nextFuture.label+' · '+nextFuture.date.toLocaleDateString('en-IE',{weekday:'short',day:'numeric',month:'short'})
      : 'No upcoming race scheduled yet';
    body.innerHTML=`<div style="text-align:center;padding:60px 24px;color:var(--muted)">
      <div style="font-size:2rem;margin-bottom:12px">🌬️</div>
      <div style="font-size:1rem;font-weight:600;margin-bottom:8px">No forecast right now</div>
      <div style="font-size:.88rem">${hint}</div>
      <div style="font-size:.82rem;margin-top:6px;color:var(--muted)">Check back closer to race day</div>
    </div>`;
    return;
  }

  body.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted)">⏳ Loading conditions…</div>';
  // Clear any stale Open-Meteo tide cache (replaced by IMI ERDDAP)
  try{ const c=JSON.parse(localStorage.getItem('__race_tides__')||'null'); if(c&&c.src==='om') localStorage.removeItem('__race_tides__'); }catch(e){}
  try{
    const c=JSON.parse(localStorage.getItem('__race_weather_v2__')||'null');
    // Only use cache if tides were successfully fetched; re-fetch if tides is null
    if(c&&Date.now()-c.ts<3600000&&c.tides!=null){ renderWeather(c.wx,c.tides); return; }
    if(c&&Date.now()-c.ts<3600000&&c.wx){
      // wx is cached and fresh; only re-fetch tides
      const tides=await fetchTideData();
      try{ localStorage.setItem('__race_weather_v2__',JSON.stringify({ts:c.ts,wx:c.wx,tides})); }catch(e){}
      renderWeather(c.wx,tides); return;
    }
  }catch(e){}
  const [wx,tides]=await Promise.all([fetchOpenMeteo(),fetchTideData()]);
  try{ localStorage.setItem('__race_weather_v2__',JSON.stringify({ts:Date.now(),wx,tides})); }catch(e){}
  renderWeather(wx,tides);
}

async function fetchOpenMeteo(){
  const wxLat=_C.windLat||_C.startLat||GBSC_LAT;
  const wxLng=_C.windLng||_C.startLng||GBSC_LNG;
  const base='https://api.open-meteo.com/v1/forecast'
    +'?latitude='+wxLat+'&longitude='+wxLng
    +'&hourly=temperature_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m'
    +',wind_direction_10m,cloud_cover,surface_pressure,weather_code'
    +'&daily=sunset'
    +'&wind_speed_unit=kn&timezone=Europe%2FDublin&timeformat=unixtime';
  // Try AROME (Météo-France, 1.3km) first — best resolution for Irish coastal areas; 2-day horizon
  try{
    const r=await fetch(base+'&models=meteofrance_arome_france&forecast_days=2');
    if(r.ok){
      const data=await r.json();
      if(data.hourly&&data.hourly.time&&data.hourly.time.length) return data;
    }
  }catch(e){}
  // Fallback to Open-Meteo default best-match model (3-day)
  try{
    const r=await fetch(base+'&forecast_days=3'); if(!r.ok) return null;
    return await r.json();
  }catch(e){ return null; }
}

async function fetchTideData(){
  // WorldTides (precise) — used if API key configured
  const key=(clubSettings.worldtides_key||'').trim();
  if(key){
    try{
      const c=JSON.parse(localStorage.getItem('__race_tides__')||'null');
      if(c&&c.src==='wt'&&Date.now()-c.ts<43200000) return c.data;
    }catch(e){}
    try{
      const url='https://www.worldtides.info/api/v3?extremes&lat='+(_C.startLat||GBSC_LAT)+'&lon='+(_C.startLng||GBSC_LNG)
        +'&key='+encodeURIComponent(key)+'&days=3&stationDistance=50';
      const r=await fetch(url); if(!r.ok) throw new Error(r.status);
      const data=await r.json();
      try{ localStorage.setItem('__race_tides__',JSON.stringify({ts:Date.now(),src:'wt',data})); }catch(e){}
      return data;
    }catch(e){ /* fall through to Open-Meteo */ }
  }
  // Irish Marine Institute ERDDAP (free, no key, authoritative Irish state predictions)
  // Dataset: IMI_TidePrediction_HighLow — station and datum offset are club-configurable
  // Heights in metres above OD Malin Head; add tideOdmOffset to get Chart Datum (LAT) heights
  try{
    const c=JSON.parse(localStorage.getItem('__race_tides__')||'null');
    if(c&&c.src==='imi'&&Date.now()-c.ts<43200000) return c.data;
  }catch(e){}
  try{
    const raceDate=nextRace?nextRace.date:new Date();
    const from=new Date(raceDate); from.setHours(0,0,0,0);
    const to=new Date(from); to.setDate(to.getDate()+2);
    const fromStr=from.toISOString().split('.')[0]+'Z';
    const toStr=to.toISOString().split('.')[0]+'Z';
    const tideStation=_C.tideStation||_C.short||'Local';
    const odmOffset=_C.tideOdmOffset!==undefined?_C.tideOdmOffset:2.95;
    const url='https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.json'
      +'?stationID,time,tide_time_category,Water_Level_ODMalin'
      +'&stationID=%22'+encodeURIComponent(tideStation)+'%22'
      +'&time%3E='+fromStr
      +'&time%3C'+toStr
      +'&orderBy(%22time%22)';
    const r=await fetch(url); if(!r.ok) return null;
    const json=await r.json();
    if(!json.table||!json.table.rows) return null;
    const cols=json.table.columnNames;
    const ti=cols.indexOf('time'), ci=cols.indexOf('tide_time_category'), hi=cols.indexOf('Water_Level_ODMalin');
    const extremes=json.table.rows.map(row=>({
      type: row[ci]==='HIGH'?'High':'Low',
      date: row[ti],
      height: Math.round((row[hi]+odmOffset)*10)/10
    }));
    const data={extremes,station:tideStation,source:'imi'};
    try{ localStorage.setItem('__race_tides__',JSON.stringify({ts:Date.now(),src:'imi',data})); }catch(e){}
    return data;
  }catch(e){ return null; }
}

// ── Weather helpers ───────────────────────────────────────────
function wxBeaufort(kts){
  const thresholds=[1,4,7,11,17,22,28,34,41,48,56,64];
  const names=['Calm','Light air','Light breeze','Gentle breeze','Moderate breeze',
               'Fresh breeze','Strong breeze','Near gale','Gale','Severe gale','Storm','Violent storm','Hurricane'];
  const f=thresholds.filter(t=>kts>=t).length;
  return {f,desc:names[f]};
}
function wxCardinal(deg){
  return ['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'][Math.round(deg/22.5)%16];
}
function wxCondition(code){
  if(code===0) return {icon:'☀️',label:'Clear'};
  if(code<=2)  return {icon:'🌤️',label:'Partly cloudy'};
  if(code===3) return {icon:'☁️',label:'Overcast'};
  if(code<=49) return {icon:'🌫️',label:'Foggy'};
  if(code<=57) return {icon:'🌦️',label:'Drizzle'};
  if(code<=67) return {icon:'🌧️',label:'Rain'};
  if(code<=77) return {icon:'❄️',label:'Snow'};
  if(code<=82) return {icon:'🌦️',label:'Showers'};
  return {icon:'⛈️',label:'Thunderstorm'};
}
function wxPressureTrend(arr,idx){
  if(idx<3) return '→ Steady';
  const d=arr[idx]-arr[idx-3];
  if(d>2) return '↑ Rising'; if(d<-2) return '↓ Falling'; return '→ Steady';
}
function wxBfColour(f){ return f<=2?'var(--success)':f<=4?'var(--teal)':f<=6?'#f4a261':f<=8?'var(--warn)':'var(--danger)'; }

// ── Main render ───────────────────────────────────────────────
function renderWeather(wx,tides){
  const body=document.getElementById('weatherBody'); if(!body) return;
  if(!wx||!wx.hourly){
    body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted)">
      ⚠ Could not load weather data
      <br><button onclick="localStorage.removeItem('__race_weather__');loadRaceWeather()"
        style="margin-top:16px;padding:8px 20px;border-radius:8px;background:transparent;
        border:1px solid var(--border);color:var(--teal);cursor:pointer;font-family:inherit">↺ Retry</button>
    </div>`; return;
  }

  const race=nextRace||getNextRace();
  const raceDate=race?race.date:new Date();
  const now=new Date();
  const isToday=raceDate.toDateString()===now.toDateString();
  const targetTs=Math.floor((isToday?Math.max(now.getTime(),raceDate.getTime()):raceDate.getTime())/1000);

  const times=wx.hourly.time;
  let idx=times.findIndex(t=>t>=targetTs);
  if(idx<0) idx=times.length-5;
  idx=Math.min(Math.max(idx,1),times.length-4);

  const wind=Math.round(wx.hourly.wind_speed_10m[idx]);
  const gust=Math.round(wx.hourly.wind_gusts_10m[idx]);
  const dir=Math.round(wx.hourly.wind_direction_10m[idx]);
  const temp=Math.round(wx.hourly.temperature_2m[idx]);
  const feels=Math.round(wx.hourly.apparent_temperature[idx]);
  const cloud=Math.round(wx.hourly.cloud_cover[idx]);
  const pressure=Math.round(wx.hourly.surface_pressure[idx]);
  const code=wx.hourly.weather_code[idx];
  const bf=wxBeaufort(wind);
  const cond=wxCondition(code);
  const bfCol=wxBfColour(bf.f);
  const trendStr=wxPressureTrend(wx.hourly.surface_pressure,idx);
  // Sunset: find daily entry matching race date
  let sunsetStr='—';
  if(wx.daily&&wx.daily.sunset){
    const raceDayStr=raceDate.toISOString().split('T')[0];
    const di=(wx.daily.time||[]).findIndex(t=>{
      return new Date(t*1000).toISOString().split('T')[0]===raceDayStr;
    });
    if(di>=0&&wx.daily.sunset[di]){
      sunsetStr=new Date(wx.daily.sunset[di]*1000).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
    }
  }

  // 4-hour window starting 1hr BEFORE race (idx-1 … idx+2)
  const stripIndices=[-1,0,1,2].map(n=>idx+n).filter(i=>i>=0&&i<times.length);
  const strip=stripIndices.map(i=>{
    const t=new Date(times[i]*1000);
    const hr=t.getHours().toString().padStart(2,'0')+':00';
    const w=Math.round(wx.hourly.wind_speed_10m[i]);
    const g=Math.round(wx.hourly.wind_gusts_10m[i]);
    const d=Math.round(wx.hourly.wind_direction_10m[i]);
    const b=wxBeaufort(w); const bc=wxBfColour(b.f);
    const isRace=i===idx;
    return `<div style="flex:1;text-align:center;background:var(--navy);border-radius:10px;
      padding:9px 4px;border:2px solid ${isRace?'rgba(0,174,239,.6)':'var(--border)'}">
      <div style="font-size:.75rem;color:${isRace?'var(--teal)':'var(--muted)'};
        font-weight:${isRace?'700':'400'};margin-bottom:5px">${isRace?'🏁 Race':hr}</div>
      <div style="transform:rotate(${d}deg);font-size:1rem;line-height:1;
        color:${bc};margin-bottom:3px">▲</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.25rem;
        font-weight:800;color:${bc};line-height:1">${w}</div>
      <div style="font-size:.75rem;color:var(--white);margin-top:1px">↑${g}</div>
    </div>`;
  }).join('');

  // ── WIND BLOCK ───────────────────────────────────────────────
  const windBlock=`
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:10px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:700;
        letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px">Wind at Race Start · ${_C.short||''}</div>
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:10px">
        <div style="transform:rotate(${dir}deg);font-size:2.5rem;line-height:1;color:${bfCol}">▲</div>
        <div>
          <div style="display:flex;align-items:baseline;gap:6px">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:3.5rem;font-weight:800;
              color:var(--white);line-height:1;letter-spacing:-.02em">${wind}</span>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;
              font-weight:600;color:var(--muted)">kt</span>
          </div>
          <div style="display:flex;align-items:baseline;gap:8px;margin-top:2px">
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.6rem;
              font-weight:800;color:var(--teal)">${dir}°</span>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;
              color:var(--muted)">${wxCardinal(dir)}</span>
          </div>
        </div>
      </div>
      <div style="font-size:.9rem;color:var(--white);margin-bottom:16px">
        Gusting <strong style="font-size:1.05rem">${gust} kt</strong>
      </div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.78rem;font-weight:700;
        letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin-bottom:8px">
        Race Window · kt</div>
      <div style="display:flex;gap:6px">${strip}</div>
    </div>`;

  // ── CONDITIONS BLOCK ─────────────────────────────────────────
  const condBlock=`
    <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:10px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:700;
        letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px">Conditions</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="background:var(--navy);border-radius:10px;padding:12px 14px">
          <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px">Temperature</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:2rem;font-weight:800;
            color:var(--white);line-height:1.1">${temp}°C</div>
          <div style="font-size:.82rem;color:var(--white);margin-top:2px">feels ${feels}°C</div>
        </div>
        <div style="background:var(--navy);border-radius:10px;padding:12px 14px">
          <div style="font-size:.8rem;color:var(--muted);margin-bottom:6px">Sky</div>
          <div style="font-size:1.8rem;line-height:1;margin-bottom:4px">${cond.icon}</div>
          <div style="font-size:.82rem;color:var(--white)">${cond.label}</div>
          <div style="font-size:.8rem;color:var(--muted)">${cloud}% cloud</div>
        </div>
        <div style="background:var(--navy);border-radius:10px;padding:12px 14px">
          <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px">Pressure</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.6rem;font-weight:800;
            color:var(--white);line-height:1.1">${pressure}
            <span style="font-size:.8rem;color:var(--muted);font-weight:400">hPa</span></div>
          <div style="font-size:.82rem;color:var(--white);margin-top:2px">${trendStr}</div>
        </div>
        <div style="background:var(--navy);border-radius:10px;padding:12px 14px">
          <div style="font-size:.8rem;color:var(--muted);margin-bottom:4px">Sunset</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:2rem;font-weight:800;
            color:var(--white);line-height:1.1">${sunsetStr}</div>
          <div style="font-size:.82rem;color:var(--muted);margin-top:2px">local time</div>
        </div>
      </div>
    </div>`;

  // ── TIDES BLOCK ──────────────────────────────────────────────
  let tidesBlock='';
  const tideSource=tides&&tides.source==='imi'?'IMI':tides&&tides.source==='wt'?'WorldTides':'IMI';
  if(tides&&Array.isArray(tides.extremes)&&tides.extremes.length){
    const dayStart=new Date(raceDate); dayStart.setHours(0,0,0,0);
    const dayEnd=new Date(dayStart); dayEnd.setDate(dayEnd.getDate()+1);
    const relevant=tides.extremes
      .filter(e=>{ const t=new Date(e.date); return t>=dayStart&&t<dayEnd; })
      .slice(0,4);
    if(relevant.length){
      const rows=relevant.map(e=>{
        const t=new Date(e.date);
        const timeStr=t.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
        const isHigh=e.type==='High';
        return `<div style="display:flex;align-items:center;gap:14px;padding:11px 0;
          border-bottom:1px solid rgba(255,255,255,.06)">
          <span style="font-size:1.2rem">${isHigh?'▲':'▼'}</span>
          <div style="flex:1;font-size:.95rem;font-weight:600;
            color:${isHigh?'var(--white)':'var(--muted)'}">${isHigh?'High Water':'Low Water'}</div>
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:600;
            color:var(--white)">${timeStr}</span>
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;
            color:${isHigh?'var(--teal)':'var(--muted)'};min-width:42px;text-align:right">
            ${e.height.toFixed(1)}m</span>
        </div>`;
      }).join('');
      tidesBlock=`
        <div style="background:var(--card);border:1px solid var(--border);border-radius:14px;padding:18px;margin-bottom:10px">
          <div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:12px">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:700;
              letter-spacing:.12em;text-transform:uppercase;color:var(--muted)">Tides · ${_C.tideStation||_C.short||'Local'}</div>
            ${tides.source==='imi'?`<div style="font-size:.7rem;color:var(--muted)">Irish Marine Institute</div>`:''}
          </div>
          ${rows}
        </div>`;
    }
  }

  // ── HEADER + FOOTER ──────────────────────────────────────────
  const raceDateStr=raceDate.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'});
  const raceLabel=race?race.label:'Next race';
  const raceTimeStr=raceDate.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});

  body.innerHTML=`
    <div style="margin-bottom:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.15rem;font-weight:700;
        color:var(--white)">${raceLabel}</div>
      <div style="font-size:.85rem;color:var(--muted)">${raceDateStr} · start ${raceTimeStr}</div>
    </div>
    ${windBlock}${condBlock}${tidesBlock}
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:6px 0 2px;font-size:.75rem;color:var(--muted)">
      <span>Open-Meteo${tides?' · '+tideSource:''}</span>
      <button onclick="localStorage.removeItem('__race_weather__');localStorage.removeItem('__race_tides__');loadRaceWeather()"
        style="font-size:.8rem;color:var(--teal);background:transparent;border:none;
        cursor:pointer;font-family:inherit;padding:0">↺ Refresh</button>
    </div>`;
}

// ════════════════════════════════════════════════════════════
// SELF-PAY — crew member pays their own fee independently
// Flow: Pick Boat → Pick Yourself → Pay → Done (no PIN required)
// ════════════════════════════════════════════════════════════

// ── DB helpers ────────────────────────────────────────────────
async function sbSaveSelfPayment(data){
  return sbFetch('/rest/v1/self_payments',{
    method:'POST',
    headers:{...SBH,'Prefer':'return=minimal,resolution=ignore-duplicates'},
    body:JSON.stringify(data)
  });
}
async function sbLoadSelfPayments(boatId,raceKey){
  return sbFetch('/rest/v1/self_payments?boat_id=eq.'+encodeURIComponent(boatId)+'&race_key=eq.'+encodeURIComponent(raceKey));
}
async function sbLoadAllBoatPayments(boatId){
  return sbFetch('/rest/v1/self_payments?boat_id=eq.'+encodeURIComponent(boatId)+'&order=race_date.desc');
}
async function sbLoadAllBoatRacePayments(boatId){
  return sbFetch('/rest/v1/race_payments?boat_id=eq.'+encodeURIComponent(boatId)+'&order=race_date.desc');
}
async function sbLoadBoatRegistrations(boatId){
  const today=new Date().toISOString().split('T')[0];
  return sbFetch('/rest/v1/registrations?boat_id=eq.'+encodeURIComponent(boatId)+'&race_date=lt.'+today+'&order=race_date.desc&limit=52');
}

// ── State ─────────────────────────────────────────────────────
let selfPayState={step:0,race:null,boatId:null,boat:null,loadedCrew:[],crewId:null,person:null,confirmedMethod:null};

function openSelfPayPanel(){
  selfPayState={step:0,race:getNextRace(),boatId:null,boat:null,loadedCrew:[],crewId:null,person:null,confirmedMethod:null};
  renderSelfPayPanel();
  openPanel('selfPayPanel');
}

function spSelectRace(idx){
  const race=spRecentRaces()[parseInt(idx)];
  if(race) selfPayState.race=race;
  const body=document.getElementById('selfPayBody');
  if(body) body.innerHTML=spStep0();
}

function spRecentRaces(){
  const now=new Date();
  const fourWeeksAgo=new Date(now.getTime()-28*24*3600*1000);
  return allRaces.filter(r=>r.date>=fourWeeksAgo).slice(0,12);
}

function selfPayBack(){
  if(selfPayState.step===4){closePanel('selfPayPanel');return;}
  if(selfPayState.step<=0){closePanel('selfPayPanel');return;}
  selfPayState.step--;
  if(selfPayState.step===0){selfPayState.boatId=null;selfPayState.boat=null;}
  if(selfPayState.step===1){selfPayState.crewId=null;selfPayState.person=null;}
  renderSelfPayPanel();
}

function renderSelfPayPanel(){
  const body=document.getElementById('selfPayBody');
  const titleEl=document.getElementById('selfPayTitle');
  if(!body) return;
  const titles=['💰 Pay My Fee','👤 Who Are You?','💳 Pay Your Fee','✅ Recorded!'];
  if(titleEl) titleEl.textContent=titles[selfPayState.step]||'💰 Pay My Fee';
  if(selfPayState.step===0) body.innerHTML=spStep0();
  else if(selfPayState.step===1) body.innerHTML=spStep1();
  else if(selfPayState.step===2) body.innerHTML=spStep2();
  else if(selfPayState.step===3) body.innerHTML=spStep3();
}

// ── Step 0: Pick Boat ─────────────────────────────────────────
function spStep0(){
  const race=selfPayState.race;
  const raceLabel=race?race.label:'the next race';
  const recent=spRecentRaces();
  const selIdx=race?recent.findIndex(r=>r.label===race.label):0;
  const raceSelector=recent.length>1?`
    <div style="margin-bottom:16px">
      <div style="font-size:.72rem;color:var(--teal);text-transform:uppercase;letter-spacing:.1em;font-weight:700;margin-bottom:4px">Race</div>
      <select onchange="spSelectRace(this.value)"
        style="width:100%;background:var(--navy);border:1px solid var(--border);border-radius:10px;
        color:var(--white);font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:700;
        padding:9px 12px;cursor:pointer;outline:none">
        ${recent.map((r,i)=>`<option value="${i}"${i===selIdx?' selected':''} style="background:#0d1f3c;color:#fff">${r.label}</option>`).join('')}
      </select>
    </div>`:'';
  let html=raceSelector+`<div style="font-size:.85rem;color:var(--muted);margin-bottom:16px;text-align:center">
    Select your boat to pay your fee for<br><strong style="color:var(--teal)">${raceLabel}</strong>
  </div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">`;
  boats.forEach(b=>{
    html+=`<button onclick="spPickBoat('${b.id}')"
      style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;
      padding:18px 8px;border-radius:14px;background:var(--card);border:2px solid var(--border);
      cursor:pointer">
      <span style="font-size:2.2rem">${b.icon||'⛵'}</span>
      <span style="font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:800;
        color:var(--white);letter-spacing:.03em;text-align:center">${b.name}</span>
    </button>`;
  });
  return html+'</div>';
}

async function spPickBoat(boatId){
  const b=boats.find(x=>x.id===boatId);
  if(!b) return;
  selfPayState.boatId=boatId;
  selfPayState.boat=b;
  selfPayState.step=1;
  // Start fetching crew straight away — show loading state
  const body=document.getElementById('selfPayBody');
  const titleEl=document.getElementById('selfPayTitle');
  if(titleEl) titleEl.textContent='👤 Who Are You?';
  if(body) body.innerHTML=`<div style="text-align:center;padding:40px;color:var(--muted);font-size:.9rem">Loading crew…</div>`;
  const crewList=await sbLoadCrew(boatId);
  selfPayState.loadedCrew=crewList||[];
  // Guard: user may have navigated away
  if(selfPayState.step===1&&document.getElementById('selfPayPanel')?.classList.contains('open')){
    if(body) body.innerHTML=spStep1();
  }
}

// ── Step 1: Pick yourself from roster ────────────────────────
function spStep1(){
  const b=selfPayState.boat;
  const crewList=selfPayState.loadedCrew;
  if(!crewList.length){
    return `<div style="text-align:center;padding:40px 20px;color:var(--muted)">
      No crew registered for <strong>${b.name}</strong> yet.<br><br>
      Ask the skipper to add you to the crew roster first.
    </div>`;
  }
  let html=`<div style="font-size:.85rem;color:var(--muted);margin-bottom:16px;text-align:center">
    Tap your name on the <strong style="color:var(--white)">${b.name}</strong> crew list
  </div>`;
  crewList.forEach(p=>{
    const amt=FEES[p.type]||0;
    const typeLabel=p.type==='full'?'Member':p.type==='crew'?'Crew Member':p.type==='student'?'Student':p.type==='visitor'?'Visitor':'Junior';
    html+=`<button onclick="spPickCrew('${p.id}')"
      style="width:100%;display:flex;align-items:center;gap:12px;padding:13px;
      border-radius:12px;background:var(--card);border:1px solid var(--border);
      cursor:pointer;margin-bottom:8px;text-align:left;color:var(--white)">
      <div class="cc-avatar" style="width:38px;height:38px;font-size:.85rem;flex-shrink:0">${ini(p)}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:.95rem;color:var(--white)">${p.first} ${p.last}</div>
        <div style="font-size:.78rem;color:var(--muted)">${typeLabel}</div>
      </div>
      ${amt>0
        ?`<span style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:800;color:var(--teal)">€${amt}</span>`
        :`<span style="font-size:.78rem;color:var(--success);font-weight:600">Free</span>`}
    </button>`;
  });
  return html;
}

function spPickCrew(crewId){
  const p=selfPayState.loadedCrew.find(x=>x.id===crewId);
  if(!p) return;
  selfPayState.crewId=crewId;
  selfPayState.person=p;
  selfPayState.step=2;
  renderSelfPayPanel();
}

// ── Step 2: Choose payment method ────────────────────────────
function spStep2(){
  const p=selfPayState.person;
  const b=selfPayState.boat;
  const amt=FEES[p.type]||0;
  const typeLabel=p.type==='full'?'Member':p.type==='crew'?'Crew Member':p.type==='student'?'Student':p.type==='visitor'?'Visitor':'Junior';
  const race=selfPayState.race||getNextRace();
  const raceLabel=race?race.label:'next race';

  // Summary card
  const summary=`<div style="margin-bottom:20px;padding:16px;border-radius:14px;background:var(--card);border:1px solid var(--border)">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="cc-avatar" style="width:42px;height:42px;font-size:.9rem;flex-shrink:0">${ini(p)}</div>
      <div style="flex:1">
        <div style="font-weight:700;font-size:1rem;color:var(--white)">${p.first} ${p.last}</div>
        <div style="font-size:.78rem;color:var(--muted)">${typeLabel} · ${b.name} · ${raceLabel}</div>
      </div>
      ${amt>0
        ?`<span style="font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;font-weight:800;color:var(--danger)">€${amt}</span>`
        :`<span style="font-size:.85rem;color:var(--success);font-weight:700">Free ✓</span>`}
    </div>
  </div>`;

  if(amt===0){
    return summary+`<div style="text-align:center;padding:10px 0">
      <div style="font-size:2.5rem;margin-bottom:10px">🎉</div>
      <div style="font-size:.85rem;color:var(--muted);margin-bottom:24px">${typeLabel}s sail for free — you're all set!</div>
      <button onclick="spConfirm('Free')"
        style="width:100%;padding:14px;border-radius:12px;background:var(--teal);border:none;
        color:var(--navy-dark);font-family:'Barlow Condensed',sans-serif;font-size:1rem;
        font-weight:800;letter-spacing:.04em;cursor:pointer">OK, got it ✓</button>
    </div>`;
  }

  // Fetch the boat's Revolut config for payment options
  const revUser=selfPayState.boatRevUser||'';
  // Trigger async load if not already loaded
  if(!selfPayState.boatRevLoaded){
    selfPayState.boatRevLoaded=true;
    sbLoadBoatConfig(selfPayState.boatId).then(cfg=>{
      if(cfg) selfPayState.boatRevUser=cfg.revolut_user||'';
      // Re-render if still on this step
      if(selfPayState.step===2){
        const body=document.getElementById('selfPayBody');
        if(body) body.innerHTML=spStep2();
      }
    });
  }

  const stripeLink=getStripeLink(p.type);
  const btnBase='width:100%;display:flex;align-items:center;gap:14px;padding:16px;border-radius:12px;cursor:pointer;margin-bottom:10px;text-align:left';

  const revBtn=revUser
    ?`<button onclick="spDoRevolut()"
        style="${btnBase};background:rgba(110,64,216,.18);border:1px solid rgba(110,64,216,.5);color:#a78bfa">
        <span style="font-size:1.6rem">💜</span>
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800">Pay by Revolut</div>
          <div style="font-size:.78rem;opacity:.8">Send €${amt} to @${revUser}</div>
        </div>
      </button>`
    :`<button disabled style="${btnBase};background:transparent;border:1px dashed rgba(255,255,255,.12);color:var(--muted);opacity:.4;cursor:default">
        <span style="font-size:1.6rem">💜</span>
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800">Revolut</div>
          <div style="font-size:.78rem">Not configured — ask skipper</div>
        </div>
      </button>`;

  const cardBtn=stripeLink
    ?`<button onclick="spDoCard()"
        style="${btnBase};background:rgba(0,174,239,.1);border:1px solid rgba(0,174,239,.35);color:var(--teal)">
        <span style="font-size:1.6rem">💳</span>
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800">Pay by Card</div>
          <div style="font-size:.78rem;opacity:.8">Secure online payment · €${amt}</div>
        </div>
      </button>`
    :`<button disabled style="${btnBase};background:transparent;border:1px dashed rgba(255,255,255,.12);color:var(--muted);opacity:.4;cursor:default">
        <span style="font-size:1.6rem">💳</span>
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800">Card</div>
          <div style="font-size:.78rem">Not configured — ask skipper</div>
        </div>
      </button>`;

  const cashBtn=`<button onclick="spConfirm('Cash')"
      style="${btnBase};background:rgba(45,198,83,.12);border:1px solid rgba(45,198,83,.4);color:var(--success)">
      <span style="font-size:1.6rem">💵</span>
      <div>
        <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800">Pay Cash</div>
        <div style="font-size:.78rem;opacity:.8">I'll hand €${amt} to the skipper</div>
      </div>
    </button>`;

  return summary+
    `<div style="font-size:.82rem;color:var(--muted);margin-bottom:14px;text-align:center">How would you like to pay?</div>`+
    revBtn+cardBtn+cashBtn;
}

// ── Payment action helpers ────────────────────────────────────
function spDoRevolut(){
  const revUser=selfPayState.boatRevUser||'';
  window.open('https://revolut.me/'+revUser,'_blank');
  spShowAwaitConfirm('Revolut');
}
function spDoCard(){
  const p=selfPayState.person;
  const b=selfPayState.boat;
  const race=selfPayState.race||getNextRace();
  // Save context so Stripe success redirect can auto-confirm without user tap
  if(race&&b&&p){
    try{ sessionStorage.setItem('sp_pending',JSON.stringify({
      boatId:b.id, crewId:p.id, personType:p.type,
      raceKey:raceKey(race), raceName:race.label,
      raceDate:race.date.toISOString().split('T')[0],
      amount:FEES[p.type]||0
    })); }catch(e){}
  }
  // Navigate in same tab so Stripe success_url redirect returns to this app
  window.location.href=getStripeLink(p.type);
}
function spShowAwaitConfirm(method){
  const p=selfPayState.person;
  const amt=FEES[p.type]||0;
  const icon=method==='Revolut'?'💜':'💳';
  const body=document.getElementById('selfPayBody');
  if(!body) return;
  body.innerHTML=
    `<div style="text-align:center;padding:30px 0">
      <div style="font-size:2.5rem;margin-bottom:12px">${icon}</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.3rem;font-weight:800;margin-bottom:8px">
        ${method} payment opened
      </div>
      <div style="font-size:.85rem;color:var(--muted);margin-bottom:28px">
        Complete your €${amt} payment, then tap below to record it
      </div>
      <button onclick="spConfirm('${method}')"
        style="width:100%;padding:14px;border-radius:12px;background:var(--teal);border:none;
        color:var(--navy-dark);font-family:'Barlow Condensed',sans-serif;font-size:1rem;
        font-weight:800;letter-spacing:.04em;cursor:pointer;margin-bottom:10px">
        ✅ I've paid — record it
      </button>
      <button onclick="renderSelfPayPanel()"
        style="width:100%;padding:12px;border-radius:12px;background:transparent;
        border:1px solid var(--border);color:var(--muted);cursor:pointer;
        font-family:'Barlow Condensed',sans-serif;font-size:.9rem;font-weight:700">
        ← Back to options
      </button>
    </div>`;
}

async function spConfirm(method){
  const p=selfPayState.person;
  const b=selfPayState.boat;
  const race=selfPayState.race||getNextRace();
  if(!race){toast('No upcoming race found');return;}
  const record={
    boat_id:b.id,
    crew_id:p.id,
    race_key:raceKey(race),
    race_name:race.label,
    race_date:race.date.toISOString().split('T')[0],
    method,
    amount:FEES[p.type]||0
  };
  await sbSaveSelfPayment(record);   // duplicate = already recorded, that's fine
  selfPayState.confirmedMethod=method;
  selfPayState.step=3;
  renderSelfPayPanel();
}

// ── Step 3: Success ───────────────────────────────────────────
function spStep3(){
  const p=selfPayState.person;
  const b=selfPayState.boat;
  const race=selfPayState.race||getNextRace();
  const method=selfPayState.confirmedMethod||'';
  const amt=FEES[p.type]||0;
  const icon=method==='Revolut'?'💜':method==='Card'?'💳':method==='Cash'?'💵':'🎉';
  return `<div style="text-align:center;padding:30px 0">
    <div style="font-size:3.5rem;margin-bottom:12px">${icon}</div>
    <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.6rem;font-weight:800;margin-bottom:8px">
      ${method==='Free'?'Enjoy the race!':'Payment recorded!'}
    </div>
    <div style="font-size:.85rem;color:var(--muted);margin-bottom:4px">${p.first} ${p.last} · ${b.name}</div>
    ${amt>0?`<div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:700;color:var(--success);margin-bottom:4px">€${amt} · ${method}</div>`:''}
    <div style="font-size:.78rem;color:var(--muted);margin-bottom:24px">${race?race.label:''}</div>
    <div style="padding:14px;border-radius:12px;background:rgba(45,198,83,.08);border:1px solid rgba(45,198,83,.25);
      font-size:.82rem;color:var(--success);margin-bottom:24px;text-align:left">
      ✓ Your payment has been recorded.<br>Your skipper will see it when they open Race Fees.
    </div>
    <button onclick="closePanel('selfPayPanel')"
      style="width:100%;padding:14px;border-radius:12px;background:var(--card);border:1px solid var(--border);
      color:var(--white);font-family:'Barlow Condensed',sans-serif;font-size:1rem;
      font-weight:800;letter-spacing:.04em;cursor:pointer">Done ✓</button>
  </div>`;
}

// ── Share payment link / QR (for whole crew) ─────────────────
function openSharePayLink(){
  const sel=roster.filter(p=>p.selected);
  if(!sel.length){toast('No crew selected');return;}
  const tot=sel.filter(p=>!p.paid).reduce((a,p)=>a+fee(p),0);
  if(!tot){toast('All crew already paid ✓');return;}
  const data={
    boat:currentBoat.name,
    race:selectedRace?selectedRace.label:'Race',
    rev:getRevolutUser(),
    crew:sel.filter(p=>!p.paid).map(p=>({n:p.first+' '+p.last,t:p.type,a:fee(p)}))
  };
  // base64url: no +/= chars — iOS truncates URLs at '='
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  const link=window.location.href.split('#')[0]+'#pay/'+encoded;
  document.getElementById('shareLinkBox').textContent=link;
  const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(link);
  document.getElementById('shareQR').innerHTML=
    '<img src="'+qrUrl+'" style="width:180px;height:180px;border-radius:8px;" alt="QR Code">'+
    '<div style="margin-top:8px;font-size:.78rem;color:#333;font-family:Barlow Condensed,sans-serif;font-weight:700">'+
    currentBoat.name+' · €'+tot+' outstanding</div>';
  document.getElementById('shareSheet').classList.add('open');
}
function copyShareLink(){
  const link=document.getElementById('shareLinkBox').textContent;
  navigator.clipboard.writeText(link).then(()=>toast('Link copied ✓')).catch(()=>{
    const ta=document.createElement('textarea');ta.value=link;document.body.appendChild(ta);
    ta.select();document.execCommand('copy');document.body.removeChild(ta);toast('Link copied ✓');
  });
}
function shareToWhatsApp(){
  const link=document.getElementById('shareLinkBox').textContent;
  const race=selectedRace?selectedRace.label:'this race';
  const boat=currentBoat?currentBoat.name:'our boat';
  const msg=`Hi all — racing fees for ${race} on ${boat}. Tap the link, find your name and pay your share 👇\n\n${link}`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
}

// ── LEGACY stubs — kept so any old HTML refs don't break ──────
function openCollectSheet(){ openRaceFeesPanel(); }
function markAllCash(){ rfMarkAllCash(); }

// ── Collect Payments sheet ────────────────────────────────────
function openCollectSheet_REMOVED(){
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
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:2px 0">'+
          '<div style="display:flex;align-items:center;gap:10px">'+
            '<div class="cc-avatar" style="width:34px;height:34px;font-size:.78rem">'+ini(p)+'</div>'+
            '<div>'+
              '<div style="font-size:.95rem;font-weight:700">'+p.first+' '+p.last+'</div>'+
              '<div style="font-size:.78rem;color:var(--success);font-weight:600">✓ '+(p.payMethod||'Paid')+'</div>'+
            '</div>'+
          '</div>'+
          '<div style="display:flex;align-items:center;gap:10px">'+
            '<span style="font-family:Barlow Condensed,sans-serif;font-size:1.3rem;font-weight:800;color:var(--success)">€'+amt+'</span>'+
            '<button onclick="unpayCrewCollect(\''+p.id+'\')" style="font-size:.75rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:4px 10px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);cursor:pointer;letter-spacing:.03em;">Undo</button>'+
          '</div>'+
        '</div>';
    } else {
      // Payment buttons
      const revLink=revUser?`https://revolut.me/${revUser}`:'';
      const stripeLink=getStripeLink(p.type);
      // WhatsApp links — only when crew has a phone number
      const waRevLink=p.phone&&revLink
        ?'https://wa.me/'+fmtWaPhone(p.phone)+'?text='+encodeURIComponent(
            `Hi ${p.first} — your GBSC racing fee is €${amt}. Tap to pay via Revolut: ${revLink} ⛵`)
        :'';
      const waStripeLink=p.phone&&stripeLink
        ?'https://wa.me/'+fmtWaPhone(p.phone)+'?text='+encodeURIComponent(
            `Hi ${p.first} — your GBSC racing fee is €${amt}. Tap to pay by card: ${stripeLink} ⛵`)
        :'';
      // shared button label style helpers
      const btnLabel=(text,sub,color)=>
        '<span style="font-family:Barlow Condensed,sans-serif;font-size:.9rem;font-weight:800;'+
        'letter-spacing:.04em;text-transform:uppercase;color:'+color+'">'+text+'</span>'+
        '<span style="font-size:.78rem;color:'+color+';opacity:.75;letter-spacing:.02em">'+sub+'</span>';
      row.innerHTML=
        // ── Name / amount header ──────────────────────────────
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'+
          '<div style="display:flex;align-items:center;gap:10px">'+
            '<div class="cc-avatar" style="width:34px;height:34px;font-size:.78rem">'+ini(p)+'</div>'+
            '<div>'+
              '<div style="font-size:.95rem;font-weight:700">'+p.first+' '+p.last+'</div>'+
              '<div style="font-size:.78rem;color:var(--muted)">'+(p.type==='visitor'?'Visitor':'Member')+'</div>'+
            '</div>'+
          '</div>'+
          '<span style="font-family:Barlow Condensed,sans-serif;font-size:1.5rem;font-weight:800;color:var(--danger)">€'+amt+'</span>'+
        '</div>'+
        // ── Payment buttons ───────────────────────────────────
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:8px">'+

          // ── Revolut ──
          (waRevLink?
            '<a href="'+waRevLink+'" target="_blank" '+
            'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
            'background:rgba(110,64,216,.2);border:1px solid rgba(110,64,216,.5);border-radius:10px;'+
            'padding:11px 6px;text-decoration:none;cursor:pointer;">'+
            btnLabel('Revolut','WhatsApp','#a78bfa')+'</a>'
          :revLink?
            '<button onclick="showRevolutQR(\''+p.first+'\',\''+revLink+'\',\''+amt+'\')" '+
            'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
            'background:rgba(110,64,216,.2);border:1px solid rgba(110,64,216,.5);border-radius:10px;'+
            'padding:11px 6px;cursor:pointer;">'+
            btnLabel('Revolut','QR Code','#a78bfa')+'</button>'
          :
            '<button onclick="toast(\'Set your Revolut @username in Skipper Settings\')" '+
            'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
            'background:transparent;border:1px dashed var(--border);border-radius:10px;'+
            'padding:11px 6px;cursor:pointer;opacity:.35;">'+
            btnLabel('Revolut','not set','var(--muted)')+'</button>'
          )+

          // ── Cash ──
          '<button onclick="markPaidCollect(\''+p.id+'\',\'Cash\')" '+
          'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
          'background:rgba(45,198,83,.1);border:1px solid rgba(45,198,83,.4);border-radius:10px;'+
          'padding:11px 6px;cursor:pointer;">'+
          btnLabel('Cash','mark paid','var(--success)')+'</button>'+

          // ── Card ──
          (stripeLink&&waStripeLink?
            '<a href="'+waStripeLink+'" target="_blank" '+
            'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
            'background:rgba(0,180,216,.1);border:1px solid rgba(0,180,216,.4);border-radius:10px;'+
            'padding:11px 6px;text-decoration:none;cursor:pointer;">'+
            btnLabel('Card','WhatsApp','var(--teal)')+'</a>'
          :stripeLink?
            '<button onclick="showStripeQR(\''+p.first+'\',\''+stripeLink+'\',\''+amt+'\')" '+
            'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
            'background:rgba(0,180,216,.08);border:1px solid rgba(0,180,216,.3);border-radius:10px;'+
            'padding:11px 6px;cursor:pointer;">'+
            btnLabel('Card','QR Code','var(--teal)')+'</button>'
          :
            '<button onclick="toast(\'Card payment links not configured — see RO Club Settings\')" '+
            'style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;'+
            'background:transparent;border:1px dashed var(--border);border-radius:10px;'+
            'padding:11px 6px;cursor:pointer;opacity:.35;">'+
            btnLabel('Card','not set','var(--muted)')+'</button>'
          )+

        '</div>'+
        // ── Mark as Paid (manual confirmation after Revolut/Card) ──
        '<button onclick="markPaidCollect(\''+p.id+'\',\'Confirmed\')" '+
        'style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px;'+
        'background:rgba(45,198,83,.08);border:1px solid rgba(45,198,83,.3);border-radius:10px;'+
        'padding:9px 12px;cursor:pointer;font-family:Barlow Condensed,sans-serif;font-size:.88rem;'+
        'font-weight:800;color:var(--success);letter-spacing:.06em;text-transform:uppercase;">'+
        '✓ Mark as Paid</button>';
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
          '<div class="cc-avatar" style="width:30px;height:30px;font-size:.8rem">'+ini(p)+'</div>'+
          '<div><div style="font-size:.88rem;font-weight:600">'+p.first+' '+p.last+'</div>'+
          '<div style="font-size:.8rem;color:var(--success)">✓ '+method+'</div></div>'+
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
// Normalise a phone number to the digits-only format wa.me expects
// Handles +353…, 00353…, 087… (Irish local) formats
function fmtWaPhone(ph){
  let d=ph.replace(/[^\d+]/g,'');          // strip spaces, dashes, brackets
  if(d.startsWith('+')) d=d.slice(1);       // +353… → 353…
  else if(d.startsWith('00')) d=d.slice(2); // 00353… → 353…
  else if(d.startsWith('0')) d='353'+d.slice(1); // 087… → 353 87…
  return d;
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

// ── Stripe QR modal (no-phone fallback in Collect Payments) ──
function showStripeQR(firstName, stripeLink, amt){
  const existing=document.getElementById('_stripeQROverlay');
  if(existing) existing.remove();
  const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(stripeLink);
  const el=document.createElement('div');
  el.id='_stripeQROverlay';
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;';
  el.innerHTML=`
    <div style="background:#112240;border:1px solid rgba(0,180,216,.3);border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;color:#f0f4f8;margin-bottom:4px">Card Payment — ${firstName}</div>
      <div style="font-size:.8rem;color:#7a8fa6;margin-bottom:16px">Ask them to scan to pay €${amt}</div>
      <div style="background:white;border-radius:10px;padding:12px;display:inline-block;margin-bottom:16px">
        <img src="${qrUrl}" style="width:200px;height:200px;display:block">
      </div>
      <button onclick="document.getElementById('_stripeQROverlay').remove()"
        style="width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.2);
        border-radius:10px;color:#7a8fa6;cursor:pointer;font-family:'Barlow Condensed',sans-serif;
        font-size:.95rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Close</button>
    </div>`;
  el.addEventListener('click',e=>{if(e.target===el)el.remove();});
  document.body.appendChild(el);
}

function showRevolutQR(firstName, revLink, amt){
  const existing=document.getElementById('_revolutQROverlay');
  if(existing) existing.remove();
  const qrUrl='https://api.qrserver.com/v1/create-qr-code/?size=220x220&data='+encodeURIComponent(revLink);
  const el=document.createElement('div');
  el.id='_revolutQROverlay';
  el.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:500;display:flex;align-items:center;justify-content:center;padding:24px;';
  el.innerHTML=`
    <div style="background:#112240;border:1px solid rgba(110,64,216,.4);border-radius:16px;padding:24px;max-width:300px;width:100%;text-align:center;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:800;color:#f0f4f8;margin-bottom:4px">💜 Revolut — ${firstName}</div>
      <div style="font-size:.8rem;color:#7a8fa6;margin-bottom:4px">Ask them to scan with their camera</div>
      <div style="font-size:.75rem;color:#a78bfa;margin-bottom:16px;font-family:'Barlow Condensed',sans-serif;font-weight:600">Amount: €${amt}</div>
      <div style="background:white;border-radius:10px;padding:12px;display:inline-block;margin-bottom:16px">
        <img src="${qrUrl}" style="width:200px;height:200px;display:block">
      </div>
      <div style="font-size:.8rem;color:#7a8fa6;margin-bottom:14px">${revLink}</div>
      <button onclick="document.getElementById('_revolutQROverlay').remove()"
        style="width:100%;padding:12px;background:transparent;border:1px solid rgba(255,255,255,.2);
        border-radius:10px;color:#7a8fa6;cursor:pointer;font-family:'Barlow Condensed',sans-serif;
        font-size:.95rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;">Close</button>
    </div>`;
  el.addEventListener('click',e=>{if(e.target===el)el.remove();});
  document.body.appendChild(el);
}

// ── Share Payment Link / QR ───────────────────────────────────
function openSharePayLink(){
  const sel=roster.filter(p=>p.selected);
  if(!sel.length){toast('No crew selected');return;}
  const tot=sel.filter(p=>!p.paid).reduce((a,p)=>a+fee(p),0);
  if(!tot){toast('All crew already paid ✓');return;}

  // Build a data URL encoding the payment context.
  // stripeLinks are intentionally omitted — they are loaded from clubSettings
  // at render time, which keeps the URL short (saves ~300 chars of base64).
  const data={
    boat: currentBoat.name,
    race: selectedRace?selectedRace.label:'Race',
    rev: getRevolutUser(),
    crew: sel.filter(p=>!p.paid).map(p=>({n:p.first+' '+p.last,t:p.type,a:fee(p)}))
  };
  // base64url encoding: no +, /, or = characters — iOS truncates URLs at '='
  const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(data))))
    .replace(/\+/g,'-').replace(/\//g,'_').replace(/=/g,'');
  // Use #pay/ separator (not #pay=) so iOS doesn't truncate at the equals sign
  const link=window.location.href.split('#')[0]+'#pay/'+encoded;

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

function shareToWhatsApp(){
  const link=document.getElementById('shareLinkBox').textContent;
  const race=selectedRace?selectedRace.label:'this race';
  const boat=currentBoat?currentBoat.name:'our boat';
  const msg=`Hi all — racing fees for ${race} on ${boat}. Tap the link, find your name and pay your share 👇\n\n${link}`;
  window.open('https://wa.me/?text='+encodeURIComponent(msg),'_blank');
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
    // Auto-increment outings for visitors who raced tonight
    const visitors=s.filter(p=>p.type==='visitor');
    visitors.forEach(p=>{
      p.outings=(p.outings||0)+1;
      sbFetch('/rest/v1/crew?id=eq.'+p.id,{method:'PATCH',
        headers:{...SBH,'Prefer':'return=minimal'},
        body:JSON.stringify({outings:p.outings})});
    });
    if(visitors.length) renderCrew();
  }
}

// ═══════════════════════════════════════════════════════════════
// RO PAYMENT REPORT
// ═══════════════════════════════════════════════════════════════
async function generatePaymentReport(){
  const statusEl=document.getElementById('reportStatus');
  const race=roReportRace||nextRace;
  if(!race){statusEl.textContent='No race selected';return;}
  const raceName=race.label;
  const raceDate=race.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long',year:'numeric'});

  statusEl.textContent='⏳ Loading report…';

  const [records, regs]=await Promise.all([
    sbLoadRaceRecords(raceKey(race)),
    sbLoadRegistrations(race)
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
    <div><div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Registered</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1B3E93;font-family:'Barlow Condensed',sans-serif">${(regs||[]).length}</div></div>
    <div><div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Submitted</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1B3E93;font-family:'Barlow Condensed',sans-serif">${records.length}</div></div>
    ${missingBoats.length?`<div><div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Missing</div>
      <div style="font-size:1.6rem;font-weight:800;color:#c0392b;font-family:'Barlow Condensed',sans-serif">${missingBoats.length}</div></div>`:''}
    <div><div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Total Due</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1B3E93;font-family:'Barlow Condensed',sans-serif">€${grandDue}</div></div>
    <div><div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Collected</div>
      <div style="font-size:1.6rem;font-weight:800;color:#1a7a3a;font-family:'Barlow Condensed',sans-serif">€${grandPaid}</div></div>
    ${grandOutstanding>0?`<div><div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">Outstanding</div>
      <div style="font-size:1.6rem;font-weight:800;color:#c0392b;font-family:'Barlow Condensed',sans-serif">€${grandOutstanding}</div></div>`:''}
    <div style="margin-left:auto">
      <div style="font-size:.8rem;text-transform:uppercase;letter-spacing:.08em;color:#666;font-weight:600">By Method</div>
      <table style="margin-top:2px">${methodSummaryRows}</table>
    </div>
  </div>

  ${missingSection}
  ${boatRows}
</body></html>`;

  // Open via Blob URL — works on iOS Safari where window.open() after async is blocked
  const blob=new Blob([printHtml],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.target='_blank'; a.rel='noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}

// ═══════════════════════════════════════════════════════════════
// RACE DOCUMENTS
// ═══════════════════════════════════════════════════════════════
// Race docs are loaded dynamically from Google Drive via Netlify function
// Naming convention in the Drive folder:
//   "Sailing Instructions…" → always-available SI
//   "Notice of Race…"       → NOR, shown under its own section
//   Anything else           → shown as a general document

async function loadAndRenderDocs(){
  const el=document.getElementById('docsList'); if(!el) return;
  const noticeboardUrl=(_C.noticeboardUrl||'').trim();
  if(noticeboardUrl){
    el.innerHTML=`<iframe src="${noticeboardUrl}" style="width:100%;height:calc(100vh - 200px);border:none;border-radius:10px;background:#fff"></iframe>`;
    return;
  }
  el.innerHTML='<div class="empty-state" style="margin:0;padding:18px"><div class="icon">⏳</div><div>Loading documents…</div></div>';
  try{
    const res=await fetch('/.netlify/functions/drive-docs');
    if(!res.ok) throw new Error('HTTP '+res.status);
    const files=await res.json();
    if(!Array.isArray(files)||!files.length){
      el.innerHTML='<div class="empty-state" style="margin:0;padding:18px"><div class="icon">📄</div><div>No documents available yet</div></div>';
      return;
    }
    const si=files.filter(f=>/sailing.instruct/i.test(f.name));
    const nor=files.filter(f=>/notice.of.race/i.test(f.name));
    const other=files.filter(f=>!/sailing.instruct|notice.of.race/i.test(f.name));
    let html='';
    if(si.length){
      html+='<div style="font-size:.75rem;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Always Available</div>';
      si.forEach(f=>{ html+=docCard({id:f.id,title:f.name.replace(/\.pdf$/i,''),subtitle:'Applies to all Wednesday & KOTB races'},'📋'); });
    }
    if(nor.length){
      html+='<div style="font-size:.75rem;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:16px 0 8px">Notice of Race</div>';
      nor.forEach(f=>{ html+=docCard({id:f.id,title:f.name.replace(/\.pdf$/i,''),subtitle:'Wednesday Series'},'🏁'); });
    }
    if(other.length){
      html+='<div style="font-size:.75rem;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin:16px 0 8px">Other Documents</div>';
      other.forEach(f=>{ html+=docCard({id:f.id,title:f.name.replace(/\.pdf$/i,''),subtitle:''},'📄'); });
    }
    el.innerHTML=html;
  }catch(e){
    el.innerHTML='<div class="empty-state" style="margin:0;padding:18px"><div class="icon">⚠️</div><div>Could not load documents</div></div>';
    console.error('drive-docs error',e);
  }
}

function renderDocs(){
  loadAndRenderDocs();
}
function docCard(doc,icon){
  return'<div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:12px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:14px;">'+
    '<div style="font-size:1.8rem;flex-shrink:0">'+icon+'</div>'+
    '<div style="flex:1;min-width:0">'+
      '<div style="font-family:\'Barlow Condensed\',sans-serif;font-size:1rem;font-weight:800;color:var(--white)">'+doc.title+'</div>'+
      '<div style="font-size:.8rem;color:var(--muted);margin-top:2px">'+doc.subtitle+'</div>'+
    '</div>'+
    '<button onclick="openDoc(\''+doc.id+'\',\''+doc.title.replace(/'/g,'&#39;')+'\')"\n'+
    '  style="flex-shrink:0;background:var(--teal);color:var(--navy-dark);border:none;border-radius:8px;'+
    '  padding:8px 14px;font-family:\'Barlow Condensed\',sans-serif;font-weight:800;font-size:.85rem;cursor:pointer;">'+
    'View</button></div>';
}
function openDoc(fileId,title){
  document.getElementById('pdfTitle').textContent=title;
  document.getElementById('pdfFrame').src='https://drive.google.com/file/d/'+fileId+'/preview';
  document.getElementById('pdfOverlay').style.display='flex';
}
function closeDoc(){
  document.getElementById('pdfOverlay').style.display='none';
  document.getElementById('pdfFrame').src='';
}

// ═══════════════════════════════════════════════════════════════
// SPONSORS
// ═══════════════════════════════════════════════════════════════
// Sponsors come from window.CLUB.sponsors — match strings are compiled to RegExp here.
// Each entry: {match:"regex-string", name, tagline, logo, url}
const SPONSORS=(_C.sponsors||[]).map(s=>({...s, match:new RegExp(s.match,'i')}));

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
let calLoaded=false, calView='date', calSchedule=[];

async function loadCalendarIfNeeded(){
  if(calLoaded) return;
  calLoaded=true;

  // No Halsail configured — build calendar from DB races (allRaces)
  if(!HAL_CLUB){
    calSchedule=allRaces.map(r=>({
      RaceID: r.id,
      Race:   r.label,
      Series: r.series||'Racing',
      Notes:  '',
      Start:  r.date.toISOString(),
      dateObj:r.date,
      Class:  'IRC',
    })).sort((a,b)=>a.dateObj-b.dateObj);
    setCalView(calView);
    return;
  }

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

  // Filter to cruiser classes only, deduplicate by RaceID, sort by date
  const seen=new Set();
  calSchedule=raw
    .filter(r=>isCruiserClass(r.Class))
    .filter(r=>{ if(seen.has(r.RaceID))return false; seen.add(r.RaceID); return true; })
    .map(r=>({...r,dateObj:new Date(r.Start)}))
    .sort((a,b)=>a.dateObj-b.dateObj);

  // Share schedule data with Results tab if it hasn't loaded yet
  if(!halSchedule) halSchedule=raw;

  setCalView(calView);
}

function setCalView(v){
  calView=v;
  const activeStyle='font-family:Barlow Condensed,sans-serif;font-size:.75rem;font-weight:700;padding:5px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--teal);background:var(--teal);color:var(--navy-dark);';
  const inactiveStyle='font-family:Barlow Condensed,sans-serif;font-size:.75rem;font-weight:700;padding:5px 10px;border-radius:7px;cursor:pointer;border:1px solid var(--border);background:transparent;color:var(--muted);';
  document.getElementById('calSeriesBtn').style.cssText=v==='series'?activeStyle:inactiveStyle;
  document.getElementById('calDateBtn').style.cssText=v==='date'?activeStyle:inactiveStyle;
  renderCalendar();
}

function renderCalendar(){
  if(calView==='date') renderCalByDate();
  else renderCalList();
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

function renderCalByDate(){
  const wrap=document.getElementById('calendarContent');
  if(!calSchedule.length){wrap.innerHTML='<div class="empty-state"><div class="icon">📅</div><div>No races found</div></div>';return;}

  const now=new Date();
  const nextEvt=calSchedule.find(r=>r.dateObj>=now);

  // Group by month label e.g. "May 2026"
  const months={};
  calSchedule.forEach(r=>{
    const key=r.dateObj.toLocaleDateString('en-IE',{month:'long',year:'numeric'});
    if(!months[key]) months[key]=[];
    months[key].push(r);
  });

  let html='';
  Object.entries(months).forEach(([monthLabel,races])=>{
    const isKotbGroup=races.some(r=>r.Series.toLowerCase().includes('king'));
    html+=`<div class="cal-group"><div class="cal-group-title">${monthLabel}</div>`;
    races.forEach(r=>{
      const d=r.dateObj;
      const isPast=d<now;
      const isNext=nextEvt&&r.RaceID===nextEvt.RaceID;
      const isKotb=r.Series.toLowerCase().includes('king');
      const dayNum=d.getDate();
      const mon=d.toLocaleDateString('en-IE',{month:'short'});
      const weekday=d.toLocaleDateString('en-IE',{weekday:'short'});
      const time=d.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
      const raceName=r.Notes&&r.Notes.trim()?r.Notes.trim():r.Race.replace(/_/g,' ');
      html+=`<div class="cal-race-row${isNext?' next-race':''}${isPast?' past':''}">
        <div class="cal-date${isPast?' past':''}">
          <div class="cal-date-day">${dayNum}</div>
          <div class="cal-date-mon">${mon}</div>
        </div>
        <div class="cal-info">
          <div class="cal-race-name">${raceName}</div>
          <div class="cal-series-name">${weekday} · ${time} · ${r.Series}</div>
        </div>
        ${isNext?'<div class="cal-badge next">Next</div>':isKotb&&!isPast?'<div class="cal-badge kotb">KOTB</div>':isPast?'<div class="cal-badge past">Done</div>':''}
      </div>`;
    });
    html+='</div>';
  });
  wrap.innerHTML=html;
  const nextEl=wrap.querySelector('.next-race');
  if(nextEl) nextEl.scrollIntoView({block:'center',behavior:'smooth'});
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
  const [c]=await Promise.all([sbLoadCourse(), loadMarks()]);
  if(c){
    publishedCourse=c;
    if(isRO){
      roDashCoursePublished=true;
      updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
    }
  }
  renderCourseDiagram();
}

function getCourseState(){
  // Returns 'none' | 'pending' | 'stale' | 'live'
  // none    — no course has ever been published
  // pending — within pre-race window but course not yet published today
  // stale   — outside pre-race window, showing a previous course for reference
  // live    — course published within the pre-race window; treat as today's course
  if(!publishedCourse) return 'none';
  const hasMarks=publishedCourse.marks&&publishedCourse.marks.length;
  const hasCourseCard=publishedCourse.courseNumber&&Array.isArray(publishedCourse.rounds)&&publishedCourse.rounds.length;
  if(!hasMarks&&!hasCourseCard) return 'none';
  const now=new Date();
  const windowMs=(clubSettings.pre_race_window_hours||12)*3600000;
  const hoursToRace=nextRace?(nextRace.date-now):Infinity;
  const hoursSincePublish=publishedCourse.published_at?(now-new Date(publishedCourse.published_at)):Infinity;
  const withinWindow=hoursToRace>=0&&hoursToRace<=windowMs;  // race is coming up soon
  const publishedRecently=hoursSincePublish<=windowMs;         // published within the window period
  if(withinWindow&&!publishedRecently) return 'pending';       // race soon, no course yet
  if(withinWindow&&publishedRecently)  return 'live';          // race soon AND course published
  return 'stale';                                              // no imminent race — show for reference
}

// ── GPX export ───────────────────────────────────────────────────────────────
// source: 'builder' → use live courseMarks from the RO Course Builder
//         'published' → use the last published course (skipper view)
function downloadCourseGpx(source){
  let markEntries;
  if(source==='builder'){
    if(!courseMarks.length){toast('Add at least one mark first');return;}
    markEntries=courseMarks;
  } else {
    if(!publishedCourse||!publishedCourse.marks||!publishedCourse.marks.length){
      toast(publishedCourse&&publishedCourse.courseNumber?'Course card courses have no GPX — marks not plotted':'No course published yet');
      return;
    }
    markEntries=(publishedCourse.marks||[]).map(m=>typeof m==='string'?{id:m,rounding:'port'}:m);
  }

  const resolvedMarks=markEntries.map(me=>{
    const m=MARKS.find(x=>x.id===me.id);
    return m?{...m,rounding:me.rounding||'port'}:null;
  }).filter(Boolean);

  // Determine which lines to use
  const gpxStartLine=source==='builder'
    ?getLineById(selectedStartLineId)
    :getLineById((publishedCourse&&publishedCourse.startLineId)||'club');
  const gpxFinishLine=source==='builder'
    ?getLineById(selectedFinishLineId)
    :getLineById((publishedCourse&&publishedCourse.finishLineId)||'club');
  const gpxStartPos=lineMidpoint(gpxStartLine);
  const gpxFinishPos=lineMidpoint(gpxFinishLine);
  const gpxSameLine=gpxStartLine.id===gpxFinishLine.id;

  // Use window.CLUB if available (multi-club branch), fall back to hardcoded GBSC
  const clubShort=(window.CLUB&&window.CLUB.short)||'GBSC';
  const clubName=clubShort+' Racing';
  const raceName=nextRace?nextRace.label:'Course';

  // nextRace.date may be a string from the DB or a Date object — normalise it
  const rawDate=nextRace?nextRace.date:null;
  const raceDate=rawDate
    ?(rawDate instanceof Date?rawDate:new Date(rawDate)).toISOString()
    :new Date().toISOString();
  const dateStr=raceDate.split('T')[0];

  // ── Waypoints — include both endpoints so chart plotters can show the physical line ──
  const wptLines=[];
  // Start line endpoints
  wptLines.push(
    `  <wpt lat="${gpxStartLine.lat1.toFixed(6)}" lon="${gpxStartLine.lng1.toFixed(6)}">\n`+
    `    <name>${gpxStartLine.name} — Pin End</name>\n    <sym>Flag, Green</sym>\n  </wpt>`
  );
  wptLines.push(
    `  <wpt lat="${gpxStartLine.lat2.toFixed(6)}" lon="${gpxStartLine.lng2.toFixed(6)}">\n`+
    `    <name>${gpxStartLine.name} — Boat End</name>\n    <sym>Flag, Blue</sym>\n  </wpt>`
  );
  // Finish line endpoints (skip if same as start)
  if(!gpxSameLine){
    wptLines.push(
      `  <wpt lat="${gpxFinishLine.lat1.toFixed(6)}" lon="${gpxFinishLine.lng1.toFixed(6)}">\n`+
      `    <name>${gpxFinishLine.name} — Pin End</name>\n    <sym>Flag, Green</sym>\n  </wpt>`
    );
    wptLines.push(
      `  <wpt lat="${gpxFinishLine.lat2.toFixed(6)}" lon="${gpxFinishLine.lng2.toFixed(6)}">\n`+
      `    <name>${gpxFinishLine.name} — Boat End</name>\n    <sym>Flag, Red</sym>\n  </wpt>`
    );
  }
  resolvedMarks.forEach((m,i)=>{
    wptLines.push(
      `  <wpt lat="${m.lat.toFixed(6)}" lon="${m.lng.toFixed(6)}">\n`+
      `    <name>${m.name}</name>\n`+
      `    <desc>Mark ${i+1} \u2014 ${m.rounding==='port'?'Port rounding':'Starboard rounding'}</desc>\n`+
      `    <sym>Waypoint</sym>\n  </wpt>`
    );
  });

  // ── Route — midpoints used for the route line ──────────────────
  const rteptLines=[];
  rteptLines.push(
    `    <rtept lat="${gpxStartPos.lat.toFixed(6)}" lon="${gpxStartPos.lng.toFixed(6)}">\n      <name>Start — ${gpxStartLine.name}</name>\n    </rtept>`
  );
  resolvedMarks.forEach(m=>{
    rteptLines.push(
      `    <rtept lat="${m.lat.toFixed(6)}" lon="${m.lng.toFixed(6)}">\n`+
      `      <name>${m.name}</name>\n`+
      `      <desc>${m.rounding==='port'?'Port':'Stbd'}</desc>\n    </rtept>`
    );
  });
  rteptLines.push(
    `    <rtept lat="${gpxFinishPos.lat.toFixed(6)}" lon="${gpxFinishPos.lng.toFixed(6)}">\n      <name>Finish — ${gpxFinishLine.name}</name>\n    </rtept>`
  );

  const gpx=
`<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${clubName}"
  xmlns="http://www.topografix.com/GPX/1/1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.topografix.com/GPX/1/1 http://www.topografix.com/GPX/1/1/gpx.xsd">
  <metadata>
    <name>${raceName}</name>
    <desc>Course published by ${clubName}</desc>
    <time>${raceDate}</time>
  </metadata>
${wptLines.join('\n')}
  <rte>
    <name>${raceName}</name>
${rteptLines.join('\n')}
  </rte>
</gpx>`;

  const filename=`${clubShort.toLowerCase()}-course-${dateStr}.gpx`;
  const blob=new Blob([gpx],{type:'application/gpx+xml'});

  // Web Share API — iOS Safari 15+ and Android Chrome 86+.
  // Use text/xml (in Chrome's allowlist); apps identify GPX by .gpx extension.
  const shareFile=new File([blob],filename,{type:'text/xml'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[shareFile]})){
    navigator.share({files:[shareFile],title:raceName})
      .catch(e=>{ if(e.name!=='AbortError') _gpxAnchorDownload(blob,filename); });
    return;
  }

  // Desktop / older browser fallback: anchor download
  _gpxAnchorDownload(blob,filename);
}

function _gpxAnchorDownload(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;
  a.setAttribute('download',filename);
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{document.body.removeChild(a);URL.revokeObjectURL(url);},1000);
  toast('GPX downloaded — check your Downloads folder');
}

// ── Shared SVG builder — used by both the published diagram and the RO live preview ──
// startLine / finishLine: objects from LINES[]. When omitted, falls back to LINES[0] (club).
function buildCourseSvg(markEntries, wDeg, startLine, finishLine){
  const _sl=startLine||getLineById('club');
  const _fl=finishLine||getLineById('club');
  const sameLine=_sl.id===_fl.id;

  const resolvedMarks=markEntries.map(me=>{
    const m=MARKS.find(x=>x.id===me.id);
    return m?{...m,rounding:me.rounding||'port'}:null;
  }).filter(Boolean);

  // Build geo list: start endpoints first, then finish endpoints (if different), then marks.
  // Index map:  0=sl.p1  1=sl.p2  [2=fl.p1  3=fl.p2 if different]  then marks
  const geoList=[
    {lat:_sl.lat1,lng:_sl.lng1},
    {lat:_sl.lat2,lng:_sl.lng2},
    ...(!sameLine?[{lat:_fl.lat1,lng:_fl.lng1},{lat:_fl.lat2,lng:_fl.lng2}]:[]),
    ...resolvedMarks.map(m=>({lat:m.lat,lng:m.lng}))
  ];
  const refLat=geoList.reduce((s,p)=>s+p.lat,0)/geoList.length;
  const refLng=geoList.reduce((s,p)=>s+p.lng,0)/geoList.length;
  const cosLat=Math.cos(refLat*Math.PI/180);
  const raw=geoList.map(p=>({x:(p.lng-refLng)*cosLat,y:-(p.lat-refLat)}));

  const SVG_W=320,SVG_H=300,PAD=44;
  const rawXs=raw.map(p=>p.x),rawYs=raw.map(p=>p.y);
  const minX=Math.min(...rawXs),maxX=Math.max(...rawXs);
  const minY=Math.min(...rawYs),maxY=Math.max(...rawYs);
  const rangeX=maxX-minX||0.001,rangeY=maxY-minY||0.001;
  const usableW=SVG_W-PAD*2,usableH=SVG_H-PAD*2;
  const scale=Math.min(usableW/rangeX,usableH/rangeY);
  const scaledW=rangeX*scale,scaledH=rangeY*scale;
  const ox=PAD+(usableW-scaledW)/2-minX*scale;
  const oy=PAD+(usableH-scaledH)/2-minY*scale;
  const toSvg=p=>({x:p.x*scale+ox,y:p.y*scale+oy});
  const svgPts=raw.map(toSvg);

  const slP1=svgPts[0], slP2=svgPts[1];
  const slMid={x:(slP1.x+slP2.x)/2, y:(slP1.y+slP2.y)/2};
  const flP1=sameLine?slP1:svgPts[2], flP2=sameLine?slP2:svgPts[3];
  const flMid=sameLine?slMid:{x:(flP1.x+flP2.x)/2, y:(flP1.y+flP2.y)/2};
  const markOffset=sameLine?2:4;
  const markPts=svgPts.slice(markOffset);
  const route=[slMid,...markPts,flMid];

  let svgParts=[];
  const satFilter=mapTileMode!=='off'?`<filter id="ts" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="0" stdDeviation="1.8" flood-color="rgba(0,0,0,0.95)"/></filter>`:'';
  const tf=mapTileMode!=='off'?' filter="url(#ts)"':'';
  svgParts.push(`<defs>
    <marker id="ca" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
      <path d="M0,0.5 L0,3.5 L4,2 z" fill="rgba(0,180,216,0.8)"/>
    </marker>
    <marker id="cr" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
      <path d="M0,0.5 L0,3.5 L4,2 z" fill="rgba(122,143,166,0.45)"/>
    </marker>
    <marker id="cw" markerWidth="4" markerHeight="4" refX="3" refY="2" orient="auto">
      <path d="M0,0.5 L0,3.5 L4,2 z" fill="rgba(255,170,0,0.9)"/>
    </marker>
    ${satFilter}
  </defs>`);

  if(mapTileMode!=='off'){
    svgParts.push(...buildSatTiles(refLat,refLng,cosLat,scale,ox,oy,SVG_W,SVG_H));
  }

  const NR=4;
  for(let i=0;i<route.length-1;i++){
    const p1=route[i],p2=route[i+1];
    const dx=p2.x-p1.x,dy=p2.y-p1.y,len=Math.sqrt(dx*dx+dy*dy)||1;
    const sx=p1.x+dx/len*NR,sy=p1.y+dy/len*NR;
    const ex=p2.x-dx/len*(NR+2),ey=p2.y-dy/len*(NR+2);
    svgParts.push(`<line x1="${sx.toFixed(1)}" y1="${sy.toFixed(1)}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="rgba(0,180,216,0.6)" stroke-width="1.8" marker-end="url(#ca)"/>`);
  }

  resolvedMarks.forEach((m,i)=>{
    const p=markPts[i];
    const rnd=m.rounding;
    const rndCol=rnd==='port'?'#e63946':'#2dc653';
    const cx=p.x.toFixed(1), cy=p.y.toFixed(1);
    const r=NR, top=(p.y-r).toFixed(1), bot=(p.y+r).toFixed(1);
    // Half-circle paths split vertically at cx:
    //   left  half: arc sweeps counterclockwise (flag 0)
    //   right half: arc sweeps clockwise       (flag 1)
    const leftHalf =`M ${cx} ${top} A ${r} ${r} 0 0 0 ${cx} ${bot} Z`;
    const rightHalf=`M ${cx} ${top} A ${r} ${r} 0 0 1 ${cx} ${bot} Z`;
    // Port rounding  → red   left half,  mark-colour right half
    // Stbd rounding  → mark-colour left, green right half
    const [leftFill,rightFill]=rnd==='port'
      ?[rndCol, m.colour+'cc']
      :[m.colour+'cc', rndCol];
    // Outer glow
    svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${r+3}" fill="${m.colour}12" stroke="${m.colour}" stroke-width="0.7" opacity="0.55"/>`);
    // Split halves
    svgParts.push(`<path d="${leftHalf}"  fill="${leftFill}"  opacity="0.85"/>`);
    svgParts.push(`<path d="${rightHalf}" fill="${rightFill}" opacity="0.85"/>`);
    // Circle outline & centre dot
    svgParts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${m.colour}" stroke-width="1.5"/>`);
    svgParts.push(`<circle cx="${cx}" cy="${cy}" r="1.5" fill="${m.colour}"/>`);
    // Label: name above, small P/S below in rounding colour
    const labelLeft=p.x<=SVG_W/2;
    const lx=(labelLeft?p.x-r-4:p.x+r+4).toFixed(1);
    const anchor=labelLeft?'end':'start';
    svgParts.push(`<text x="${lx}" y="${(p.y-2).toFixed(1)}" text-anchor="${anchor}" fill="${m.colour}" font-family="Barlow Condensed,sans-serif" font-size="9" font-weight="400"${tf}>${m.name}</text>`);
    svgParts.push(`<text x="${lx}" y="${(p.y+7).toFixed(1)}" text-anchor="${anchor}" fill="${rndCol}" font-family="Barlow Condensed,sans-serif" font-size="7.5" font-weight="700"${tf}>${rnd==='port'?'PORT':'STBD'}</text>`);
  });

  // ── Start / finish line rendering ────────────────────────────────────────
  // drawRaceLine(p1, p2, label, col) — draws the physical line + endpoint dots + label
  const drawRaceLine=(p1,p2,label,col)=>{
    const isPoint=Math.abs(p1.x-p2.x)<0.5&&Math.abs(p1.y-p2.y)<0.5; // same coords = placeholder
    if(isPoint){
      // Fallback: single decorated circle (same as old S/F rendering)
      const R=NR+1,px=p1.x.toFixed(1),py=p1.y.toFixed(1);
      svgParts.push(`<circle cx="${px}" cy="${py}" r="${R+4}" fill="none" stroke="${col}" stroke-width="1.2" stroke-dasharray="4 3" opacity="0.55"/>`);
      svgParts.push(`<circle cx="${px}" cy="${py}" r="${R}" fill="${col}26" stroke="${col}" stroke-width="2"/>`);
      svgParts.push(`<text x="${px}" y="${(p1.y+0.5).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" fill="${col}" font-family="Barlow Condensed,sans-serif" font-size="8" font-weight="800"${tf}>${label}</text>`);
    } else {
      // Real two-point line
      svgParts.push(`<line x1="${p1.x.toFixed(1)}" y1="${p1.y.toFixed(1)}" x2="${p2.x.toFixed(1)}" y2="${p2.y.toFixed(1)}" stroke="${col}" stroke-width="3.5" stroke-linecap="round" opacity="0.85"/>`);
      svgParts.push(`<circle cx="${p1.x.toFixed(1)}" cy="${p1.y.toFixed(1)}" r="3" fill="${col}" opacity="0.9"/>`);
      svgParts.push(`<circle cx="${p2.x.toFixed(1)}" cy="${p2.y.toFixed(1)}" r="3" fill="${col}" opacity="0.9"/>`);
      const mx=((p1.x+p2.x)/2).toFixed(1), my=((p1.y+p2.y)/2-6).toFixed(1);
      svgParts.push(`<text x="${mx}" y="${my}" text-anchor="middle" fill="${col}" font-family="Barlow Condensed,sans-serif" font-size="8" font-weight="800"${tf}>${label}</text>`);
    }
  };
  if(sameLine){
    drawRaceLine(slP1,slP2,'S/F','#00b4d8');
  } else {
    drawRaceLine(slP1,slP2,'START','#00b4d8');
    drawRaceLine(flP1,flP2,'FINISH','#2dc653');
  }

  {
    const nx=SVG_W-18,ny=32,nh=14;
    svgParts.push(`<line x1="${nx}" y1="${ny+nh/2}" x2="${nx}" y2="${ny-nh/2}" stroke="rgba(180,200,220,0.55)" stroke-width="1.5" marker-end="url(#ca)"/>`);
    svgParts.push(`<text x="${nx}" y="${ny+nh/2+10}" text-anchor="middle" fill="rgba(122,143,166,0.65)" font-family="Barlow Condensed,sans-serif" font-size="8" font-weight="700"${tf}>N</text>`);
  }

  if(wDeg!=null){
    const wCX=20,wCY=24,wLen=13;
    const wRad=(wDeg+180)*Math.PI/180;
    const arrowX=(wCX+Math.sin(wRad)*wLen).toFixed(1);
    const arrowY=(wCY-Math.cos(wRad)*wLen).toFixed(1);
    svgParts.push(`<line x1="${wCX}" y1="${wCY}" x2="${arrowX}" y2="${arrowY}" stroke="rgba(255,170,0,0.75)" stroke-width="2" marker-end="url(#cw)"/>`);
    svgParts.push(`<text x="${wCX}" y="${wCY+13}" text-anchor="middle" fill="rgba(255,170,0,0.75)" font-family="Barlow Condensed,sans-serif" font-size="8" font-weight="700"${tf}>${wDeg}°</text>`);
  }

  return `<svg viewBox="0 0 ${SVG_W} ${SVG_H}" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;height:auto;display:block">${svgParts.join('\n')}</svg>`;
}

// ── RO live course preview ────────────────────────────────────────────────
function renderRoCoursePreview(){
  const wrap=document.getElementById('roCoursePreview');
  if(!wrap) return;
  if(!courseMarks.length){
    wrap.innerHTML='<div class="ro-preview-empty">Tap marks above to preview the course</div>';
    return;
  }
  wrap.innerHTML=buildCourseSvg(courseMarks, windDeg,
    getLineById(selectedStartLineId), getLineById(selectedFinishLineId));
}

function renderCourseDiagram(targetId){
  const wrap=document.getElementById(targetId||'courseDisplay');
  const state=getCourseState();

  if(state==='none'){
    wrap.innerHTML='<div class="no-course-state"><div class="icon">🗺</div><div>No course published yet</div></div>';
    return;
  }

  if(state==='pending'){
    const raceTime=nextRace?nextRace.date.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'}):'today';
    wrap.innerHTML=
      '<div class="no-course-state" style="gap:10px">'+
        '<div class="icon">🕐</div>'+
        '<div style="font-size:1rem;font-weight:700;color:var(--white)">Course Not Yet Set</div>'+
        '<div style="font-size:.82rem;color:var(--muted);line-height:1.5;max-width:260px;text-align:center">'+
          'The Race Officer will publish today\'s course before the '+(nextRace?nextRace.date.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'}):'')+' start.<br>Check back closer to race time.'+
        '</div>'+
      '</div>';
    return;
  }

  // stale or live — render the full diagram with a banner if stale
  const isStale=state==='stale';
  const c=publishedCourse;

  // ── Course card (RCYC) rendering path — round-by-round text display ──────────
  const rounds=Array.isArray(c.rounds)&&c.rounds.length?c.rounds:null;
  if(rounds&&c.courseNumber){
    const windDegDisp2=c.windDeg!=null?c.windDeg+'° '+c.windDir:'—';
    const lastDist=rounds[rounds.length-1].distance_nm;
    const gwNote=rounds.some(r=>r.note)
      ?'<div style="margin-top:10px;padding:9px 12px;background:rgba(232,160,32,.08);border:1px solid rgba(232,160,32,.25);border-radius:8px;font-size:.8rem;color:var(--gold)">'+
        rounds.filter(r=>r.note).map(r=>'ℹ '+r.note).join('<br>')+
        '</div>':''
    ;
    wrap.innerHTML=`
      <div class="course-diagram-wrap">
        ${isStale?`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(232,160,32,.1);border:1px solid rgba(232,160,32,.35);border-radius:10px;margin-bottom:12px">
          <span>⚠️</span><div>
            <div style="font-size:.75rem;font-weight:700;color:var(--gold);text-transform:uppercase">Previous Course — For Reference Only</div>
            <div style="font-size:.78rem;color:var(--muted)">Today's course has not been published yet.</div>
          </div>
        </div>`:''}
        <div class="course-header">
          <div>
            <div class="course-title-label">${isStale?'Last Published Course':'Course'}</div>
            <div class="course-name-text">${c.name||'Course '+c.courseNumber}</div>
            <div style="font-size:.78rem;color:${isStale?'var(--muted)':'var(--teal)'};margin-top:2px">
              ${c.published_at?'Set '+new Date(c.published_at).toLocaleString('en-IE',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
            <div class="wind-badge"><span class="wind-badge-arrow">💨</span><span class="wind-badge-label">${windDegDisp2}</span></div>
            <div style="background:rgba(0,174,239,.08);border:1px solid rgba(0,174,239,.2);border-radius:20px;padding:3px 10px;font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;color:var(--teal)">📏 ${lastDist} nm</div>
          </div>
        </div>
        ${c.notes?`<div style="margin-top:10px;padding:9px 12px;background:rgba(232,160,32,.08);border:1px solid rgba(232,160,32,.25);border-radius:8px;font-size:.82rem;color:var(--gold)">📋 ${c.notes}</div>`:''}
        <div style="margin-top:14px;${isStale?'opacity:0.6':''}">
          ${rounds.map((r,i)=>`
            <div style="background:rgba(255,255,255,.04);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:8px">
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;color:var(--teal);letter-spacing:.06em;text-transform:uppercase;margin-bottom:4px">
                ${r.label} · ${r.distance_nm} nm
              </div>
              <div style="font-size:.95rem;color:var(--white);line-height:1.5">${r.marks}</div>
              ${r.note?`<div style="font-size:.75rem;color:var(--gold);margin-top:5px">ℹ ${r.note}</div>`:''}
            </div>
          `).join('')}
        </div>
        ${gwNote}
      </div>
    `;
    return;
  }

  const markEntries=(c.marks||[]).map(m=>typeof m==='string'?{id:m,rounding:'port'}:m);
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const windDir=c.windDeg!=null?dirs[Math.round(c.windDeg/22.5)%16]:'—';
  const windDegDisp=c.windDeg!=null?c.windDeg+'° '+windDir:'—';

  const pubStartLine=getLineById(c.startLineId||'club');
  const pubFinishLine=getLineById(c.finishLineId||'club');
  const pubStartPos=lineMidpoint(pubStartLine);
  const pubFinishPos=lineMidpoint(pubFinishLine);
  const svgEl=buildCourseSvg(markEntries, c.windDeg, pubStartLine, pubFinishLine);

  // ── Leg table ──────────────────────────────────────────────────
  let legRows='';
  let prevLat=pubStartPos.lat,prevLng=pubStartPos.lng;
  legRows+=`<div class="leg-row">
    <span class="leg-num" style="color:var(--teal)">S</span>
    <span class="mark-colour" style="background:#00b4d8"></span>
    <span class="leg-mark">${pubStartLine.name}</span>
    <span class="leg-rounding" style="background:rgba(0,180,216,.1);color:var(--teal);border:1px solid rgba(0,180,216,.3)">START</span>
    <span class="leg-detail" style="color:var(--muted)">—</span>
  </div>`;
  markEntries.forEach((me,i)=>{
    const m=MARKS.find(x=>x.id===me.id); if(!m)return;
    const brg=Math.round(bearing(prevLat,prevLng,m.lat,m.lng));
    const d=Math.round(dist(prevLat,prevLng,m.lat,m.lng)/1852*10)/10;
    const dir=dirs[Math.round(brg/22.5)%16];
    const rnd=me.rounding||'port';
    const rndLabel=rnd==='port'?'◄ Port':'Stbd ►';
    legRows+=`<div class="leg-row" onclick="showMarkCoords('${m.name.replace(/'/g,"\\'")}',${m.lat},${m.lng})" style="cursor:pointer">
      <span class="leg-num">${i+1}</span>
      <span class="mark-colour" style="background:${m.colour}"></span>
      <span class="leg-mark">${m.name}</span>
      <span class="leg-rounding ${rnd}">${rndLabel}</span>
      <span class="leg-detail">${brg}° · ${d}nm</span>
    </div>`;
    prevLat=m.lat; prevLng=m.lng;
  });
  const retBrg=Math.round(bearing(prevLat,prevLng,pubFinishPos.lat,pubFinishPos.lng));
  const retD=Math.round(dist(prevLat,prevLng,pubFinishPos.lat,pubFinishPos.lng)/1852*10)/10;
  legRows+=`<div class="leg-row">
    <span class="leg-num">${markEntries.length+1}</span>
    <span class="mark-colour" style="background:#2dc653"></span>
    <span class="leg-mark">${pubFinishLine.name}</span>
    <span class="leg-rounding" style="background:rgba(45,198,83,.1);color:#2dc653;border:1px solid rgba(45,198,83,.3)">FINISH</span>
    <span class="leg-detail">${retBrg}° · ${retD}nm</span>
  </div>`;

  let totalDist=0,tLat=pubStartPos.lat,tLng=pubStartPos.lng;
  markEntries.forEach(me=>{
    const m=MARKS.find(x=>x.id===me.id); if(!m)return;
    totalDist+=dist(tLat,tLng,m.lat,m.lng); tLat=m.lat; tLng=m.lng;
  });
  totalDist+=dist(tLat,tLng,pubFinishPos.lat,pubFinishPos.lng);
  const totalNm=Math.round(totalDist/1852*10)/10;

  wrap.innerHTML=`
    <div class="course-diagram-wrap">
      ${isStale?`
      <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:rgba(232,160,32,.1);border:1px solid rgba(232,160,32,.35);border-radius:10px;margin-bottom:12px">
        <span style="font-size:1.1rem">⚠️</span>
        <div>
          <div style="font-size:.75rem;font-weight:700;color:var(--gold);letter-spacing:.04em;text-transform:uppercase">Previous Course — For Reference Only</div>
          <div style="font-size:.78rem;color:var(--muted);margin-top:1px">Today's course has not been published yet. Check back before race time.</div>
        </div>
      </div>`:''}
      <div class="course-header">
        <div>
          <div class="course-title-label">${isStale?'Last Published Course':'Course'}</div>
          <div class="course-name-text">${c.name||'Published Course'}</div>
          <div style="font-size:.78rem;color:${isStale?'var(--muted)':'var(--teal)'};margin-top:2px">
            ${c.published_at?'Set '+new Date(c.published_at).toLocaleString('en-IE',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):''}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px">
          <div class="wind-badge">
            <span class="wind-badge-arrow">💨</span>
            <span class="wind-badge-label">${windDegDisp}</span>
          </div>
          <div style="display:flex;align-items:center;gap:5px;background:rgba(0,174,239,.08);border:1px solid rgba(0,174,239,.2);border-radius:20px;padding:3px 10px">
            <span style="font-size:.8rem">📏</span>
            <span style="font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;color:var(--teal)">${totalNm} nm</span>
          </div>
          <button onclick="toggleMapMode()" style="font-family:'Barlow Condensed',sans-serif;font-size:.8rem;font-weight:700;letter-spacing:.04em;padding:3px 10px;border-radius:20px;cursor:pointer;transition:all .2s;${mapTileMode!=='off'?'border:1px solid rgba(0,174,239,.6);background:rgba(0,174,239,.15);color:var(--teal)':'border:1px solid var(--border);background:transparent;color:var(--muted)'}">🛰 Satellite</button>
        </div>
      </div>
      ${c.notes?`<div style="margin-top:10px;padding:9px 12px;background:rgba(232,160,32,.08);border:1px solid rgba(232,160,32,.25);border-radius:8px;font-size:.82rem;color:var(--gold);line-height:1.4">📋 ${c.notes}</div>`:''}
      <div class="course-legs-list" style="margin-top:12px;${isStale?'opacity:0.6':''}">
        ${legRows}
      </div>
      <div class="course-svg-wrap" style="margin-top:12px;border:1px solid var(--border);border-radius:12px;overflow:hidden;background:${mapTileMode!=='off'?'#060d1c':'rgba(4,14,32,0.7)'};${isStale?'opacity:0.6':''}">
        ${svgEl}
      </div>
      <button onclick="downloadCourseGpx('published')"
        style="width:100%;margin-top:12px;padding:10px;background:transparent;
        border:1px solid rgba(0,174,239,.3);border-radius:10px;color:var(--teal);
        font-family:'Barlow Condensed',sans-serif;font-size:.9rem;font-weight:700;
        letter-spacing:.04em;cursor:pointer;display:flex;align-items:center;
        justify-content:center;gap:7px">
        ⬇ Download GPX for chartplotter / navigation app
      </button>
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════
// RACE OFFICER — COURSE BUILDER
// ═══════════════════════════════════════════════════════════════
function buildMarksGrid(){
  const g=document.getElementById('marksGrid'); g.innerHTML='';
  MARKS.filter(m=>m.active!==false).forEach(m=>{
    const el=document.createElement('div');
    el.className='mark-toggle'; el.id='mt-'+m.id;
    el.innerHTML=
      '<div class="mark-toggle-id" style="display:flex;align-items:center;gap:4px">'+
        '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+m.colour+';flex-shrink:0"></span>'+
        m.name+'</div>'+
      '<div style="font-size:.75rem;color:var(--teal);margin-top:3px;font-family:Barlow Condensed,sans-serif;font-weight:600">+ ADD</div>';
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
  renderRoCoursePreview();
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
  renderRoCoursePreview();
}
function setRounding(idx,rnd){
  if(courseMarks[idx]) courseMarks[idx].rounding=rnd;
  renderSelectedOrder();
  renderRoCoursePreview();
}
function renderSelectedOrder(){
  const wrap=document.getElementById('selectedMarksOrder');
  const list=document.getElementById('smoList');
  list.innerHTML='';
  if(!courseMarks.length){wrap.style.display='none';return;}
  wrap.style.display='block';
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  let prevLat=START_POS.lat, prevLng=START_POS.lng;
  let totalDist=0;
  courseMarks.forEach((entry,i)=>{
    const m=MARKS.find(x=>x.id===entry.id);
    const colour=m?m.colour:'#888';
    const isPort=entry.rounding==='port';
    const brg=m?Math.round(bearing(prevLat,prevLng,m.lat,m.lng)):null;
    const d=m?Math.round(dist(prevLat,prevLng,m.lat,m.lng)/1852*10)/10:null;
    const dir=brg!=null?dirs[Math.round(brg/22.5)%16]:'';
    if(m){totalDist+=dist(prevLat,prevLng,m.lat,m.lng);prevLat=m.lat;prevLng=m.lng;}
    const el=document.createElement('div');
    el.className='smo-item';
    el.style.cssText='display:flex;align-items:center;gap:6px;background:var(--navy);border:1px solid var(--border);border-radius:10px;padding:7px 10px;margin-bottom:6px;';
    el.innerHTML=
      '<span style="font-family:Barlow Condensed,sans-serif;font-size:.75rem;color:var(--teal);font-weight:700;min-width:16px">'+(i+1)+'.</span>'+
      '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:'+colour+';flex-shrink:0"></span>'+
      '<span style="flex:1;min-width:0">'+
        '<span style="display:block;font-family:Barlow Condensed,sans-serif;font-weight:800;font-size:.95rem">'+(m?m.name:entry.id)+'</span>'+
        (brg!=null?'<span style="display:block;font-family:Barlow Condensed,sans-serif;font-size:.75rem;color:var(--muted);margin-top:1px">'+brg+'° '+dir+' · '+d+'nm</span>':'')+
      '</span>'+
      '<button onclick="setRounding('+i+',\'port\')" style="font-size:.75rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 7px;border-radius:6px;border:1px solid '+(isPort?'#e63946':'var(--border)')+';background:'+(isPort?'rgba(230,57,70,.2)':'transparent')+';color:'+(isPort?'#e63946':'var(--muted)')+';cursor:pointer">◄ Port</button>'+
      '<button onclick="setRounding('+i+',\'stbd\')" style="font-size:.75rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 7px;border-radius:6px;border:1px solid '+(isPort?'var(--border)':'#2dc653')+';background:'+(isPort?'transparent':'rgba(45,198,83,.2)')+';color:'+(isPort?'var(--muted)':'#2dc653')+';cursor:pointer">Stbd ►</button>'+
      '<span onclick="removeMarkFromSequence('+i+')" style="color:var(--muted);cursor:pointer;font-size:.9rem;padding:0 2px;line-height:1" title="Remove">✕</span>';
    list.appendChild(el);
  });
  // Return leg + total distance summary
  const retBrg=Math.round(bearing(prevLat,prevLng,START_POS.lat,START_POS.lng));
  const retD=Math.round(dist(prevLat,prevLng,START_POS.lat,START_POS.lng)/1852*10)/10;
  totalDist+=dist(prevLat,prevLng,START_POS.lat,START_POS.lng);
  const totalNm=Math.round(totalDist/1852*10)/10;
  const retDir=dirs[Math.round(retBrg/22.5)%16];
  const summary=document.createElement('div');
  summary.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border:1px solid rgba(0,174,239,.2);border-radius:8px;background:rgba(0,174,239,.05);margin-top:2px';
  summary.innerHTML=
    '<span style="font-family:Barlow Condensed,sans-serif;font-size:.78rem;color:var(--muted)">↩ Finish: '+retBrg+'° '+retDir+' · '+retD+'nm</span>'+
    '<span style="font-family:Barlow Condensed,sans-serif;font-size:.85rem;font-weight:700;color:var(--teal)">📏 '+totalNm+'nm</span>';
  list.appendChild(summary);
}
function updateWind(v){
  windDeg=parseInt(v);
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const dir=dirs[Math.round(windDeg/22.5)%16];
  document.getElementById('windDegLabel').textContent=windDeg+'° '+dir;
  renderRoCoursePreview();
}
// ── Line selector helpers ─────────────────────────────────────────────────
function populateLineSelects(){
  const startSel=document.getElementById('startLineSelect');
  const finishSel=document.getElementById('finishLineSelect');
  if(!startSel||!finishSel) return;
  const makeOpts=(selectedId)=>LINES.filter(l=>l.isActive!==false||l.isDefault).map(l=>
    `<option value="${l.id}"${l.id===selectedId?' selected':''}>${l.isDefault?'★ ':''}${l.name}</option>`
  ).join('');
  startSel.innerHTML=makeOpts(selectedStartLineId);
  finishSel.innerHTML=makeOpts(selectedFinishLineId);
}
function updateStartLine(id){
  selectedStartLineId=id;
  renderRoCoursePreview();
}
function updateFinishLine(id){
  selectedFinishLineId=id;
  renderRoCoursePreview();
}

function _buildCoursePayload(id){
  const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
  const dir=dirs[Math.round(windDeg/22.5)%16];
  const name='S/F – '+courseMarks.map(x=>{const m=MARKS.find(mk=>mk.id===x.id);return m?m.name:x.id;}).join(' – ')+' – Finish';
  const notes=(document.getElementById('courseNotes')||{}).value||'';
  return{
    id,
    name,
    marks:courseMarks,
    windDeg,
    windDir:dir,
    race_name:selectedRace?selectedRace.label:'',
    notes:notes.trim(),
    published_at:new Date().toISOString(),
    startLineId:selectedStartLineId,
    finishLineId:selectedFinishLineId
  };
}

async function saveDraft(){
  if(!courseMarks.length){toast('Add at least one mark first');return;}
  setSyncStatus('syncing');
  const ok=await sbSaveCourse(_buildCoursePayload('draft'));
  if(ok){
    setSyncStatus('ok');
    const bar=document.getElementById('draftStatusBar');
    if(bar) bar.style.display='';
    toast('💾 Draft saved — not yet visible to skippers');
  } else {
    setSyncStatus('offline');
    toast('⚠ Could not save draft');
  }
}

async function loadDraftIfExists(){
  const r=await sbFetch('/rest/v1/published_courses?id=eq.draft&limit=1');
  if(!r||!r.length) return;
  const row=r[0];
  let marks=row.marks||[];
  if(typeof marks==='string'){try{marks=JSON.parse(marks);}catch(e){marks=[];}}
  if(!marks.length) return;
  // Restore draft into builder
  courseMarks=marks;
  windDeg=row.wind_deg||0;
  if(row.notes){const n=document.getElementById('courseNotes');if(n)n.value=row.notes;}
  if(row.start_line_id) selectedStartLineId=row.start_line_id;
  if(row.finish_line_id) selectedFinishLineId=row.finish_line_id;
  renderCourseBuilder();
  const bar=document.getElementById('draftStatusBar');
  if(bar) bar.style.display='';
  toast('📝 Draft course loaded');
}

async function publishCourse(){
  if(!courseMarks.length){toast('Select at least one mark');return;}
  setSyncStatus('syncing');
  const course=_buildCoursePayload('current');
  const ok=await sbSaveCourse(course);
  if(ok){
    // Clear the draft row so it doesn't reload next time
    sbFetch('/rest/v1/published_courses?id=eq.draft',{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}}).catch(()=>{});
    publishedCourse=course;
    setSyncStatus('ok');
    const bar=document.getElementById('draftStatusBar');
    if(bar) bar.style.display='none';
    try{renderCourseDiagram();}catch(e){console.error('renderCourseDiagram error',e);}
    roDashCoursePublished=true;
    updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
    updateHomeChips();
    toast('✅ Course published to all skippers!');
  } else {
    setSyncStatus('offline');
    toast('⚠ Could not save to database');
  }
}
async function buildPinMgmtList(){
  const list=document.getElementById('pinMgmtList'); if(!list)return;
  list.innerHTML='<div style="text-align:center;padding:16px;color:var(--muted);font-size:.85rem">Loading…</div>';
  // Fetch live PINs from DB — never trust localStorage for the RO view
  const rows=await sbFetch('/rest/v1/boats?select=id,pin');
  const pinMap={};
  if(Array.isArray(rows)) rows.forEach(r=>{ pinMap[r.id]=r.pin||'0000'; });
  list.innerHTML='';
  boats.forEach(b=>{
    const pin=pinMap[b.id]||'0000'; // live DB value; fall back to 0000 if not found
    const row=document.createElement('div');
    row.id='pinrow-'+b.id;
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;background:var(--navy);border-radius:10px;padding:9px 12px;margin-bottom:5px;';
    row.innerHTML=
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<button onclick="openIconPicker(\''+b.id+'\')" title="Change icon" '+
          'style="font-size:1.4rem;padding:0;border:none;background:none;cursor:pointer;line-height:1">'+b.icon+'</button>'+
        '<span style="font-family:Barlow Condensed,sans-serif;font-weight:700;font-size:.9rem">'+b.name+'</span>'+
      '</div>'+
      '<div style="display:flex;align-items:center;gap:6px">'+
        '<span style="font-family:Barlow Condensed,sans-serif;font-size:.85rem;color:var(--muted);letter-spacing:.15em">'+pin+'</span>'+
        '<button onclick="openChangePinForBoat(\''+b.id+'\')" style="font-size:.8rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--teal);cursor:pointer">PIN</button>'+
        '<button onclick="deleteBoat(\''+b.id+'\')" style="font-size:.8rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(230,57,70,.4);background:transparent;color:#e63946;cursor:pointer">Delete</button>'+
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
      '<button onclick="openChangePinForBoat(\'ro\')" style="font-size:.8rem;font-family:Barlow Condensed,sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(254,224,30,.4);background:transparent;color:var(--ro);cursor:pointer">PIN</button>'+
    '</div>';
  list.appendChild(roRow);
}

function openIconPicker(boatId){
  const b=boats.find(x=>x.id===boatId); if(!b) return;
  const old=document.getElementById('iconPickerOverlay'); if(old) old.remove();
  // Curated emoji palette — nautical, birds, animals, nature, bold
  const emojis=[
    '⛵','🚢','🛥️','⚓','🌊','🏄','🎣','🧭','💨','🌬️','🏖️','🪝',
    '🦅','🦜','🐦','🦢','🦩','🦆','🦉','🦚','🦋','🐧',
    '🦭','🐬','🐳','🦈','🐙','🦀','🦞','🐠','🐟',
    '🌴','🌿','🍀','🌸','🌺','⭐','🌟','💫','☀️','🌙','🌈','⚡',
    '🔥','💥','😈','🏴‍☠️','🎯','🏆','💎','🚀','🦊','🐺','🦁','🐯',
    '🍺','🎪','🎭','🎸','🥊','🏋️','⚔️','🛡️','🔱','♟️'
  ];
  const overlay=document.createElement('div');
  overlay.id='iconPickerOverlay';
  overlay.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center';
  overlay.onclick=e=>{ if(e.target===overlay) overlay.remove(); };
  overlay.innerHTML=`
    <div style="background:var(--card);border-radius:18px 18px 0 0;padding:20px 16px 32px;width:100%;max-width:480px;max-height:55vh;overflow-y:auto">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px">
        <span style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:1.05rem">
          ${b.icon} Change icon · ${b.name}
        </span>
        <button onclick="document.getElementById('iconPickerOverlay').remove()"
          style="background:none;border:none;color:var(--muted);font-size:1.3rem;cursor:pointer;padding:0;line-height:1">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px">
        ${emojis.map(e=>`<button onclick="setBoatIcon('${boatId}','${e}')"
          style="font-size:1.5rem;padding:7px 4px;border-radius:8px;cursor:pointer;line-height:1;
          border:2px solid ${e===b.icon?'var(--teal)':'transparent'};
          background:${e===b.icon?'rgba(0,174,239,.1)':'var(--navy)'}">${e}</button>`).join('')}
      </div>
    </div>`;
  document.body.appendChild(overlay);
}

async function setBoatIcon(boatId, emoji){
  const b=boats.find(x=>x.id===boatId); if(!b) return;
  b.icon=emoji;
  saveCustom(boats); // update localStorage cache
  await sbFetch('/rest/v1/boats?id=eq.'+encodeURIComponent(boatId),{
    method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({icon:emoji})
  });
  const overlay=document.getElementById('iconPickerOverlay'); if(overlay) overlay.remove();
  renderBoatGrid();
  buildPinMgmtList();
  toast(b.name+' icon updated');
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
  selectedStartLineId='club';
  selectedFinishLineId='club';
  populateLineSelects();
  document.querySelectorAll('.mark-toggle').forEach(el=>el.classList.remove('selected'));
  document.getElementById('courseNotes').value='';
  renderSelectedOrder();
}
function shareRegistrationInvite(){
  if(!nextRace){toast('No upcoming race found');return;}

  const raceName=nextRace.label;
  const raceDate=nextRace.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'});
  const raceTime=nextRace.date.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  const appUrl='https://racing.gbsc.ie';

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
    roDashRegsCount=0;
    updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
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
      '<div style="display:flex;align-items:center;gap:8px">'+
        '<div class="reg-status paid">#'+(i+1)+'</div>'+
        '<button onclick="roUnregisterBoat(\''+r.boat_id+'\',\''+name+'\')" title="Remove registration" '+
        'style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);'+
        'font-size:.8rem;padding:3px 7px;cursor:pointer;line-height:1">🗑</button>'+
      '</div>';
    list.appendChild(row);
  });
  roDashRegsCount=regs.length;
  updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
}

async function roUnregisterBoat(boatId,boatName){
  if(!confirm('Remove '+boatName+' from this race?'))return;
  await sbUnregisterBoat(boatId,nextRace);
  registeredBoatIds.delete(boatId);
  // Remove row from DOM immediately
  const list=document.getElementById('regList');
  const rows=list.querySelectorAll('.reg-row');
  rows.forEach(row=>{ if(row.innerHTML.includes(boatName)) row.remove(); });
  // Renumber remaining rows
  list.querySelectorAll('.reg-row').forEach((row,i)=>{
    const badge=row.querySelector('.reg-status');
    if(badge) badge.textContent='#'+(i+1);
  });
  roDashRegsCount=Math.max(0,roDashRegsCount-1);
  updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
  if(!list.querySelector('.reg-row')){
    list.innerHTML='<div class="empty-state" style="padding:16px"><div class="icon" style="font-size:1.6rem">⛵</div><div>No boats registered yet</div></div>';
  }
  // Update skipper's own registered pill if they're logged in
  updateRegStatus();
  toast(boatName+' unregistered');
}

function roShowForceRegForm(){
  const btn=document.getElementById('roForceRegBtn');
  const form=document.getElementById('roForceRegForm');
  const sel=document.getElementById('roForceRegSelect');
  if(!btn||!form||!sel) return;
  // Populate with boats not yet registered
  const unregistered=boats.filter(b=>!registeredBoatIds.has(b.id));
  if(!unregistered.length){toast('All boats are already registered');return;}
  sel.innerHTML=unregistered.map(b=>`<option value="${b.id}">${b.icon} ${b.name}</option>`).join('');
  btn.style.display='none';
  form.style.display='block';
}

function roHideForceRegForm(){
  const btn=document.getElementById('roForceRegBtn');
  const form=document.getElementById('roForceRegForm');
  if(btn) btn.style.display='';
  if(form) form.style.display='none';
}

async function roForceRegister(){
  const sel=document.getElementById('roForceRegSelect');
  if(!sel||!sel.value) return;
  const boatId=sel.value;
  const boat=boats.find(b=>b.id===boatId);
  const name=boat?boat.name:boatId;
  const race=nextRace;
  if(!race){toast('No current race found');return;}
  const ok=await sbRegisterBoat(boatId,race);
  if(ok){
    registeredBoatIds.add(boatId);
    roHideForceRegForm();
    await loadRegistrations();
    toast(name+' registered by RO');
  }
}

// ═══════════════════════════════════════════════════════════════
// FEE STATEMENTS
// ═══════════════════════════════════════════════════════════════

let feeStmtBoatId=null, feeStmtShareText='';

function openFeeStatement(boatId){
  feeStmtBoatId=boatId||currentBoat?.id||(isRO&&boats[0]?.id)||null;
  const panel=document.getElementById('feeStatementPanel');
  if(!panel) return;
  const sel=document.getElementById('feeStmtBoatSel');
  if(sel){
    if(isRO){
      sel.style.display='';
      sel.innerHTML=boats.map(b=>`<option value="${b.id}"${b.id===feeStmtBoatId?' selected':''}>${b.icon} ${b.name}</option>`).join('');
    } else {
      sel.style.display='none';
    }
  }
  openPanel('feeStatementPanel');
  renderFeeStatement();
}

async function renderFeeStatement(){
  const body=document.getElementById('feeStmtBody');
  if(!body||!feeStmtBoatId) return;
  const boat=boats.find(b=>b.id===feeStmtBoatId)||{name:feeStmtBoatId,icon:'⛵'};
  document.getElementById('feeStmtTitle').textContent=`${boat.icon} ${boat.name}`;
  body.innerHTML='<div style="color:var(--muted);font-size:.85rem;padding:12px 0;text-align:center">Loading…</div>';

  const [regs,selfPays,racePays]=await Promise.all([
    sbLoadBoatRegistrations(feeStmtBoatId),
    sbLoadAllBoatPayments(feeStmtBoatId),
    sbLoadAllBoatRacePayments(feeStmtBoatId)
  ]);

  if(!regs||!selfPays||!racePays){
    body.innerHTML='<div style="color:var(--muted);padding:16px;text-align:center">Could not load data — check connection</div>';
    return;
  }

  // Merge both payment sources — deduplicate by crew_id+race_key so a crew
  // member recorded in both tables (self-pay + skipper-marked) counts only once.
  // race_payments (skipper-confirmed) takes priority over self_payments.
  const payMap={};
  const seenCrewRace=new Set();
  const addToMap=p=>{
    const dedupKey=`${p.crew_id}|${p.race_key}`;
    if(seenCrewRace.has(dedupKey)) return;
    seenCrewRace.add(dedupKey);
    if(!payMap[p.race_key]) payMap[p.race_key]={total:0,methods:new Set(),count:0};
    payMap[p.race_key].total+=(p.amount||0);
    if(p.method) payMap[p.race_key].methods.add(p.method);
    payMap[p.race_key].count++;
  };
  // Process race_payments first so they take priority in dedup
  racePays.forEach(addToMap);
  selfPays.forEach(addToMap);

  if(!regs.length){
    body.innerHTML='<div style="color:var(--muted);padding:20px;text-align:center;font-size:.9rem">No past races found for this boat.</div>';
    return;
  }

  let totalPaid=0, outstandingCount=0;
  const fmtDate=d=>new Date(d+'T12:00:00Z').toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'});
  const club=window.CLUB?.name||'Sailing Club';
  const today=new Date().toLocaleDateString('en-IE',{day:'numeric',month:'long',year:'numeric'});
  const shareLines=[];
  // Skipper view: rows are clickable and drill into race fees for that race
  const clickable=!isRO&&feeStmtBoatId===currentBoat?.id;

  let html='';
  for(const r of regs){
    const pay=payMap[r.race_key];
    const dateStr=fmtDate(r.race_date);
    const clickAttr=clickable?`onclick="feeStmtOpenRace('${r.race_key}')" style="cursor:pointer"`:'';
    if(pay){
      totalPaid+=pay.total;
      const methods=[...pay.methods].join(' / ')||'—';
      const crewNote=pay.count>1?` · ${pay.count} paid`:'';
      shareLines.push(`✓ ${r.race_name} (${dateStr}) — €${pay.total} ${methods}`);
      html+=`
        <div ${clickAttr} style="display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)${clickable?';active:opacity:.7':''}">
          <div style="color:#4caf50;font-size:1.1rem;margin-top:1px;flex-shrink:0">✓</div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.race_name}</div>
            <div style="font-size:.78rem;color:var(--muted);margin-top:1px">${dateStr}${crewNote}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <div style="text-align:right">
              <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800;color:#4caf50">€${pay.total}</div>
              <div style="font-size:.73rem;color:var(--muted)">${methods}</div>
            </div>
            ${clickable?'<div style="color:var(--muted);font-size:.8rem">›</div>':''}
          </div>
        </div>`;
    } else {
      outstandingCount++;
      shareLines.push(`⚠ ${r.race_name} (${dateStr}) — no payment recorded`);
      html+=`
        <div ${clickAttr} style="display:flex;align-items:flex-start;gap:10px;padding:11px 0;border-bottom:1px solid var(--border)">
          <div style="color:#f59e0b;font-size:1.1rem;margin-top:1px;flex-shrink:0">⚠</div>
          <div style="flex:1;min-width:0">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:700;color:var(--white);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${r.race_name}</div>
            <div style="font-size:.78rem;color:var(--muted);margin-top:1px">${dateStr}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
            <div style="font-family:'Barlow Condensed',sans-serif;font-size:.9rem;font-weight:700;color:#f59e0b">Outstanding</div>
            ${clickable?'<div style="color:var(--muted);font-size:.8rem">›</div>':''}
          </div>
        </div>`;
    }
  }

  // Summary footer
  html+=`
    <div style="margin-top:14px;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.04);border:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:.85rem;color:var(--muted)">Total paid</span>
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800;color:#4caf50">€${totalPaid}</span>
      </div>
      <div style="display:flex;justify-content:space-between">
        <span style="font-size:.85rem;color:var(--muted)">Races outstanding</span>
        <span style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;font-weight:800;color:${outstandingCount?'#f59e0b':'#4caf50'}">${outstandingCount}</span>
      </div>
    </div>`;

  if(clickable){
    html+='<div style="font-size:.75rem;color:var(--muted);text-align:center;padding:10px 0 2px">Tap a race to open Race Fees</div>';
  }

  body.innerHTML=html;
  feeStmtShareText=`${club} — Race Fee Statement\nBoat: ${boat.name}\nGenerated: ${today}\n\n${shareLines.join('\n')}\n\nTotal paid: €${totalPaid} | Outstanding races: ${outstandingCount}`;
}

async function feeStmtOpenRace(key){
  // Find the race in allRaces by race_key
  const race=allRaces.find(r=>raceKey(r)===key);
  if(!race){toast('Race not found');return;}
  // Switch to that race
  selectedRace=race;
  const idx=allRaces.indexOf(race);
  const dd=document.getElementById('raceDropdown');
  if(dd) dd.value=idx;
  updateSkipperDash();
  // Close fee statement and open race fees
  closePanel('feeStatementPanel');
  await openRaceFeesPanel();
}

function shareFeeStatement(){
  if(!feeStmtShareText){toast('Nothing to share yet');return;}
  const boat=boats.find(b=>b.id===feeStmtBoatId)||{name:'Boat'};
  if(navigator.share){
    navigator.share({title:`${boat.name} Fee Statement`,text:feeStmtShareText}).catch(()=>{});
  } else {
    navigator.clipboard?.writeText(feeStmtShareText)
      .then(()=>toast('Statement copied to clipboard'))
      .catch(()=>toast('Copy not supported — try long-pressing the text'));
  }
}

// ═══════════════════════════════════════════════════════════════
// HALSAIL RESULTS
// ═══════════════════════════════════════════════════════════════
const HAL_URL='https://halsail.com/HalApi';
let HAL_CLUB=_C.halClub||0; // updated from DB settings in _applyDbClubConfig
// GBSC Halsail convention:
//   GetSchedule only ever returns ECHO entries (Class "Cru - E")
//   IRC is a tandem series — its SeryID is always echoId + 1
//   Both pull from GetSeriesResult; Halsail handles the different handicapping
function isEchoClass(name){ return /cru\s*-\s*e\b/i.test(name); }
function isCruiserClass(name){ return /cru\s*-/i.test(name); } // matches Cru-E, Cru-IRC, Cru-ORC etc.

let halSchedule=null;       // raw GetSchedule response
let halSeriesList=[];        // [{label, ircId, echoId}] — one per series name
let halCurrentFleet='irc';  // 'irc' | 'echo' — auto-set to whichever has data
let halCurrentSeries=null;  // currently selected {label, ircId, echoId}
let halResultsCache={};     // seriesId -> GetSeriesResult response (cleared on each panel open)
let halBoatCache={};        // BoatID -> {name, sailText, helm} (cleared on each panel open)

// Halsail fetch — tries direct first, falls back to Supabase proxy if CORS blocks it
const HAL_PROXY='/.netlify/functions/halsail-proxy'; // Netlify function proxy — avoids CORS on direct Halsail calls
let halUsesProxy=false;

async function halFetch(path){
  const url=(halUsesProxy?HAL_PROXY+'?path=':HAL_URL)+path;
  const opts=halUsesProxy?{}:{mode:'cors'};
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
  // Manual refresh button — just delegate to the standard load (which always fetches fresh now)
  await loadResultsIfNeeded();
}
async function loadResultsIfNeeded(){
  if(!HAL_CLUB){
    document.getElementById('resultSeriesSelect').innerHTML='<option value="">—</option>';
    const resultsUrl=(_C.resultsUrl||'').trim();
    document.getElementById('resultsContent').innerHTML= resultsUrl
      ? `<iframe src="${resultsUrl}" style="width:100%;height:calc(100vh - 200px);border:none;border-radius:10px;background:#fff"></iframe>`
      : `<div class="empty-state" style="padding:40px 20px">
          <div class="icon" style="font-size:2rem">🏆</div>
          <div style="font-weight:700;font-size:1.05rem;margin-bottom:8px">Results</div>
          <div style="font-size:.85rem;color:var(--muted);line-height:1.5">Results are published on the club website.</div>
        </div>`;
    return;
  }
  if(isResultsBlocked()){
    document.getElementById('resultSeriesSelect').innerHTML='<option value="">—</option>';
    document.getElementById('resultsContent').innerHTML=
      `<div class="empty-state" style="padding:40px 20px">
        <div class="icon" style="font-size:2rem">🏆</div>
        <div style="font-weight:700;font-size:1.05rem;margin-bottom:8px">Results not yet announced</div>
        <div style="font-size:.85rem;color:var(--muted);line-height:1.5">Tonight's results will be announced at the bar.<br>Check back shortly.</div>
      </div>`;
    return;
  }
  // Always fetch live from Halsail — no session cache so results are never stale.
  // Clear result/boat caches but preserve the user's current series selection.
  const prevSeriesLabel=halCurrentSeries?halCurrentSeries.label:null;
  halResultsCache={};
  halBoatCache={};
  halSeriesList=[];

  // Show eStela link if a tracking URL is currently set
  const elink=document.getElementById('resultEstellaLink');
  if(elink){const url=(clubSettings.estella_url||'').trim();if(url){elink.href=url;elink.style.display='flex';}else{elink.style.display='none';}}

  const wrap=document.getElementById('resultsContent');
  wrap.innerHTML='<div class="empty-state"><div class="icon" style="font-size:1.6rem">⏳</div><div>Loading GBSC results from Halsail…</div></div>';
  document.getElementById('resultSeriesSelect').innerHTML='<option value="">Loading…</option>';

  const schedule=await halFetch('/GetSchedule/'+HAL_CLUB);

  if(!schedule||schedule._err||!Array.isArray(schedule)){
    const errMsg=schedule&&schedule._err?schedule._err:'No data returned';

    wrap.innerHTML=`
      <div class="empty-state">
        <div class="icon">⚠</div>
        <div style="margin-bottom:10px">Could not reach Halsail<br><span style="font-size:.75rem;color:var(--muted)">${errMsg}</span></div>
        <button class="btn btn-ghost" style="padding:8px 16px" onclick="loadResultsIfNeeded()">Try Again</button>
      </div>`;
    return;
  }
  halSchedule=schedule;

  // Build series list from ECHO entries; IRC SeryID = echoId + 1 (Halsail tandem convention)
  const seriesMap={};
  schedule.forEach(r=>{
    if(!isEchoClass(r.Class)) return; // skip non-ECHO entries
    const key=r.Series;
    if(!seriesMap[key]) seriesMap[key]={label:key,ircId:null,echoId:null,firstStart:null};
    seriesMap[key].echoId=r.SeryID;
    seriesMap[key].ircId=r.SeryID+1; // IRC tandem series is always echoId + 1
    // Track earliest start for chronological ordering
    const d=new Date(r.Start);
    if(!seriesMap[key].firstStart||d<seriesMap[key].firstStart) seriesMap[key].firstStart=d;
  });

  // Sort chronologically by first race start
  halSeriesList=Object.values(seriesMap)
    .filter(s=>s.ircId||s.echoId)
    .sort((a,b)=>a.firstStart-b.firstStart);

  // Restore previous selection if still available; otherwise default to the next race's series
  const currentLabel=nextRace?nextRace.label.toLowerCase():'';
  let defaultIdx=prevSeriesLabel
    ?halSeriesList.findIndex(s=>s.label===prevSeriesLabel)
    :-1;
  if(defaultIdx<0) defaultIdx=halSeriesList.findIndex(s=>currentLabel.includes(s.label.toLowerCase()));
  if(defaultIdx<0) defaultIdx=0;

  // Populate selector
  const sel=document.getElementById('resultSeriesSelect');
  sel.innerHTML='';
  halSeriesList.forEach((s,i)=>{
    const o=document.createElement('option');
    o.value=i;
    o.textContent=s.label;
    if(i===defaultIdx) o.selected=true;
    sel.appendChild(o);
  });

  if(halSeriesList.length){
    halCurrentSeries=halSeriesList[defaultIdx];
    // Both IRC and ECHO always present; default to IRC
    halCurrentFleet='irc';
    showFleet(halCurrentFleet);
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

  // Fetch boat details for any BoatIDs not yet cached
  const boatIds=[...new Set((data.ResultsOverall||[]).map(b=>b.BoatID).filter(Boolean))];
  await Promise.all(boatIds.filter(id=>!halBoatCache[id]).map(async id=>{
    const b=await halFetch('/GetBoat/'+id);
    if(b&&!b._err) halBoatCache[id]={name:b.Name||'',sailText:b.SailText||'',helm:b.Helm||''};
  }));

  buildResultsTable(data, series.label, fleetLabel, wrap, seriesId);
}

function buildResultsTable(data, seriesLabel, fleetLabel, wrap, seriesId){
  const resultBoats=data.ResultsOverall||[];
  if(!resultBoats.length){ wrap.innerHTML='<div class="empty-state"><div class="icon">🏆</div><div>No results yet</div></div>'; return; }

  // Find my boat by matching current boat name against Halsail boat name (from GetBoat cache)
  const myBoatName=currentBoat&&!isRO?currentBoat.name.toLowerCase():'';
  const myResult=resultBoats.find(b=>{
    const boatData=halBoatCache[b.BoatID];
    if(boatData) return myBoatName&&boatData.name.toLowerCase()===myBoatName;
    // Fallback: helm name match
    return myBoatName&&(b.HelmOrGuestName||'').toLowerCase().includes(myBoatName.split(' ')[0]);
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

  // Race column headers — tappable to open that race on Halsail
  const raceHeaders=raceIds.map((rid,i)=>
    `<th class="num" style="min-width:32px;cursor:pointer;color:var(--teal)"
      onclick="window.open('https://halsail.com/Result/Race/${rid}','_blank')"
      title="View Race ${i+1} on Halsail">R${i+1}</th>`
  ).join('');

  function resolveBoatDisplay(halBoat){
    const boatData=halBoatCache[halBoat.BoatID];
    if(boatData&&boatData.name){
      return {
        primary: boatData.name,
        secondary: boatData.sailText||boatData.helm||null
      };
    }
    // Fallback if boat not in cache yet
    return {primary: halBoat.HelmOrGuestName||'—', secondary: null};
  }

  // Rows
  const rows=resultBoats.map((b,bi)=>{
    const rank=b.Rank||bi+1;
    const podiumClass=rank===1?'podium-1':rank===2?'podium-2':rank===3?'podium-3':'';
    const isMe=b===myResult;
    const display=resolveBoatDisplay(b);

    const nameCell=display.secondary
      ? `<div style="font-weight:600;line-height:1.2">${display.primary}</div>`+
        `<div style="font-size:.8rem;color:var(--muted)">${display.secondary}</div>`
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
    <div style="font-size:.8rem;color:var(--muted);margin-top:10px;text-align:center">
      Points in () are discards · Red = DNS/DNF/OCS
    </div>
    <div style="margin-top:14px;text-align:center">
      <button onclick="window.open('https://halsail.com/Result/Club/${HAL_CLUB}','_blank')"
        style="display:inline-flex;align-items:center;gap:6px;padding:9px 16px;
        border-radius:10px;background:transparent;border:1px solid rgba(0,174,239,.3);
        color:var(--teal);font-family:'Barlow Condensed',sans-serif;font-size:.88rem;
        font-weight:700;letter-spacing:.04em;cursor:pointer">
        Full results on Halsail ↗
      </button>
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
  let raw;
  if(hash.startsWith('#pay/')){
    // base64url: restore standard base64 chars and re-add padding
    const b64url=hash.slice(5);
    const b64=b64url.replace(/-/g,'+').replace(/_/g,'/');
    raw=b64+'=='.slice(0,(4-b64.length%4)%4);
  } else if(hash.startsWith('#pay=')){
    raw=hash.slice(5); // legacy format — backward compat
  } else return;
  try{
    const data=JSON.parse(decodeURIComponent(escape(atob(raw))));
    showCrewPayPage(data);
  }catch(e){ console.warn('Invalid pay hash',e); }
}
function showCrewPayPage(data){
  const overlay=document.createElement('div');
  overlay.style.cssText='position:fixed;inset:0;background:#0a1628;z-index:900;overflow-y:auto;'+
    'padding:24px 16px;font-family:Barlow,sans-serif;color:#f0f4f8;';
  document.body.appendChild(overlay);

  const memberLabel=t=>t==='full'?'Full Member':t==='crew'?'Crew Member':t==='student'?'Student':t==='kid'?'Junior':'Visitor';

  const pageHeader=`
    <div style="text-align:center;margin-bottom:24px;">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;font-weight:800;
        letter-spacing:.04em;color:#00b4d8;margin-bottom:2px">GBSC Racing</div>
      <div style="font-size:.85rem;color:#7a8fa6">${data.race} · ${data.boat}</div>
    </div>`;

  const footer=`<div style="text-align:center;font-size:.8rem;color:#4a5568;margin-top:24px">
    GBSC Racing App · Race fees collected on behalf of Galway Bay Sailing Club
  </div>`;

  // ── Step 1: Who are you? ───────────────────────────────────────
  function showStep1(){
    const crewBtns=data.crew.map((c,i)=>`
      <button onclick="window._cpStep2(${i})"
        style="display:flex;align-items:center;justify-content:space-between;width:100%;
        padding:16px 18px;background:#112240;border:1px solid rgba(0,180,216,.2);
        border-radius:14px;margin-bottom:10px;cursor:pointer;color:#f0f4f8;text-align:left;
        transition:background .15s;">
        <div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.15rem;font-weight:700;letter-spacing:.02em">${c.n}</div>
          <div style="font-size:.8rem;color:#7a8fa6;text-transform:uppercase;letter-spacing:.06em;margin-top:2px">${memberLabel(c.t)}</div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
          <span style="font-family:'Barlow Condensed',sans-serif;font-size:1.5rem;font-weight:800;color:#00b4d8">€${c.a}</span>
          <span style="font-size:1rem;color:#7a8fa6">›</span>
        </div>
      </button>`).join('');

    overlay.innerHTML=`
      <div style="max-width:420px;margin:0 auto;">
        ${pageHeader}
        <div style="margin-bottom:20px;">
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.25rem;font-weight:800;
            color:#f0f4f8;margin-bottom:4px">Race Fees Due</div>
          <div style="font-size:.85rem;color:#7a8fa6">Tap your name to pay your fee</div>
        </div>
        ${crewBtns}
        ${footer}
      </div>`;
  }

  // ── Step 2: Personal payment screen ───────────────────────────
  window._cpStep2=function(idx){
    const c=data.crew[idx];
    const revUrl=data.rev?`https://revolut.me/${data.rev}`:'';
    // Prefer clubSettings (loaded at startup); fall back to embedded stripeLinks for old shared URLs
    const sl=data.stripeLinks||{};
    const stripeUrl=getStripeLink(c.t)||(c.t==='student'?sl.student:c.t==='visitor'?sl.visitor:sl.member)||data.stripe||'';

    const revBtn=revUrl?`
      <a href="${revUrl}" target="_blank"
        style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;
        background:linear-gradient(135deg,#191c82,#6e40d8);color:white;border-radius:14px;
        padding:18px;text-decoration:none;font-family:'Barlow Condensed',sans-serif;
        margin-bottom:6px;box-shadow:0 4px 24px rgba(110,64,216,.4);">
        <span style="font-size:1.2rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase">💜 Open Revolut</span>
        <span style="font-size:.85rem;font-weight:400;opacity:.85">then enter <strong style="font-size:1rem;font-weight:800">€${c.a}</strong> as the amount</span>
      </a>
      <div style="text-align:center;font-size:.8rem;color:#a78bfa;margin-bottom:12px;letter-spacing:.02em">
        Send to <strong>@${data.rev}</strong>
      </div>`:'';

    const stripeBtn=stripeUrl?`
      <a href="${stripeUrl}" target="_blank"
        style="display:flex;align-items:center;justify-content:center;gap:10px;
        background:linear-gradient(135deg,#0d6efd,#0dcaf0);color:white;border-radius:14px;
        padding:18px;text-decoration:none;font-family:'Barlow Condensed',sans-serif;
        font-size:1.2rem;font-weight:800;letter-spacing:.04em;text-transform:uppercase;
        margin-bottom:12px;box-shadow:0 4px 24px rgba(13,110,253,.3);">
        💳 Pay €${c.a} by Card / Apple Pay / Google Pay
      </a>`:'';

    const noOptions=!revUrl&&!stripeUrl?`
      <div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
        border-radius:12px;padding:16px;text-align:center;font-size:.9rem;color:#7a8fa6;margin-bottom:12px;">
        Pay your skipper directly by cash or bank transfer
      </div>`:'';

    overlay.innerHTML=`
      <div style="max-width:420px;margin:0 auto;">
        ${pageHeader}
        <div style="background:#112240;border:1px solid rgba(0,180,216,.22);border-radius:16px;
          padding:24px 20px;margin-bottom:20px;text-align:center;">
          <div style="font-size:.78rem;color:#7a8fa6;font-weight:700;letter-spacing:.12em;
            text-transform:uppercase;margin-bottom:10px">Your Race Fee</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.2rem;font-weight:700;
            color:#f0f4f8;margin-bottom:8px">${c.n}</div>
          <div style="font-family:'Barlow Condensed',sans-serif;font-size:3.5rem;font-weight:800;
            color:#00b4d8;line-height:1;margin-bottom:6px">€${c.a}</div>
          <div style="font-size:.8rem;color:#7a8fa6;text-transform:uppercase;letter-spacing:.06em">${memberLabel(c.t)}</div>
        </div>
        ${revBtn}${stripeBtn}${noOptions}
        <button onclick="window._cpBack()"
          style="display:block;width:100%;padding:13px;background:transparent;
          border:1px solid rgba(255,255,255,.12);border-radius:10px;color:#7a8fa6;cursor:pointer;
          font-family:'Barlow Condensed',sans-serif;font-size:.95rem;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;">
          ← Back to crew list
        </button>
        ${footer}
      </div>`;
  };

  window._cpBack=function(){ showStep1(); };
  showStep1();
}
let _tt;
function toast(msg,ms=2600){const t=document.getElementById('toast');t.textContent=msg;t.classList.add('show');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('show'),ms);}
function showMarkCoords(name,lat,lng){
  function toDM(deg,pos,neg){
    const d=Math.floor(Math.abs(deg));
    const m=((Math.abs(deg)-d)*60).toFixed(3);
    return `${d}° ${m}' ${deg>=0?pos:neg}`;
  }
  toast(`📍 ${name}  ${toDM(lat,'N','S')}  ${toDM(lng,'E','W')}`,4500);
}
document.addEventListener('click',function(e){
  ['collectSheet','editSheet','pnSheet','shareSheet','settingsSheet','protestSheet','roClubSettingsSheet'].forEach(id=>{
    const el=document.getElementById(id);
    if(el&&el.classList.contains('open')&&e.target===el)closeSheet(id);
  });
});

// ═══════════════════════════════════════════════════════════════
// WIND WIDGET — Open-Meteo (no API key required)
// ═══════════════════════════════════════════════════════════════
// fetchOpenMeteo uses _C.windLat/_C.windLng (or GBSC_LAT/GBSC_LNG fallback) — see above

async function loadWindWidget(){
  try{
    // Use cached Open-Meteo data if fresh, otherwise fetch
    let wx=null;
    try{
      const c=JSON.parse(localStorage.getItem('__race_weather_v2__')||'null');
      if(c&&Date.now()-c.ts<3600000) wx=c.wx;
    }catch(e){}
    if(!wx) wx=await fetchOpenMeteo();

    if(!wx||!wx.hourly) throw new Error('No forecast data');

    const race=nextRace||getNextRace();
    const raceDate=race?race.date:new Date();
    const now=new Date();
    const isToday=raceDate.toDateString()===now.toDateString();
    const target=isToday?Math.max(now.getTime(),raceDate.getTime()):raceDate.getTime();
    const targetTs=Math.floor(target/1000);

    const times=wx.hourly.time;
    let idx=times.findIndex(t=>t>=targetTs);
    if(idx<0) idx=times.length-1;
    idx=Math.min(Math.max(idx,0),times.length-1);

    const spd=Math.round(wx.hourly.wind_speed_10m[idx]);
    const gust=Math.round(wx.hourly.wind_gusts_10m[idx]);
    const deg=Math.round(wx.hourly.wind_direction_10m[idx]);
    forecastWindDeg=deg;

    const dirs=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];
    const dir=dirs[Math.round(deg/22.5)%16];

    const startTime=new Date(times[idx]*1000).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
    const tag=isToday&&raceDate>now?'START':'FCST';

    document.getElementById('windArrow').innerHTML=
      `<svg width="32" height="32" viewBox="0 0 32 32" style="transform:rotate(${deg}deg);transition:transform .6s ease">
        <circle cx="16" cy="16" r="14" fill="rgba(0,174,239,.15)" stroke="rgba(0,174,239,.3)" stroke-width="1.5"/>
        <polygon points="16,4 20,22 16,19 12,22" fill="#00aeef"/>
        <circle cx="16" cy="16" r="3" fill="#00aeef"/>
      </svg>`;

    document.getElementById('windSpeed').textContent=spd+' kn';
    const gustEl=document.getElementById('windGust');
    if(gustEl) gustEl.textContent=gust>spd+5?`(gusts ${gust} kn)`:'';
    document.getElementById('windDir').textContent=`From ${dir} · ${deg}°`;
    const tl=document.getElementById('windTimeLabel'); if(tl) tl.textContent=tag;
    const tv=document.getElementById('windTimeVal'); if(tv) tv.textContent=startTime;

  }catch(e){
    document.getElementById('windDir').textContent='Wind data unavailable';
    console.warn('Wind widget error:',e);
  }
}

// ═══════════════════════════════════════════════════════════════
// MARKS MANAGER
// ═══════════════════════════════════════════════════════════════
async function loadMarks(){
  const rows=await sbFetch('/rest/v1/marks?order=sort_order.asc,name.asc');
  if(rows&&rows.length){
    MARKS=rows.map(r=>({
      id:r.id, name:r.name, lat:r.lat, lng:r.lng,
      colour:r.colour||'#f4a261', desc:r.description||'', active:r.active!==false
    }));
  }
  // If RO is logged in, refresh the marks grid and manager list
  if(isRO){
    buildMarksGrid();
    buildMarksMgrList();
  }
}
async function loadLines(){
  const rows=await sbFetch('/rest/v1/start_finish_lines?order=sort_order.asc,name.asc');
  if(rows&&rows.length){
    LINES=rows.map(r=>({
      id:r.id, name:r.name,
      lat1:r.lat1, lng1:r.lng1,
      lat2:r.lat2, lng2:r.lng2,
      isDefault:r.is_default||false,
      isActive:r.is_active!==false
    }));
  }
  if(isRO) buildLinesMgrList();
}

function buildMarksMgrList(){
  const list=document.getElementById('marksMgrList');
  if(!list)return;
  list.innerHTML='';
  MARKS.forEach(m=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;background:var(--navy);border-radius:10px;padding:9px 12px;';
    row.innerHTML=
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${m.colour};flex-shrink:0"></span>`+
      `<div style="flex:1;min-width:0;">`+
        `<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.9rem;${m.active?'':'opacity:.45'}">${m.name}</div>`+
        `<div style="font-size:.78rem;color:var(--muted)">${m.desc||''}</div>`+
      `</div>`+
      `<div style="display:flex;align-items:center;gap:5px">`+
        `<button onclick="toggleMarkActive('${m.id}')" style="font-size:.78rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;cursor:pointer;`+
        (m.active?'border:1px solid var(--border);background:transparent;color:var(--muted)':'border:1px solid var(--teal);background:transparent;color:var(--teal)')+`">`+
        (m.active?'Off':'On')+`</button>`+
        `<button onclick="openEditMark('${m.id}')" style="font-size:.78rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(0,174,239,.4);background:transparent;color:var(--teal);cursor:pointer">✏</button>`+
        `<button onclick="deleteMark('${m.id}')" style="font-size:.78rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(230,57,70,.4);background:transparent;color:#e63946;cursor:pointer">🗑</button>`+
      `</div>`;
    list.appendChild(row);
  });
}

async function toggleMarkActive(id){
  const m=MARKS.find(x=>x.id===id);
  if(!m)return;
  const newActive=!m.active;
  const r=await sbFetch('/rest/v1/marks?id=eq.'+id,{method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({active:newActive})});
  if(!r||r._err){toast('⚠ Could not update mark: '+(r&&r._err||'network error'));return;}
  m.active=newActive;
  buildMarksMgrList();
  buildMarksGrid(); // refresh course builder
  toast((newActive?'✅ '+m.name+' now in play':'⛔ '+m.name+' disabled'));
}

function showMarkAddForm(){
  document.getElementById('markAddForm').style.display='block';
  document.getElementById('markAddBtn').style.display='none';
  document.getElementById('mk-id').focus();
}
let editingMarkId=null;
function hideMarkAddForm(){
  document.getElementById('markAddForm').style.display='none';
  document.getElementById('markAddBtn').style.display='block';
  ['mk-id','mk-name','mk-lat-d','mk-lat-m','mk-lng-d','mk-lng-m','mk-desc'].forEach(id=>document.getElementById(id).value='');
  document.getElementById('mk-lat-h').value='N';
  document.getElementById('mk-lng-h').value='W';
  document.getElementById('mk-colour').value='#f4a261';
  document.getElementById('mk-id').readOnly=false;
  document.getElementById('markFormTitle').textContent='New Mark';
  document.getElementById('markFormSubmitBtn').textContent='Add Mark';
  editingMarkId=null;
}
function openEditMark(id){
  const m=MARKS.find(x=>x.id===id); if(!m)return;
  editingMarkId=id;
  document.getElementById('mk-id').value=m.id;
  document.getElementById('mk-id').readOnly=true; // ID is the primary key — don't allow changing
  document.getElementById('mk-name').value=m.name;
  function toDF(dec){return{d:Math.floor(Math.abs(dec)),m:((Math.abs(dec)-Math.floor(Math.abs(dec)))*60).toFixed(3)};}
  const latDM=toDF(m.lat), lngDM=toDF(m.lng);
  document.getElementById('mk-lat-d').value=latDM.d;
  document.getElementById('mk-lat-m').value=latDM.m;
  document.getElementById('mk-lat-h').value=m.lat>=0?'N':'S';
  document.getElementById('mk-lng-d').value=lngDM.d;
  document.getElementById('mk-lng-m').value=lngDM.m;
  document.getElementById('mk-lng-h').value=m.lng>=0?'E':'W';
  document.getElementById('mk-desc').value=m.desc||'';
  document.getElementById('mk-colour').value=m.colour||'#f4a261';
  document.getElementById('markFormTitle').textContent='Edit Mark';
  document.getElementById('markFormSubmitBtn').textContent='Save Changes';
  document.getElementById('markAddForm').style.display='block';
  document.getElementById('markAddBtn').style.display='none';
  document.getElementById('mk-name').focus();
}
async function deleteMark(id){
  const m=MARKS.find(x=>x.id===id); if(!m)return;
  if(!confirm('Delete '+m.name+'?\n\nThis cannot be undone.'))return;
  const r=await sbFetch('/rest/v1/marks?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});
  if(!r||r._err){toast('⚠ Could not delete mark: '+(r&&r._err||'network error'));return;}
  MARKS.splice(MARKS.indexOf(m),1);
  buildMarksMgrList();
  buildMarksGrid();
  toast('🗑 '+m.name+' deleted');
}

async function submitAddMark(){
  const id=document.getElementById('mk-id').value.trim().toUpperCase();
  const name=document.getElementById('mk-name').value.trim();
  const latD=parseFloat(document.getElementById('mk-lat-d').value);
  const latM=parseFloat(document.getElementById('mk-lat-m').value);
  const latH=document.getElementById('mk-lat-h').value;
  const lngD=parseFloat(document.getElementById('mk-lng-d').value);
  const lngM=parseFloat(document.getElementById('mk-lng-m').value);
  const lngH=document.getElementById('mk-lng-h').value;
  const desc=document.getElementById('mk-desc').value.trim();
  const colour=document.getElementById('mk-colour').value;

  if(!id||!name){toast('Enter an ID and name');return;}
  if(isNaN(latD)||isNaN(latM)||isNaN(lngD)||isNaN(lngM)){toast('Enter valid coordinates');return;}
  const lat=(latD+latM/60)*(latH==='S'?-1:1);
  const lng=(lngD+lngM/60)*(lngH==='W'?-1:1);

  if(editingMarkId){
    // Edit existing mark
    const r=await sbFetch('/rest/v1/marks?id=eq.'+editingMarkId,{method:'PATCH',
      headers:{...SBH,'Prefer':'return=minimal'},
      body:JSON.stringify({name,lat,lng,colour,description:desc})});
    if(!r||r._err){toast('⚠ Could not save changes: '+(r&&r._err||'network error'));return;}
    const m=MARKS.find(x=>x.id===editingMarkId);
    if(m){Object.assign(m,{name,lat,lng,colour,desc});}
    hideMarkAddForm();
    buildMarksMgrList();
    buildMarksGrid();
    toast('✅ '+name+' updated');
  } else {
    // Add new mark
    if(MARKS.find(m=>m.id===id)){toast('Mark ID already exists');return;}
    const r=await sbFetch('/rest/v1/marks',{method:'POST',
      headers:{...SBH,'Prefer':'return=minimal'},
      body:JSON.stringify({id,name,lat,lng,colour,description:desc,active:true,sort_order:99})});
    if(!r||r._err){toast('⚠ Could not save mark: '+(r&&r._err||'network error'));return;}
    // Reload marks from DB to confirm save and pick up server-generated fields
    await loadMarks();
    hideMarkAddForm();
    toast('✅ '+name+' added');
  }
}

// ── Lines Manager ──────────────────────────────────────────────────────────
function fmtDM(dec,isLat){
  const h=dec>=0?(isLat?'N':'E'):(isLat?'S':'W');
  const abs=Math.abs(dec);
  const d=Math.floor(abs);
  const m=((abs-d)*60).toFixed(3);
  return d+'°'+m+"'"+h;
}
function buildLinesMgrList(){
  const list=document.getElementById('linesMgrList');
  if(!list)return;
  list.innerHTML='';
  LINES.forEach(l=>{
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:10px;background:var(--navy);border-radius:10px;padding:9px 12px;';
    const inactive=l.isActive===false;
    row.innerHTML=
      `<div style="flex:1;min-width:0;">`+
        `<div style="font-family:'Barlow Condensed',sans-serif;font-weight:700;font-size:.9rem;${inactive?'opacity:.45':''}">${l.name}${l.isDefault?' ★':''}</div>`+
        `<div style="font-size:.65rem;color:var(--muted)">Pin: ${fmtDM(l.lat1,true)} ${fmtDM(l.lng1,false)}</div>`+
      `</div>`+
      `<div style="display:flex;align-items:center;gap:5px">`+
        `<button onclick="toggleLineActive('${l.id}')" style="font-size:.68rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;cursor:pointer;`+
        (!inactive?'border:1px solid var(--border);background:transparent;color:var(--muted)':'border:1px solid var(--teal);background:transparent;color:var(--teal)')+`">`+
        (!inactive?'Off':'On')+`</button>`+
        `<button onclick="openEditLine('${l.id}')" style="font-size:.68rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(0,174,239,.4);background:transparent;color:var(--teal);cursor:pointer">✏</button>`+
        `<button onclick="deleteLine('${l.id}')" ${l.isDefault?'disabled':''} style="font-size:.68rem;font-family:'Barlow Condensed',sans-serif;font-weight:700;padding:3px 8px;border-radius:6px;border:1px solid rgba(230,57,70,.4);background:transparent;color:#e63946;cursor:pointer;${l.isDefault?'opacity:.35;cursor:not-allowed':''}">🗑</button>`+
      `</div>`;
    list.appendChild(row);
  });
}
async function toggleLineActive(id){
  const l=LINES.find(x=>x.id===id); if(!l)return;
  const newActive=!l.isActive;
  const r=await sbFetch('/rest/v1/start_finish_lines?id=eq.'+id,{method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({is_active:newActive})});
  if(!r||r._err){toast('⚠ Could not update line');return;}
  l.isActive=newActive;
  buildLinesMgrList();
  populateLineSelects();
  toast((newActive?'✅ '+l.name+' active':'⛔ '+l.name+' disabled'));
}
function showLineAddForm(){
  document.getElementById('lineAddForm').style.display='block';
  document.getElementById('lineAddBtn').style.display='none';
}
let editingLineId=null;
function hideLineAddForm(){
  document.getElementById('lineAddForm').style.display='none';
  document.getElementById('lineAddBtn').style.display='block';
  ['ln-name','ln-lat1-d','ln-lat1-m','ln-lng1-d','ln-lng1-m','ln-lat2-d','ln-lat2-m','ln-lng2-d','ln-lng2-m'].forEach(fid=>document.getElementById(fid).value='');
  document.getElementById('ln-lat1-h').value='N';
  document.getElementById('ln-lng1-h').value='W';
  document.getElementById('ln-lat2-h').value='N';
  document.getElementById('ln-lng2-h').value='W';
  document.getElementById('lineFormTitle').textContent='New Line';
  document.getElementById('lineFormSubmitBtn').textContent='Add Line';
  editingLineId=null;
}
function openEditLine(id){
  const l=LINES.find(x=>x.id===id); if(!l)return;
  editingLineId=id;
  function toDF(dec){return{d:Math.floor(Math.abs(dec)),m:((Math.abs(dec)-Math.floor(Math.abs(dec)))*60).toFixed(4)};}
  document.getElementById('ln-name').value=l.name;
  const lat1DM=toDF(l.lat1), lng1DM=toDF(l.lng1);
  document.getElementById('ln-lat1-d').value=lat1DM.d;
  document.getElementById('ln-lat1-m').value=lat1DM.m;
  document.getElementById('ln-lat1-h').value=l.lat1>=0?'N':'S';
  document.getElementById('ln-lng1-d').value=lng1DM.d;
  document.getElementById('ln-lng1-m').value=lng1DM.m;
  document.getElementById('ln-lng1-h').value=l.lng1>=0?'E':'W';
  const lat2DM=toDF(l.lat2), lng2DM=toDF(l.lng2);
  document.getElementById('ln-lat2-d').value=lat2DM.d;
  document.getElementById('ln-lat2-m').value=lat2DM.m;
  document.getElementById('ln-lat2-h').value=l.lat2>=0?'N':'S';
  document.getElementById('ln-lng2-d').value=lng2DM.d;
  document.getElementById('ln-lng2-m').value=lng2DM.m;
  document.getElementById('ln-lng2-h').value=l.lng2>=0?'E':'W';
  document.getElementById('lineFormTitle').textContent='Edit Line';
  document.getElementById('lineFormSubmitBtn').textContent='Save Changes';
  document.getElementById('lineAddForm').style.display='block';
  document.getElementById('lineAddBtn').style.display='none';
  document.getElementById('ln-name').focus();
}
async function deleteLine(id){
  const l=LINES.find(x=>x.id===id); if(!l)return;
  if(l.isDefault){toast('Cannot delete the default club line');return;}
  if(!confirm('Delete "'+l.name+'"?\n\nThis cannot be undone.'))return;
  const r=await sbFetch('/rest/v1/start_finish_lines?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=minimal'}});
  if(!r||r._err){toast('⚠ Could not delete: '+(r&&r._err||'network error'));return;}
  LINES.splice(LINES.indexOf(l),1);
  buildLinesMgrList();
  populateLineSelects();
  toast('🗑 '+l.name+' deleted');
}
async function submitAddLine(){
  const name=document.getElementById('ln-name').value.trim();
  const lat1D=parseFloat(document.getElementById('ln-lat1-d').value);
  const lat1M=parseFloat(document.getElementById('ln-lat1-m').value);
  const lat1H=document.getElementById('ln-lat1-h').value;
  const lng1D=parseFloat(document.getElementById('ln-lng1-d').value);
  const lng1M=parseFloat(document.getElementById('ln-lng1-m').value);
  const lng1H=document.getElementById('ln-lng1-h').value;
  const lat2D=parseFloat(document.getElementById('ln-lat2-d').value);
  const lat2M=parseFloat(document.getElementById('ln-lat2-m').value);
  const lat2H=document.getElementById('ln-lat2-h').value;
  const lng2D=parseFloat(document.getElementById('ln-lng2-d').value);
  const lng2M=parseFloat(document.getElementById('ln-lng2-m').value);
  const lng2H=document.getElementById('ln-lng2-h').value;

  if(!name){toast('Enter a line name');return;}
  if(isNaN(lat1D)||isNaN(lat1M)||isNaN(lng1D)||isNaN(lng1M)||
     isNaN(lat2D)||isNaN(lat2M)||isNaN(lng2D)||isNaN(lng2M)){
    toast('Enter valid coordinates for both endpoints');return;
  }
  const lat1=(lat1D+lat1M/60)*(lat1H==='S'?-1:1);
  const lng1=(lng1D+lng1M/60)*(lng1H==='W'?-1:1);
  const lat2=(lat2D+lat2M/60)*(lat2H==='S'?-1:1);
  const lng2=(lng2D+lng2M/60)*(lng2H==='W'?-1:1);

  if(editingLineId){
    const r=await sbFetch('/rest/v1/start_finish_lines?id=eq.'+editingLineId,{method:'PATCH',
      headers:{...SBH,'Prefer':'return=minimal'},
      body:JSON.stringify({name,lat1,lng1,lat2,lng2})});
    if(!r||r._err){toast('⚠ Could not save changes: '+(r&&r._err||'network error'));return;}
    const l=LINES.find(x=>x.id===editingLineId);
    if(l){Object.assign(l,{name,lat1,lng1,lat2,lng2});}
    hideLineAddForm();
    buildLinesMgrList();
    populateLineSelects();
    toast('✅ '+name+' updated');
  } else {
    const newId=name.toLowerCase().replace(/\s+/g,'_').replace(/[^a-z0-9_]/g,'').substring(0,40);
    const r=await sbFetch('/rest/v1/start_finish_lines',{method:'POST',
      headers:{...SBH,'Prefer':'resolution=ignore-duplicates,return=minimal'},
      body:JSON.stringify({id:newId,name,lat1,lng1,lat2,lng2,is_default:false,is_active:true,sort_order:99})});
    if(!r||r._err){toast('⚠ Could not save line: '+(r&&r._err||'network error'));return;}
    LINES.push({id:newId,name,lat1,lng1,lat2,lng2,isDefault:false,isActive:true});
    hideLineAddForm();
    buildLinesMgrList();
    populateLineSelects();
    toast('✅ '+name+' added');
  }
}

// ═══════════════════════════════════════════════════════════════
// PROTESTS
// ═══════════════════════════════════════════════════════════════
async function checkForProtestsAgainstMe(){
  const notice=document.getElementById('protestNotice');
  const body=document.getElementById('myProtestBody');
  if(!notice||!currentBoat) return;
  notice.style.display='none';

  // Query all active protests where this boat is the protestee —
  // no race filter: a protest stands until the RO reaches a decision (any outcome clears it)
  const r=await sbFetch('/rest/v1/protests?protestee_id=eq.'+encodeURIComponent(currentBoat.id)
    +'&status=in.(Pending,Hearing Scheduled)'
    +'&order=filed_at.desc');
  if(!r||r._err||!r.length) return;

  const p=r[0]; // Show most recent protest if multiple
  const protestor=boats.find(b=>b.id===p.protestor_id);
  const filedTime=new Date(p.filed_at).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  const filedDate=new Date(p.filed_at).toLocaleDateString('en-IE',{day:'numeric',month:'short'});
  const rules=(p.rules_broken||[]).join(', ')||'Not specified';

  // Show the banner
  const detail=document.getElementById('protestNoticeDetail');
  if(detail) detail.textContent=(protestor?protestor.name:'Another boat')+' · '+p.race_name+' · '+filedDate;
  notice.style.display='flex';

  // Populate the detail panel
  if(body) body.innerHTML=`
    <div style="background:rgba(220,38,38,.1);border:1px solid rgba(220,38,38,.3);
      border-radius:12px;padding:16px;margin-bottom:16px">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:.75rem;font-weight:700;
        letter-spacing:.12em;text-transform:uppercase;color:#f87171;margin-bottom:6px">Protestor</div>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.4rem;font-weight:800;
        color:var(--white)">${protestor?protestor.name:'Unknown boat'}</div>
      <div style="font-size:.82rem;color:var(--muted);margin-top:2px">Filed ${filedDate} at ${filedTime}</div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;
          letter-spacing:.1em;font-weight:700;margin-bottom:4px">Race</div>
        <div style="font-size:.9rem;color:var(--white);font-weight:600">${p.race_name}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;
          letter-spacing:.1em;font-weight:700;margin-bottom:4px">Status</div>
        <div style="font-size:.9rem;font-weight:700;color:${p.status==='Pending'?'#f87171':p.status==='Upheld'?'var(--warn)':'var(--teal)'}">${p.status}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;
          letter-spacing:.1em;font-weight:700;margin-bottom:4px">Where</div>
        <div style="font-size:.9rem;color:var(--white)">${p.incident_where||'—'}</div>
      </div>
      <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px">
        <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;
          letter-spacing:.1em;font-weight:700;margin-bottom:4px">Time</div>
        <div style="font-size:.9rem;color:var(--white)">${p.incident_time||'—'}</div>
      </div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;
      padding:14px;margin-bottom:12px">
      <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;
        letter-spacing:.1em;font-weight:700;margin-bottom:6px">Rules Alleged</div>
      <div style="font-size:.9rem;color:var(--white);font-weight:600">${rules}</div>
    </div>

    <div style="background:var(--card);border:1px solid var(--border);border-radius:10px;
      padding:14px;margin-bottom:16px">
      <div style="font-size:.72rem;color:var(--muted);text-transform:uppercase;
        letter-spacing:.1em;font-weight:700;margin-bottom:6px">Description</div>
      <div style="font-size:.9rem;color:var(--white);line-height:1.5">${p.description||'—'}</div>
    </div>

    <div style="background:rgba(0,174,239,.08);border:1px solid rgba(0,174,239,.2);
      border-radius:10px;padding:14px;margin-bottom:16px">
      <div style="font-size:.78rem;color:var(--teal);font-weight:700;margin-bottom:6px">
        Your rights under RRS Rule 63</div>
      <div style="font-size:.82rem;color:var(--muted);line-height:1.5">
        You are entitled to be present throughout the hearing, to hear all evidence,
        and to call witnesses. Contact the Race Officer to confirm the hearing time and location.
      </div>
    </div>

    ${r.length>1?`<div style="font-size:.78rem;color:var(--muted);text-align:center;padding:4px">
      ${r.length} protests filed against you for this race</div>`:''}
  `;
}

async function sbSaveProtest(p){
  return sbFetch('/rest/v1/protests',{method:'POST',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify(p)});
}
async function sbLoadProtests(raceName){
  const filter=raceName?'race_name=eq.'+encodeURIComponent(raceName)+'&':'';
  const r=await sbFetch('/rest/v1/protests?'+filter+'order=filed_at.desc');
  return r||[];
}
async function sbDeleteProtest(id){
  // Use return=representation so Supabase returns the deleted row.
  // If the array is empty, RLS silently blocked the delete (still 204).
  return sbFetch('/rest/v1/protests?id=eq.'+id,{method:'DELETE',headers:{...SBH,'Prefer':'return=representation'}});
}
async function sbUpdateProtest(id,fields){
  return sbFetch('/rest/v1/protests?id=eq.'+id,{method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify(fields)});
}

// ── Session logging ──────────────────────────────────────────────
async function sbStartSession(type, boatId, boatName){
  const r=await sbFetch('/rest/v1/session_logs',{method:'POST',
    headers:{...SBH,'Prefer':'return=representation'},
    body:JSON.stringify({session_type:type,boat_id:boatId||null,boat_name:boatName||null})});
  return Array.isArray(r)&&r.length?r[0].id:null;
}
async function sbEndSession(sessionId){
  if(!sessionId)return;
  return sbFetch('/rest/v1/session_logs?id=eq.'+sessionId,{method:'PATCH',
    headers:{...SBH,'Prefer':'return=minimal'},
    body:JSON.stringify({logged_out_at:new Date().toISOString()})});
}
async function sbLoadSessionStats(){
  // All sessions, newest first, capped at 500 for stats
  return sbFetch('/rest/v1/session_logs?order=logged_in_at.desc&limit=500');
}

const PROTEST_STATUSES=['Pending','Hearing Scheduled','Upheld','Dismissed','Withdrawn'];

const RRS_RULES={
  'Rule 10':  'On Opposite Tacks — a port-tack boat shall keep clear of a starboard-tack boat.',
  'Rule 11':  'On the Same Tack, Overlapping — when boats are on the same tack and overlapping, a windward boat shall keep clear of a leeward boat.',
  'Rule 12':  'On the Same Tack, Not Overlapping — when boats are on the same tack and not overlapping, a boat clear astern shall keep clear of a boat clear ahead.',
  'Rule 13':  'While Tacking — after a boat passes head to wind, she shall keep clear of other boats until she is on a close-hauled course.',
  'Rule 14':  'Avoiding Contact — a boat shall avoid contact with another boat if reasonably possible.',
  'Rule 15':  'Acquiring Right of Way — when a boat acquires right of way, she shall initially give the other boat room to keep clear.',
  'Rule 16':  'Changing Course — when a right-of-way boat changes course, she shall give the other boat room to keep clear.',
  'Rule 17':  'On the Same Tack; Proper Course — if a boat clear astern becomes overlapped within two of her hull lengths to leeward, she shall not sail above her proper course.',
  'Rule 18':  'Mark-Room — when boats are required to leave a mark on the same side and the first of them reaches the zone, room shall be given to a boat on the inside.',
  'Rule 19':  'Room to Pass an Obstruction — a right-of-way boat may choose the side on which to pass an obstruction; the give-way boat shall keep clear.',
  'Rule 20':  'Room to Tack at an Obstruction — a boat may hail for room to tack when approaching an obstruction.',
  'Rule 21':  'Exoneration: a boat is exonerated if compelled to break a rule by another vessel.',
  'Rule 31':  'Touching a Mark — while racing, a boat shall not touch a starting mark before starting, a mark that begins, bounds or ends the leg of the course, or a finishing mark after finishing.',
  'Rule 42':  'Propulsion — a boat shall compete using only the wind and water to increase, maintain or decrease her speed.',
  'Rule 44':  'Penalties at the Time of an Incident — a boat that may have broken a rule shall take a penalty.',
};

let _loadedProtests=[];

async function printProtest(protestId){
  let p=_loadedProtests.find(x=>String(x.id)===String(protestId));
  if(!p){
    const rows=await sbFetch('/rest/v1/protests?id=eq.'+encodeURIComponent(protestId));
    p=rows&&rows[0];
  }
  if(!p){toast('Protest not found');return;}
  const protestor=boats.find(b=>b.id===p.protestor_id);
  const protestee=boats.find(b=>b.id===p.protestee_id);
  const filedAt=new Date(p.filed_at).toLocaleString('en-IE',{weekday:'long',day:'numeric',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const rules=(p.rules_broken||[]);
  const ruleRows=rules.map(r=>{
    const desc=RRS_RULES[r]||'';
    return `<tr><td style="font-weight:700;white-space:nowrap;padding:5px 10px 5px 0;vertical-align:top;color:#1B3E93">${r}</td><td style="padding:5px 0 5px 10px;color:#333;line-height:1.5">${desc}</td></tr>`;
  }).join('');

  const statusColour={
    'Pending':'#c0392b','Hearing Scheduled':'#e67e22',
    'Upheld':'#1B3E93','Dismissed':'#27ae60','Withdrawn':'#888'
  }[p.status]||'#333';

  const html=`<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<title>Protest — ${p.race_name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Barlow:wght@400;500;600&display=swap');
  *{box-sizing:border-box;margin:0;padding:0;}
  body{font-family:'Barlow',sans-serif;color:#1a1a2e;padding:32px;max-width:780px;margin:0 auto;font-size:13px;line-height:1.5;}
  h1{font-family:'Barlow Condensed',sans-serif;font-size:1.8rem;font-weight:800;color:#1B3E93;letter-spacing:.04em;text-transform:uppercase;}
  .section{margin-bottom:20px;border:1px solid #dde4f0;border-radius:6px;overflow:hidden;}
  .section-head{background:#1B3E93;color:#fff;font-family:'Barlow Condensed',sans-serif;font-size:.78rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;padding:6px 12px;}
  .section-body{padding:12px;}
  .field{margin-bottom:10px;}
  .field-label{font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#666;margin-bottom:2px;}
  .field-value{font-size:.95rem;color:#1a1a2e;}
  .two-col{display:grid;grid-template-columns:1fr 1fr;gap:16px;}
  .three-col{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;}
  .status-badge{display:inline-block;padding:3px 12px;border-radius:20px;font-weight:700;font-family:'Barlow Condensed',sans-serif;font-size:.9rem;color:${statusColour};border:2px solid ${statusColour};letter-spacing:.04em;}
  .rrs-ref{font-size:.78rem;color:#555;font-style:italic;margin-top:12px;padding-top:10px;border-top:1px solid #e0e8f5;}
  .check{color:#1B3E93;font-weight:700;}
  .cross{color:#c0392b;font-weight:700;}
  .footer{margin-top:28px;padding-top:14px;border-top:2px solid #1B3E93;display:flex;justify-content:space-between;font-size:.75rem;color:#888;}
  .sig-block{margin-top:28px;display:grid;grid-template-columns:1fr 1fr;gap:32px;}
  .sig-line{border-top:1px solid #333;margin-top:36px;padding-top:4px;font-size:.75rem;color:#666;}
  @media print{body{padding:16px;}@page{margin:15mm;size:A4;}button{display:none;}}
</style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
    <div>
      <h1>Protest Form</h1>
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1rem;color:#555;margin-top:2px">
        Racing Rules of Sailing 2025–2028 · World Sailing
      </div>
    </div>
    <div style="text-align:right">
      <div style="font-family:'Barlow Condensed',sans-serif;font-size:1.1rem;font-weight:700;color:#1B3E93">GBSC Racing</div>
      <div style="font-size:.8rem;color:#888;margin-top:2px">Generated ${new Date().toLocaleString('en-IE')}</div>
      <button onclick="window.print()" style="margin-top:8px;padding:6px 16px;background:#1B3E93;color:#fff;border:none;border-radius:4px;font-family:'Barlow Condensed',sans-serif;font-size:.85rem;font-weight:700;cursor:pointer;letter-spacing:.04em">🖨 Print / Save PDF</button>
    </div>
  </div>

  <!-- Race & Filing Info -->
  <div class="section">
    <div class="section-head">Race &amp; Filing Details</div>
    <div class="section-body three-col">
      <div class="field"><div class="field-label">Race</div><div class="field-value">${p.race_name}</div></div>
      <div class="field"><div class="field-label">Date / Time Filed</div><div class="field-value">${filedAt}</div></div>
      <div class="field"><div class="field-label">Status</div><div class="field-value"><span class="status-badge">${p.status}</span></div></div>
    </div>
  </div>

  <!-- Parties -->
  <div class="section">
    <div class="section-head">Parties to the Protest</div>
    <div class="section-body two-col">
      <div class="field"><div class="field-label">Protestor (Boat Filing Protest)</div><div class="field-value" style="font-size:1.1rem;font-weight:700">${protestor?protestor.name:'Unknown'}</div></div>
      <div class="field"><div class="field-label">Protestee (Boat Protested Against)</div><div class="field-value" style="font-size:1.1rem;font-weight:700;color:#c0392b">${protestee?protestee.name:'Unknown'}</div></div>
    </div>
  </div>

  <!-- Incident -->
  <div class="section">
    <div class="section-head">Incident Details (RRS Rule 61.2)</div>
    <div class="section-body">
      <div class="two-col" style="margin-bottom:12px">
        <div class="field"><div class="field-label">Where did the incident occur?</div><div class="field-value">${p.incident_where}</div></div>
        <div class="field"><div class="field-label">Approximate time</div><div class="field-value">${p.incident_time}</div></div>
      </div>
      <div class="field"><div class="field-label">Description of incident</div>
        <div class="field-value" style="background:#f5f8ff;border:1px solid #dde4f0;border-radius:4px;padding:10px;white-space:pre-wrap;line-height:1.6">${p.description}</div>
      </div>
    </div>
  </div>

  <!-- Protest requirements -->
  <div class="section">
    <div class="section-head">Protest Requirements (RRS Rule 61.1)</div>
    <div class="section-body two-col">
      <div class="field">
        <div class="field-label">Red Flag Displayed</div>
        <div class="field-value">${p.flag_displayed?'<span class="check">✔ Yes — flag displayed at first reasonable opportunity</span>':'<span class="cross">✘ No flag displayed</span>'}</div>
      </div>
      <div class="field">
        <div class="field-label">Protest Hailed</div>
        <div class="field-value">${p.protest_hailed?'<span class="check">✔ Yes — "Protest" hailed at first reasonable opportunity</span>':'<span class="cross">✘ Not hailed</span>'}</div>
      </div>
    </div>
    <div class="rrs-ref">RRS Rule 61.1(a): A boat intending to protest shall hail "Protest" at the first reasonable opportunity and display a red flag at the first reasonable opportunity.</div>
  </div>

  <!-- Rules alleged broken -->
  <div class="section">
    <div class="section-head">Rules Alleged to Have Been Broken</div>
    <div class="section-body">
      ${rules.length?`<table style="width:100%;border-collapse:collapse">${ruleRows}</table>`:'<div style="color:#888;font-style:italic">No rules specified</div>'}
      <div class="rrs-ref">Racing Rules of Sailing 2025–2028, World Sailing. The hearing committee will determine which rules, if any, were broken (RRS Rule 64).</div>
    </div>
  </div>

  ${p.ro_notes?`
  <!-- RO Decision -->
  <div class="section">
    <div class="section-head">Race Committee Decision (RRS Rules 63–65)</div>
    <div class="section-body">
      <div class="field"><div class="field-label">Decision</div><div class="field-value"><span class="status-badge">${p.status}</span></div></div>
      <div class="field" style="margin-top:10px"><div class="field-label">Race Officer Notes</div>
        <div class="field-value" style="background:#f5f8ff;border:1px solid #dde4f0;border-radius:4px;padding:10px;white-space:pre-wrap;line-height:1.6">${p.ro_notes}</div>
      </div>
      <div class="rrs-ref">RRS Rule 64: The protest committee shall decide whether a boat that is party to a protest hearing has broken a rule. RRS Rule 65: After a hearing the protest committee shall inform all parties of the decision.</div>
    </div>
  </div>`:''}

  <!-- Signature blocks -->
  <div class="sig-block">
    <div>
      <div style="font-size:.8rem;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.06em">Protestor Signature</div>
      <div class="sig-line">${protestor?protestor.name:''}</div>
    </div>
    <div>
      <div style="font-size:.8rem;font-weight:700;color:#666;text-transform:uppercase;letter-spacing:.06em">Race Officer Signature</div>
      <div class="sig-line">Race Officer</div>
    </div>
  </div>

  <div class="footer">
    <span>GBSC Racing App · Protest #${p.id}</span>
    <span>Racing Rules of Sailing 2025–2028 · World Sailing</span>
  </div>
</body></html>`;

  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url; a.target='_blank'; a.rel='noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),5000);
}

function openProtestSheet(){
  if(!selectedRace){toast('Select a race first');return;}
  const sel=document.getElementById('pr-protestee');
  sel.innerHTML='<option value="">Select boat…</option>';
  boats.filter(b=>b.id!==currentBoat.id).forEach(b=>{
    const o=document.createElement('option');
    o.value=b.id; o.textContent=b.name;
    sel.appendChild(o);
  });
  document.getElementById('pr-where').value='';
  document.getElementById('pr-time').value=new Date().toTimeString().slice(0,5);
  document.getElementById('pr-description').value='';
  document.querySelectorAll('.pr-rule-btn').forEach(b=>b.classList.remove('active'));
  ['pr-flag','pr-hail'].forEach(id=>{
    document.getElementById(id).style.borderColor='';
    document.getElementById(id).style.background='var(--navy)';
    document.getElementById(id+'-check').innerHTML='';
    document.getElementById(id+'-check').style.borderColor='var(--muted)';
    document.getElementById(id+'-check').style.background='';
  });
  document.getElementById('protestSheet').classList.add('open');
}

function toggleProtest(id){
  const el=document.getElementById(id);
  const check=document.getElementById(id+'-check');
  const active=el.dataset.active==='1';
  el.dataset.active=active?'0':'1';
  if(!active){
    el.style.borderColor='var(--success)';
    el.style.background='rgba(45,198,83,.08)';
    check.innerHTML='<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#2dc653" stroke-width="2.5" stroke-linecap="round"><polyline points="2,6 5,9 10,3"/></svg>';
    check.style.borderColor='var(--success)';
    check.style.background='rgba(45,198,83,.15)';
  } else {
    el.style.borderColor='';
    el.style.background='var(--navy)';
    check.innerHTML='';
    check.style.borderColor='var(--muted)';
    check.style.background='';
  }
}

function toggleRule(btn,rule){
  btn.classList.toggle('active');
}

async function submitProtest(){
  const protesteeId=document.getElementById('pr-protestee').value;
  const where=document.getElementById('pr-where').value.trim();
  const time=document.getElementById('pr-time').value;
  const description=document.getElementById('pr-description').value.trim();
  const flagDisplayed=document.getElementById('pr-flag').dataset.active==='1';
  const protestHailed=document.getElementById('pr-hail').dataset.active==='1';
  const rulesBroken=Array.from(document.querySelectorAll('.pr-rule-btn.active')).map(b=>b.textContent.trim());

  if(!protesteeId){toast('Select the boat you are protesting');return;}
  if(!where){toast('Enter where the incident occurred');return;}
  if(!description){toast('Describe what happened');return;}
  if(rulesBroken.length===0){toast('Select at least one rule');return;}

  const result=await sbSaveProtest({
    race_name:selectedRace.label,
    race_date:selectedRace.date.toISOString().split('T')[0],
    protestor_id:currentBoat.id,
    protestee_id:protesteeId,
    incident_where:where,
    incident_time:time,
    flag_displayed:flagDisplayed,
    protest_hailed:protestHailed,
    rules_broken:rulesBroken,
    description,
    status:'Pending'
  });

  if(result&&result._err){
    toast('⚠ Could not file protest — '+result._err.slice(0,60));
    return;
  }
  closeSheet('protestSheet');
  toast('🚩 Protest filed successfully');
}

async function loadProtests(){
  const list=document.getElementById('protestList');
  if(!list)return;
  list.innerHTML='<div style="color:var(--muted);font-size:.82rem;padding:8px">Loading…</div>';

  // RO sees all protests across all races; skipper sees only their current race
  const protests=await sbLoadProtests(isRO?null:nextRace?.label);
  if(!protests.length){
    list.innerHTML='<div class="empty-state" style="padding:16px"><div class="icon">🚩</div><div>'+(isRO?'No protests filed yet':'No protests filed for this race')+'</div></div>';
    roDashProtestsCount=0;
    updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
    return;
  }

  roDashProtestsCount=protests.length;
  updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
  _loadedProtests=protests;
  list.innerHTML=protests.map(p=>{
    const protestor=boats.find(b=>b.id===p.protestor_id);
    const protestee=boats.find(b=>b.id===p.protestee_id);
    const filedAt=new Date(p.filed_at).toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
    const filedDate=new Date(p.filed_at).toLocaleDateString('en-IE',{day:'numeric',month:'short'});
    const rules=(p.rules_broken||[]).join(', ');
    const statusOpts=PROTEST_STATUSES.map(s=>
      `<option value="${s}"${p.status===s?' selected':''}>${s}</option>`).join('');
    return`<div class="protest-card status-${p.status.toLowerCase().replace(' ','-')}" data-protest-id="${p.id}">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div>
          <span style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:.95rem">${protestor?protestor.name:'Unknown'}</span>
          <span style="color:var(--muted);font-size:.8rem"> → </span>
          <span style="font-family:'Barlow Condensed',sans-serif;font-weight:800;font-size:.95rem;color:var(--danger)">${protestee?protestee.name:'Unknown'}</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          <span class="protest-status ${p.status}">${p.status}</span>
          <button onclick="printProtest('${p.id}')" title="Print / PDF"
            style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);
            font-size:.8rem;padding:3px 7px;cursor:pointer;line-height:1">🖨</button>
          <button onclick="deleteProtest('${p.id}')" title="Delete protest"
            style="background:transparent;border:1px solid var(--border);border-radius:6px;color:var(--muted);
            font-size:.8rem;padding:3px 7px;cursor:pointer;line-height:1">🗑</button>
        </div>
      </div>
      ${isRO?`<div style="font-size:.75rem;color:var(--teal);font-weight:700;margin-bottom:6px">${p.race_name} · ${filedDate}</div>`:''}
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">📍 ${p.incident_where} · ⏱ ${p.incident_time} · Filed ${filedAt}</div>
      <div style="font-size:.78rem;color:var(--muted);margin-bottom:6px">${p.flag_displayed?'🚩 Flag displayed':'⚠ No flag'} · ${p.protest_hailed?'📣 Hailed':'⚠ Not hailed'}</div>
      <div style="font-size:.78rem;color:var(--teal);margin-bottom:8px">${rules}</div>
      <div style="font-size:.82rem;color:var(--white);margin-bottom:12px;line-height:1.4">${p.description}</div>
      <div style="border-top:1px solid var(--border);padding-top:10px">
        <div style="font-size:.78rem;color:var(--muted);font-weight:600;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">RO Decision</div>
        <select onchange="updateProtestStatus('${p.id}',this.value)"
          style="width:100%;background:var(--navy-input);border:1px solid var(--border);border-radius:8px;
          color:var(--white);font-family:'Barlow Condensed',sans-serif;font-size:.88rem;font-weight:700;
          padding:7px 10px;outline:none;margin-bottom:8px">${statusOpts}</select>
        <textarea placeholder="RO notes…" onchange="updateProtestNotes('${p.id}',this.value)"
          style="width:100%;background:var(--navy-input);border:1px solid var(--border);border-radius:8px;
          color:var(--white);font-family:'Barlow',sans-serif;font-size:.82rem;padding:8px 10px;
          outline:none;box-sizing:border-box;resize:none;height:56px;line-height:1.4"
          >${p.ro_notes||''}</textarea>
      </div>
    </div>`;
  }).join('');
}

async function updateProtestStatus(id,status){
  const r=await sbUpdateProtest(id,{status});
  if(r===null){ toast('⚠ Could not update status'); return; }
  toast('✅ Status updated');
  // Immediately update the card in the DOM
  const card=document.querySelector(`.protest-card[data-protest-id="${id}"]`);
  if(card){
    card.className=card.className.replace(/status-\S+/,`status-${status.toLowerCase().replace(/ /g,'-')}`);
    const badge=card.querySelector('.protest-status');
    if(badge){ badge.className=`protest-status ${status}`; badge.textContent=status; }
  }
}
async function updateProtestNotes(id,notes){
  await sbUpdateProtest(id,{ro_notes:notes});
}
async function deleteProtest(id){
  if(!confirm('Delete this protest? This cannot be undone.'))return;
  const r=await sbDeleteProtest(id);
  if(!r||r._err){ toast('⚠ Could not delete protest'+(r&&r._err?': '+r._err.slice(0,50):'')); return; }
  // r is the array of deleted rows — if empty, RLS silently blocked the delete
  if(Array.isArray(r)&&r.length===0){ toast('⚠ Delete blocked — check RLS policy on protests table'); return; }
  // Remove card from DOM immediately
  const card=document.querySelector(`.protest-card[data-protest-id="${id}"]`);
  if(card) card.remove();
  roDashProtestsCount=Math.max(0,roDashProtestsCount-1);
  updateROChips(roDashRegsCount,roDashProtestsCount,roDashCoursePublished);
  const list=document.getElementById('protestList');
  if(list&&!list.querySelector('.protest-card')){
    list.innerHTML='<div class="empty-state" style="padding:16px"><div class="icon">🚩</div><div>No protests filed for this race</div></div>';
  }
  toast('Protest deleted');
}

// ═══════════════════════════════════════════════════════════════
// BACK BUTTON — keep Android hardware/gesture back inside the app
// ═══════════════════════════════════════════════════════════════
(function(){
  const SKIP_IDS = new Set(['pinOverlay','changePinOverlay']);
  let _depth = 0;

  // Baseline entry — the very first back press fires popstate instead of exiting
  history.pushState({gbsc:_depth}, '');

  // Push a history entry each time a panel or sheet opens, so each
  // back press maps 1:1 to closing one layer of UI.
  const obs = new MutationObserver(mutations => {
    for(const m of mutations){
      if(m.attributeName !== 'class') continue;
      const el = m.target;
      if(!el.matches('.overlay,.panel-overlay')) continue;
      if(SKIP_IDS.has(el.id)) continue;
      const hadOpen = (m.oldValue||'').split(/\s+/).includes('open');
      const hasOpen = el.classList.contains('open');
      if(hasOpen && !hadOpen){
        _depth++;
        history.pushState({gbsc:_depth, id:el.id}, '');
      }
    }
  });
  obs.observe(document.body, {subtree:true, attributes:true, attributeOldValue:true, attributeFilter:['class']});

  window.addEventListener('popstate', () => {
    // Always re-push — belt-and-suspenders so the stack never runs dry
    // even if MutationObserver and actual open-state drift slightly.
    _depth++;
    history.pushState({gbsc:_depth}, '');

    // Dynamic QR overlays
    const qr = document.getElementById('_revolutQROverlay') || document.getElementById('_stripeQROverlay');
    if(qr){ qr.remove(); return; }

    // Bottom sheets (.overlay.open) — skip pin overlays
    const sheets = [...document.querySelectorAll('.overlay.open')].filter(el=>!SKIP_IDS.has(el.id));
    if(sheets.length){
      const top = sheets[sheets.length-1];
      top.classList.remove('open');
      if(top.id==='collectSheet'||top.id==='pnSheet') renderCrew();
      return;
    }

    // Full-screen panels (.panel-overlay.open)
    const panels = [...document.querySelectorAll('.panel-overlay.open')];
    if(panels.length){
      const top = panels[panels.length-1];
      top.classList.remove('open');
      setTimeout(()=>{top.style.display='none';}, 300);
      return;
    }

    // Nothing open — back pressed from the home screen
    if(currentBoat||isRO) showLogoutConfirm();
    // Guest: silently swallowed — re-push above keeps the app alive
  });
})();

function showLogoutConfirm(){
  document.getElementById('logoutConfirmSheet').classList.add('open');
}
function closeLogoutConfirm(){
  document.getElementById('logoutConfirmSheet').classList.remove('open');
}
function confirmLogout(){
  closeLogoutConfirm();
  switchBoat(); // returns to guest/home view
}

// ═══════════════════════════════════════════════════════════════
// ── Start Timer integration ───────────────────────────────────────────────
// Launches "Voice Sail Start Timer" by Egor Leonenko.
// Android: Intent URL with known package name — reliable launch or Play Store.
// iOS:     Try custom URL scheme; if app not installed, visibilitychange
//          detection bounces to App Store after 1.5s.
// URL scheme 'starttimer://' is an educated guess — confirm with developer
// at support@starttimerapp.com and update ST_IOS_SCHEME if different.
const ST_IOS_SCHEME   = 'starttimer://';
const ST_IOS_STORE    = 'https://apps.apple.com/app/id1492557181';
const ST_ANDROID_INTENT = 'intent://open#Intent;scheme=starttimer;package=info.leonenko.starttimer;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore%2Fapps%2Fdetails%3Fid%3Dinfo.leonenko.starttimer;end';

function openStartTimer(){
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform==='MacIntel' && navigator.maxTouchPoints>1);

  if(isAndroid){
    // Intent URL: Chrome launches the app if installed, Play Store if not
    window.location.href = ST_ANDROID_INTENT;
    return;
  }

  if(isIOS){
    // Attempt to open via URL scheme; if page stays visible after 1.5s
    // the app isn't installed — redirect to App Store instead
    const t = Date.now();
    window.location.href = ST_IOS_SCHEME;
    setTimeout(()=>{
      // If we're still here and the page wasn't hidden, scheme didn't work
      if(Date.now() - t < 2000) window.location.href = ST_IOS_STORE;
    }, 1500);
    return;
  }

  // Desktop / unknown — open the website
  window.open('https://starttimerapp.com', '_blank');
}

// ── Halsail integration ───────────────────────────────────────────────────
// Halsail is a PWA (no native app). Open in a new tab — the RO will already
// be logged in on their device and can navigate straight to the active race.
function openHalsail(){
  window.open('https://halsail.com', '_blank');
}

// ═══════════════════════════════════════════════════════════════
// USAGE STATS (RO only)
// ═══════════════════════════════════════════════════════════════
async function loadUsageStats(){
  openPanel('usagePanel');
  const el=document.getElementById('usageContent');
  el.innerHTML='<div class="empty-state"><div class="icon">⏳</div>Loading…</div>';
  const rows=await sbLoadSessionStats();
  if(!rows||rows._err){
    el.innerHTML='<div class="empty-state"><div class="icon">⚠️</div>Could not load stats</div>';
    return;
  }
  if(!rows.length){
    el.innerHTML='<div class="empty-state"><div class="icon">📊</div>No sessions recorded yet</div>';
    return;
  }

  // Aggregate
  const total=rows.length;
  const guests=rows.filter(r=>r.session_type==='guest').length;
  const skippers=rows.filter(r=>r.session_type==='skipper').length;
  const ros=rows.filter(r=>r.session_type==='ro').length;
  const uniqueBoats=new Set(rows.filter(r=>r.boat_id).map(r=>r.boat_id)).size;
  const now=new Date();
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1).toISOString();
  const thisMonth=rows.filter(r=>r.logged_in_at>=monthStart).length;

  function dur(r){
    if(!r.logged_out_at)return'—';
    const ms=new Date(r.logged_out_at)-new Date(r.logged_in_at);
    const m=Math.floor(ms/60000); const s=Math.floor((ms%60000)/1000);
    return m>0?m+'m '+s+'s':s+'s';
  }
  function fmt(iso){
    const d=new Date(iso);
    return d.toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'})+
      ' '+d.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  }
  function badge(type){
    if(type==='ro')return'<span class="usage-badge ro">RO</span>';
    if(type==='guest')return'<span class="usage-badge guest">Guest</span>';
    return'<span class="usage-badge skipper">Skipper</span>';
  }

  const recentRows=rows.slice(0,50).map(r=>`
    <div class="usage-row">
      <div class="usage-row-who">${badge(r.session_type)} ${r.boat_name||'—'}</div>
      <div class="usage-row-meta">${fmt(r.logged_in_at)} · ${dur(r)}</div>
    </div>`).join('');

  el.innerHTML=`
    <div class="usage-strip">
      <div class="usage-stat"><div class="usage-val">${total}</div><div class="usage-lbl">Total Sessions</div></div>
      <div class="usage-sep"></div>
      <div class="usage-stat"><div class="usage-val">${thisMonth}</div><div class="usage-lbl">This Month</div></div>
      <div class="usage-sep"></div>
      <div class="usage-stat"><div class="usage-val">${uniqueBoats}</div><div class="usage-lbl">Unique Boats</div></div>
    </div>
    <div class="usage-strip" style="margin-top:8px">
      <div class="usage-stat"><div class="usage-val">${skippers}</div><div class="usage-lbl">Skipper</div></div>
      <div class="usage-sep"></div>
      <div class="usage-stat"><div class="usage-val">${ros}</div><div class="usage-lbl">RO</div></div>
      <div class="usage-sep"></div>
      <div class="usage-stat"><div class="usage-val">${guests}</div><div class="usage-lbl">Guest</div></div>
    </div>
    <div class="sec-head" style="margin-top:20px"><div class="sec-title">Recent Sessions</div><div style="font-size:.75rem;color:var(--muted)">Last 50</div></div>
    <div class="usage-log">${recentRows}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC HOME — chips & countdown
// ═══════════════════════════════════════════════════════════════
function updateEstellaLink(){
  const link=document.getElementById('estellaLink'); if(!link)return;
  const url=(clubSettings.estella_url||'').trim();
  if(url){ link.href=url; link.style.display='flex'; }
  else { link.style.display='none'; }
}

function updateHomeChips(){
  const chips=document.getElementById('guestDashChips'); if(!chips)return;
  const count=registeredBoatIds.size;
  const state=getCourseState();
  const regChip=count>0
    ?`<span class="dash-chip regs">⛵ ${count} boat${count===1?'':'s'} registered</span>`
    :'<span class="dash-chip course-no">No registrations yet</span>';
  let courseChip='';
  if(state==='live')  courseChip='<span class="dash-chip course-ok" style="cursor:pointer" onclick="openPanel(\'coursePanel\')">🟢 Course live</span>';
  else if(state==='pending') courseChip='<span class="dash-chip course-no">🕐 Course pending</span>';
  chips.innerHTML=regChip+courseChip;
}

let _countdownInterval=null;
function startCountdown(){
  if(_countdownInterval){clearInterval(_countdownInterval);_countdownInterval=null;}
  function tick(){
    const el=document.getElementById('guestDashCountdown'); if(!el||!nextRace)return;
    const now=new Date();
    const diffMs=nextRace.date-now;
    const isToday=nextRace.date.toDateString()===now.toDateString();
    if(!isToday){el.style.display='none';return;}
    if(diffMs<=-3600000){el.style.display='none';return;} // race >1h ago
    if(diffMs<=0){
      el.style.display='block';
      el.style.color='var(--success)';
      el.textContent='🏁 Race in progress';
      return;
    }
    const hrs=Math.floor(diffMs/3600000);
    const mins=Math.floor((diffMs%3600000)/60000);
    const secs=Math.floor((diffMs%60000)/1000);
    let txt='⏱ ';
    if(hrs>0) txt+=hrs+'h ';
    txt+=String(mins).padStart(2,'0')+'m ';
    txt+=String(secs).padStart(2,'0')+'s to start';
    el.style.display='block';
    el.style.color='var(--warn)';
    el.textContent=txt;
  }
  tick();
  _countdownInterval=setInterval(tick,1000);
}

// ═══════════════════════════════════════════════════════════════
// INIT — open directly to public view, no login gate
// ═══════════════════════════════════════════════════════════════
loadWindWidget();
// Handle Stripe success redirect — auto-confirm Card self-payment without extra tap
(function handleStripeReturn(){
  const params=new URLSearchParams(window.location.search);
  if(params.get('stripe_success')!=='1') return;
  history.replaceState({},'',window.location.pathname); // clean URL
  try{
    const ctx=JSON.parse(sessionStorage.getItem('sp_pending')||'null');
    if(!ctx) return;
    sessionStorage.removeItem('sp_pending');
    sbSaveSelfPayment({
      boat_id:ctx.boatId, crew_id:ctx.crewId,
      race_key:ctx.raceKey, race_name:ctx.raceName,
      race_date:ctx.raceDate, method:'Card', amount:ctx.amount
    }).then(()=>toast('✅ Card payment recorded'));
  }catch(e){}
})();
// Load club settings first so the pay page has stripe links available, then check hash
const _settingsReady=loadClubSettings().then(()=>{updateEstellaLink();checkPayHash();});
showTab('registeredTab', null);
// Load schedule from DB; fall back to hardcoded GBSC schedule if unavailable
loadRaceSchedule().then(()=>{
  if(!allRaces.length){ buildAllRaces(); nextRace=getNextRace(); }
  const el=document.getElementById('guestDashRaceName');
  const mel=document.getElementById('guestDashMeta');
  const tel=document.getElementById('guestDashTime');
  if(el&&nextRace) el.textContent=nextRace.label;
  else if(el) el.textContent='No races scheduled';
  if(mel&&nextRace) mel.textContent=nextRace.date.toLocaleDateString('en-IE',{weekday:'long',day:'numeric',month:'long'});
  if(tel&&nextRace) tel.textContent=nextRace.date.toLocaleTimeString('en-IE',{hour:'2-digit',minute:'2-digit'});
  const ge=document.getElementById('guestRaceEyebrow');
  if(ge) ge.textContent=getRaceEyebrow(nextRace);
  startCountdown();
  loadAndDrawCourse().then(()=>updateHomeChips());
  if(HAL_CLUB) patchRaceTimesFromHalsail(); // patch start times from Halsail in background
});
buildBoatGrid(); // loads boats async — triggers renderRegisteredTab once boats are ready
fetch('/version.json').then(r=>r.ok?r.json():null).then(v=>{
  if(!v) return;
  const el=document.getElementById('buildBadge');
  if(el) el.textContent=v.commit+' · '+v.built;
}).catch(()=>{});

// Keyboard support for PIN overlays (digits, Backspace, Escape)
document.addEventListener('keydown', function(e){
  const pinOpen = document.getElementById('pinOverlay')?.classList.contains('open');
  const cpOpen  = document.getElementById('changePinOverlay')?.classList.contains('open');
  if(!pinOpen && !cpOpen) return;
  if(e.key>='0'&&e.key<='9'){
    e.preventDefault();
    if(pinOpen) pinKey(e.key); else cpKey(e.key);
  } else if(e.key==='Backspace'){
    e.preventDefault();
    if(pinOpen) pinBack(); else cpBack();
  } else if(e.key==='Escape'){
    e.preventDefault();
    if(pinOpen) closePinOverlay(); else closeChangePinOverlay();
  }
});
