const BUILD = '20260611.35';

const PORTAL_LINKS = [
  { name: 'gbsc.ie',        desc: 'Club website',          icon: '⚓', color: '#00aeef', bg: 'rgba(0,174,239,.12)',    url: 'https://www.gbsc.ie'                        },
  { name: 'racing.gbsc.ie', desc: 'Racing website',        icon: '🏆', color: '#e8c900', bg: 'rgba(232,201,0,.1)',    url: 'https://racing.gbsc.ie'                     },
  { name: 'Halsail',        desc: 'Race management',       icon: '🧭', color: '#e63946', bg: 'rgba(230,57,70,.12)',    url: 'https://halsail.com'                        },
  { name: 'Corsizio',       desc: 'Training & courses',    icon: '🎓', color: '#27ae60', bg: 'rgba(39,174,96,.12)',    url: 'https://manager.corsizio.com/dashboard'     },
  { name: 'Irish Sailing',  desc: 'National authority',    icon: '⛵', color: '#4287f5', bg: 'rgba(66,135,245,.12)',   url: 'https://www.sailing.ie'                     },
  { name: 'Stripe',         desc: 'Payments & finance',    icon: '💳', color: '#6772e5', bg: 'rgba(103,114,229,.12)', url: 'https://dashboard.stripe.com'               },
  { name: 'ClubMin',        desc: 'Membership',            icon: '👥', color: '#7da4cc', bg: 'rgba(125,164,204,.12)', url: 'https://gbsc.clubmin.net/dashboard'         },
  { name: 'Checklick',      desc: 'Irish Sailing Passport',icon: '✅', color: '#f4a261', bg: 'rgba(244,162,97,.12)',   url: 'https://irishsailing.checklick.com/'        },
];

// ── Halsail helpers ────────────────────────────────────────────
// Strip the class name prefix Halsail prepends to every race name.
// e.g. "Cru E McSwiggans R1" → "McSwiggans R1", "Fireball Race 1" → "Race 1"
function halRaceLabel(r) {
  if (r.Notes && r.Notes.trim()) return r.Notes.trim();
  const base   = (r.Race   || '').replace(/_/g, ' ').trim();
  const series = (r.Series || '').trim();
  const cls    = (r.Class  || '').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim();

  // Strip class prefix from race name if present (e.g. "Fireball Race 1" → "Race 1")
  let racePart = base;
  if (cls) {
    const re = new RegExp('^' + cls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s+', 'i');
    const stripped = base.replace(re, '').trim();
    if (stripped) racePart = stripped;
  }

  // Use series name as primary label, appending race part when it adds info
  if (series && racePart && series.toLowerCase() !== racePart.toLowerCase()) {
    return series + ' – ' + racePart;
  }
  return series || racePart || base;
}

function halEventType(r) {
  if (/cru\s*-/i.test(r.Class  || '')) return 'cruisers';
  if (/king|kotb/i.test(r.Series || '')) return 'regattas';
  return 'dinghys';
}

// ── Club Config (set by /club-config.js edge function) ────────
const _C = window.CLUB || {};
if (!window.CLUB) console.warn('window.CLUB not set — /club-config.js may have failed');

// Apply branding immediately
(function () {
  const short  = _C.short || 'GBSC';
  const name   = _C.name  || 'Galway Bay Sailing Club';
  const logo   = _C.logoUrl || _C.logoURL || _C.logo_url || _C.logo || '';

  document.title = short + ' Club Management';

  const loginLogo = document.getElementById('loginLogoImg');
  const loginText = document.getElementById('loginLogoText');
  if (loginLogo && logo) {
    loginLogo.src = logo; loginLogo.alt = short;
    loginLogo.style.display = '';
    if (loginText) loginText.style.display = 'none';
  }

  const clubName = document.getElementById('loginClubName');
  if (clubName) clubName.textContent = name;

  const appLogo = document.getElementById('clubLogoImg');
  const appText = document.getElementById('clubLogoText');
  if (appLogo && logo) {
    appLogo.src = logo; appLogo.alt = short;
    appLogo.style.display = '';
    if (appText) appText.style.display = 'none';
  }

  if (_C.primaryColor) {
    document.documentElement.style.setProperty('--teal', _C.primaryColor);
  }
})();

// ── Supabase (raw fetch — same pattern as gbsc.racing) ────────
const SB_URL = _C.sbUrl || '';
const SB_KEY = _C.sbKey || '';
let _session = null;   // { access_token, refresh_token, expires_at, user }
let _member  = null;   // { id, name, role } from hub_members
const _SKEY  = 'gbsc_hub_session';

function SBH() {
  return {
    'Content-Type': 'application/json',
    'apikey': SB_KEY,
    'Authorization': 'Bearer ' + (_session?.access_token || SB_KEY),
  };
}

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) return { _err: 'Supabase not configured' };
  try {
    const r = await fetch(SB_URL + path, { headers: { ...SBH() }, ...opts });
    if (!r.ok) {
      const e = await r.text();
      // Table not found (PGRST205) or permission denied (42501) → treat as empty
      try { const c = JSON.parse(e)?.code; if (c === 'PGRST205' || c === '42501') return []; } catch {}
      console.error('SB', r.status, path, e);
      return { _err: 'HTTP ' + r.status + ': ' + e, _status: r.status };
    }
    if (r.status === 204) return true;
    const t = await r.text();
    return t ? JSON.parse(t) : [];
  } catch (e) {
    console.error('SB net', e);
    return { _err: e.message };
  }
}

async function sbGet(table, query) {
  return sb('/rest/v1/' + table + (query ? '?' + query : ''));
}
async function sbPost(table, body) {
  return sb('/rest/v1/' + table, {
    method: 'POST',
    headers: { ...SBH(), 'Prefer': 'return=representation' },
    body: JSON.stringify(body),
  });
}
async function sbPatch(table, query, body) {
  return sb('/rest/v1/' + table + '?' + query, {
    method: 'PATCH',
    headers: { ...SBH(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
}
async function sbDelete(table, query) {
  return sb('/rest/v1/' + table + '?' + query, { method: 'DELETE' });
}
// Insert-or-update-on-conflict, e.g. for CSV imports keyed on an external ref.
async function sbUpsert(table, body, conflictCol) {
  return sb('/rest/v1/' + table + '?on_conflict=' + conflictCol, {
    method: 'POST',
    headers: { ...SBH(), 'Prefer': 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(body),
  });
}

// ── Auth (Supabase Auth + Google OAuth, whitelist via hub_members) ─

function _saveSession(data) {
  _session = { ...data, expires_at: Date.now() + (data.expires_in || 3600) * 1000 };
  localStorage.setItem(_SKEY, JSON.stringify(_session));
}
function _clearSession() { _session = null; localStorage.removeItem(_SKEY); }

async function _refreshToken() {
  if (!_session?.refresh_token) return false;
  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ refresh_token: _session.refresh_token }),
    });
    if (!r.ok) { _clearSession(); return false; }
    _saveSession(await r.json());
    return true;
  } catch { return false; }
}

async function _checkMembership() {
  const email = _session?.user?.email;
  if (!email) return null;
  try {
    const r = await fetch(
      `${SB_URL}/rest/v1/hub_members?email=eq.${encodeURIComponent(email)}&select=id,name,role`,
      { headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _session.access_token } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows[0] || null;
  } catch { return null; }
}

async function _completeLogin(data) {
  _saveSession(data);
  const member = await _checkMembership();
  if (!member) {
    _clearSession();
    _showLoginError('Your account is not authorised. Contact the club administrator.');
    return false;
  }
  _member = member;
  showApp();
  return true;
}

function showApp() {
  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
}
function _showLoginError(msg) {
  const el = document.getElementById('loginError');
  if (el) { el.textContent = msg; el.classList.remove('hidden'); }
}

function signInWithGoogle() {
  const redirectTo = window.location.origin + window.location.pathname;
  window.location.href = `${SB_URL}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent(redirectTo)}`;
}

async function doEmailSignIn() {
  const email    = (document.getElementById('loginEmail')?.value || '').trim();
  const password = document.getElementById('loginPassword')?.value || '';
  const btn      = document.getElementById('loginBtn');
  const errEl    = document.getElementById('loginError');
  if (errEl) errEl.classList.add('hidden');
  if (!email || !password) { _showLoginError('Email and password are required.'); return; }
  if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
  try {
    const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY },
      body: JSON.stringify({ email, password }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error_description || data.msg || 'Sign in failed');
    await _completeLogin(data);
  } catch (e) {
    _showLoginError(e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Sign In'; }
  }
}

async function logout() {
  if (!confirm('Sign out?')) return;
  try {
    if (_session?.access_token) {
      await fetch(`${SB_URL}/auth/v1/logout`, {
        method: 'POST',
        headers: { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _session.access_token },
      });
    }
  } catch {}
  _clearSession();
  _member = null;
  document.getElementById('loginScreen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  const emailEl = document.getElementById('loginEmail');
  const passEl  = document.getElementById('loginPassword');
  const errEl   = document.getElementById('loginError');
  if (emailEl) emailEl.value = '';
  if (passEl)  passEl.value  = '';
  if (errEl)   errEl.classList.add('hidden');
}

function _jwtPayload(token) {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - b64.length % 4) % 4)));
  } catch { return null; }
}

async function _initAuth() {
  // Handle Google OAuth redirect (tokens arrive in URL hash)
  const hash = window.location.hash;
  if (hash.includes('access_token=')) {
    const params = new URLSearchParams(hash.slice(1));
    window.history.replaceState(null, '', window.location.pathname);
    const data = {
      access_token:  params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in:    parseInt(params.get('expires_in') || '3600'),
      token_type:    params.get('token_type'),
    };
    data.user = _jwtPayload(data.access_token);
    return _completeLogin(data);
  }

  // Load existing session from localStorage
  try { _session = JSON.parse(localStorage.getItem(_SKEY)); } catch { _session = null; }
  if (!_session?.access_token) return false;

  // Refresh token if expiring within 5 minutes
  if ((_session.expires_at || 0) < Date.now() + 300_000) {
    const ok = await _refreshToken();
    if (!ok) return false;
  }

  // Ensure user email is available (parse from JWT if missing)
  if (!_session.user?.email) {
    _session = { ..._session, user: _jwtPayload(_session.access_token) };
  }

  const member = await _checkMembership();
  if (!member) { _clearSession(); return false; }
  _member = member;
  showApp();
  return true;
}

// ── State ──────────────────────────────────────────────────────
const State = {
  view: 'portal',
  cal:  { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDay: null, calType: 'club',
          filters: new Set(['cruisers','dinghys','regattas','social','external','other']) },
  maint: { tab: 'equipment', current: null },
  sops:  { catFilter: 'all', current: null },
  members: { tab: 'roster', statusFilter: 'all', current: null },
  access:  { tab: 'logins' },
};

// ── App ────────────────────────────────────────────────────────
const App = {

  async init() {
    const authed = await _initAuth();
    if (!authed) return;

    await Promise.all([App.cal.load(), App.maint.load(), App.sops.load(), App.members.load(), App.access.load()]);

    App.cal.render();
    App.events.render();
    App.maint.renderEquipment();
    App.maint._updateIssuesTabBadge();
    App.sops.render();
    App.members.renderRoster();
    App.members.renderTypes();
    App.access.renderLogins();
    App.navigate('portal');
    const bid = document.getElementById('buildId');
    if (bid) bid.textContent = 'build ' + BUILD;
  },

  navigate(view, _noHistory = false) {
    const isPortal = view === 'portal';
    const viewMap  = { portal:'portalView', calendar:'calendarView', events:'eventsView', maintenance:'maintenanceView', sops:'sopsView', members:'membersView', access:'accessView' };
    const addMap   = { calendar:'hAddCal', events:'hAddCal', maintenance:'hAddMaint', sops:'hAddSops', members:'hAddMembers', access:'hAddAccess' };
    const titleMap = { calendar:'Calendar', events:'Events', maintenance:'Maintenance', sops:'SOPs', members:'Members', access:'Access' };
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById(viewMap[view])?.classList.add('active');
    document.getElementById('headerBreadcrumb').classList.toggle('hidden', isPortal);
    if (!isPortal) document.getElementById('headerSectionTitle').textContent = titleMap[view] || view;
    document.querySelectorAll('.h-add-group').forEach(g => g.classList.add('hidden'));
    if (!isPortal) document.getElementById(addMap[view])?.classList.remove('hidden');
    if (!_noHistory) {
      if (isPortal) window.history.replaceState({ view: 'portal' }, '', window.location.pathname);
      else          window.history.pushState({ view }, '', '#' + view);
    }
    State.view = view;
    if (isPortal) App.renderPortal();
  },

  renderPortal() {
    const today      = fmtDate(new Date());
    const yr         = State.cal.year, mo = State.cal.month;
    const monthStart = `${yr}-${String(mo+1).padStart(2,'0')}-01`;
    const monthEnd   = `${yr}-${String(mo+1).padStart(2,'0')}-${String(new Date(yr,mo+1,0).getDate()).padStart(2,'0')}`;
    const evMonth    = App.cal.data.filter(ev => { const d = ev.start_date?.slice(0,10)||''; return d >= monthStart && d <= monthEnd; }).length;
    const openIssues = App.maint.issues.filter(i => i.status !== 'resolved').length;
    const overdue    = App.maint.records.filter(r => r.next_due_date && r.next_due_date < today).length;
    const upcoming   = App.cal.data.filter(ev => (ev.start_date?.slice(0,10)||'') >= today).length;
    const months     = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const activeMembers = App.members.roster.filter(m => m.status === 'active').length;
    const inArrears      = App.members.roster.filter(m => m.status === 'active' && m.in_arrears).length;

    document.getElementById('portalSummary').innerHTML = `
      <div class="pstat-card" onclick="App.navigate('calendar')">
        <div class="pstat-val">${evMonth}</div>
        <div class="pstat-label">Events in ${months[mo]}</div>
      </div>
      <div class="pstat-card${openIssues ? ' pstat-alert' : ''}" onclick="App.navigate('maintenance');App.maint.showTab('issues',document.getElementById('issuesTabBtn'))">
        <div class="pstat-val">${openIssues}</div>
        <div class="pstat-label">Open issues</div>
      </div>
      <div class="pstat-card${overdue ? ' pstat-warn' : ''}" onclick="App.navigate('maintenance');App.maint.showTab('upcoming',document.querySelectorAll('#maintenanceView .tab-btn')[2])">
        <div class="pstat-val">${overdue}</div>
        <div class="pstat-label">Maintenance overdue</div>
      </div>
      <div class="pstat-card${inArrears ? ' pstat-warn' : ''}" onclick="App.navigate('members');App.members.filterStatus('arrears',document.querySelector('#membersView .filter-btn:last-child'))">
        <div class="pstat-val">${inArrears}</div>
        <div class="pstat-label">Members in arrears</div>
      </div>`;

    document.getElementById('pstat-calendar').textContent    = `${evMonth} event${evMonth!==1?'s':''} this month`;
    document.getElementById('pstat-events').textContent      = `${upcoming} upcoming`;
    document.getElementById('pstat-maintenance').textContent = openIssues ? `${openIssues} open issue${openIssues!==1?'s':''}` : 'No open issues';
    document.getElementById('pstat-sops').textContent        = `${App.sops.data.length} document${App.sops.data.length!==1?'s':''}`;
    document.getElementById('pstat-members').textContent     = `${activeMembers} active member${activeMembers!==1?'s':''}`;
    document.getElementById('pstat-access').textContent      = `${App.access.hubMembers.length} login${App.access.hubMembers.length!==1?'s':''}`;

    document.getElementById('portalLinksGrid').innerHTML = PORTAL_LINKS.map(l =>
      `<a class="portal-link-tile" href="${esc(l.url)}" target="_blank" rel="noopener">
        <div class="portal-link-icon" style="background:${l.bg};color:${l.color}">${l.icon}</div>
        <div class="portal-link-name">${esc(l.name)}</div>
        <div class="portal-link-desc">${esc(l.desc)}</div>
        <div class="portal-link-ext">↗</div>
      </a>`
    ).join('');
  },

  // ── Calendar ─────────────────────────────────────────────────
  cal: {
    data: [],
    resources: [],
    corsizioEvents:   [],
    corsizioBookings: [],
    corsizioFetched:  false,
    corsizioLoading:  false,
    corsizioError:    null,
    _crzEvent:        null,

    async load() {
      const [rows, res] = await Promise.all([
        sbGet('hub_events', 'order=start_date.asc&select=*'),
        sbGet('hub_event_resources', 'select=*'),
      ]);
      if (rows && !rows._err) this.data = rows;
      if (res  && !res._err)  this.resources = res;
    },

    async _loadCorsizioBookings() {
      if (this.corsizioBookings.length) return;
      const crz = await sbGet('hub_corsizio_resource_bookings', 'select=*');
      if (crz && !crz._err) this.corsizioBookings = crz;
    },

    async syncHalsail() {
      const halClub = _C.halClub;
      if (!halClub) { showToast('Halsail club ID not in club config', 'error'); return; }

      const btn = document.getElementById('halsailSyncBtn');
      if (btn) { btn.disabled = true; btn.textContent = '⟳ Syncing…'; }

      try {
        const r = await fetch('/.netlify/functions/halsail-proxy?path=/GetSchedule/' + halClub);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const raw = await r.json();
        if (!Array.isArray(raw)) throw new Error(raw.error || 'Unexpected response from Halsail');
        if (raw.length) console.info('Halsail sample:', JSON.stringify(raw[0]));

        // One event per RaceID — Halsail returns duplicate entries per scoring class
        const seen = new Set();
        const pad  = n => String(n).padStart(2, '0');
        const events = raw
          .filter(r => { if (seen.has(r.RaceID)) return false; seen.add(r.RaceID); return true; })
          .map(r => {
            const d = new Date(r.Start);
            const dateStr = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
            const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
            return {
              halsail_race_id: r.RaceID,
              title:           halRaceLabel(r),
              event_type:      halEventType(r),
              calendar_type:   'club',
              start_date:      `${dateStr}T${timeStr}`,
              end_date:        `${dateStr}T${timeStr}`,
              all_day:         false,
              description:     r.Series || '',
            };
          });

        if (!events.length) { showToast('No races found in Halsail schedule', 'error'); return; }

        const result = await sb('/rest/v1/hub_events?on_conflict=halsail_race_id', {
          method:  'POST',
          headers: { ...SBH(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body:    JSON.stringify(events),
        });
        if (result?._err) throw new Error(result._err);

        await this.load();
        this.render();
        showToast(`Synced ${events.length} races from Halsail ✓`, 'success');
      } catch (e) {
        showToast('Halsail sync failed: ' + e.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = '⟳ Halsail'; }
      }
    },

    async fetchCorsizio() {
      if (this.corsizioLoading) return;
      this.corsizioLoading = true;
      this.corsizioError   = null;
      try {
        const r = await fetch('/.netlify/functions/corsizio-events');
        const json = await r.json().catch(() => ({}));
        if (!r.ok) {
          this.corsizioError  = json.error || ('HTTP ' + r.status);
          this.corsizioEvents = [];
        } else {
          this.corsizioEvents = json.events || [];
          if (json._debug) console.info('Corsizio debug:', json._debug);
        }
      } catch (e) {
        this.corsizioError  = e.message;
        this.corsizioEvents = [];
      }
      if (this.corsizioError) console.error('Corsizio:', this.corsizioError);
      this.corsizioLoading  = false;
      this.corsizioFetched  = true;
    },

    setType(type) {
      State.cal.calType = type;
      State.cal.selectedDay = null;
      document.getElementById('calTypeClub').classList.toggle('active', type === 'club');
      document.getElementById('calTypeTraining').classList.toggle('active', type === 'training');
      document.getElementById('calendarView').classList.toggle('cal-training', type === 'training');
      document.getElementById('calFilterBar').classList.toggle('hidden', type !== 'club');
      this.render();
      if (type === 'training' && !this.corsizioFetched) {
        this.fetchCorsizio().then(() => this.render());
      }
    },

    toggleFilter(type) {
      const f = State.cal.filters;
      if (f.has(type)) {
        if (f.size === 1) { f.clear(); ['cruisers','dinghys','regattas','social','external','other'].forEach(t => f.add(t)); }
        else f.delete(type);
      } else {
        f.add(type);
      }
      document.querySelectorAll('.cal-filter-pill').forEach(btn =>
        btn.classList.toggle('active', f.has(btn.dataset.type))
      );
      this.render();
    },

    render() {
      const { year, month } = State.cal;
      const months = ['January','February','March','April','May','June',
                      'July','August','September','October','November','December'];
      document.getElementById('calMonthLabel').textContent = months[month] + ' ' + year;

      const firstDay = new Date(year, month, 1);
      const lastDay  = new Date(year, month + 1, 0);
      const startDow = (firstDay.getDay() + 6) % 7;
      const todayStr = fmtDate(new Date());

      const calData = State.cal.calType === 'training'
        ? [...this.data.filter(ev => (ev.calendar_type || 'club') === 'training'), ...this.corsizioEvents]
        : this.data.filter(ev =>
            (ev.calendar_type || 'club') === 'club' &&
            State.cal.filters.has(ev.event_type || 'other')
          );
      const byDate = {};
      calData.forEach(ev => {
        const s = ev.start_date.slice(0, 10);
        const e = ev.end_date ? ev.end_date.slice(0, 10) : s;
        let cur = new Date(s + 'T12:00:00'), end = new Date(e + 'T12:00:00');
        while (cur <= end) {
          const ds = fmtDate(cur);
          (byDate[ds] = byDate[ds] || []).push(ev);
          cur.setDate(cur.getDate() + 1);
        }
      });

      const grid = document.getElementById('calGrid');
      grid.innerHTML = '';
      const prevLast = new Date(year, month, 0).getDate();
      for (let i = startDow - 1; i >= 0; i--) grid.appendChild(makeCell(prevLast - i, true, '', []));
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const ds = year + '-' + pad2(month + 1) + '-' + pad2(d);
        grid.appendChild(makeCell(d, false, ds, byDate[ds] || [], ds === todayStr, State.cal.selectedDay === ds));
      }
      const trailing = (startDow + lastDay.getDate()) % 7;
      for (let i = 1; i <= (trailing ? 7 - trailing : 0); i++) grid.appendChild(makeCell(i, true, '', []));

      this.renderPanel(State.cal.selectedDay);
    },

    renderPanel(dateStr) {
      const el = document.getElementById('calPanel');
      const calData = State.cal.calType === 'training'
        ? [...this.data.filter(ev => (ev.calendar_type || 'club') === 'training'), ...this.corsizioEvents]
        : this.data.filter(ev =>
            (ev.calendar_type || 'club') === 'club' &&
            State.cal.filters.has(ev.event_type || 'other')
          );
      const loadingBanner = State.cal.calType === 'training'
        ? (this.corsizioLoading
            ? '<div class="corsizio-loading">⟳ Syncing with Corsizio…</div>'
            : this.corsizioError
              ? `<div class="corsizio-error">⚠ Corsizio: ${esc(this.corsizioError)}</div>`
              : this.corsizioFetched
                ? `<div class="corsizio-ok">✓ Corsizio synced · ${this.corsizioEvents.length} course${this.corsizioEvents.length !== 1 ? 's' : ''}</div>`
                : '')
        : '';
      if (dateStr) {
        const dayEvs = calData.filter(ev => {
          const s = ev.start_date.slice(0, 10), e = ev.end_date ? ev.end_date.slice(0, 10) : s;
          return dateStr >= s && dateStr <= e;
        });
        const heading = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-IE',
          { weekday: 'long', day: 'numeric', month: 'long' });
        const addLink = State.cal.calType === 'club'
          ? `<div style="color:var(--muted);font-size:.85rem;padding:4px 0">No events — <a href="#" style="color:var(--teal)" onclick="App.cal.openAdd('${dateStr}');return false">add one</a></div>`
          : `<div style="color:var(--muted);font-size:.85rem;padding:4px 0">No training on this date</div>`;
        el.innerHTML = loadingBanner + `<div class="cal-panel-heading">${heading}</div>` +
          (dayEvs.length ? dayEvs.map(eventCardHTML).join('') : addLink);
      } else {
        const todayStr = fmtDate(new Date());
        const upcoming = calData.filter(ev => ev.start_date.slice(0, 10) >= todayStr).slice(0, 6);
        const emptyMsg = State.cal.calType === 'training'
          ? '<div class="empty-state"><div class="empty-state-text">No upcoming training courses</div></div>'
          : '<div class="empty-state"><div class="empty-state-text">No upcoming events</div></div>';
        el.innerHTML = loadingBanner + '<div class="cal-panel-heading">Upcoming</div>' +
          (upcoming.length ? upcoming.map(eventCardHTML).join('') : emptyMsg);
      }
    },

    prev() {
      const { year, month } = State.cal;
      State.cal.year  = month === 0 ? year - 1 : year;
      State.cal.month = month === 0 ? 11 : month - 1;
      State.cal.selectedDay = null; this.render();
    },
    next() {
      const { year, month } = State.cal;
      State.cal.year  = month === 11 ? year + 1 : year;
      State.cal.month = month === 11 ? 0 : month + 1;
      State.cal.selectedDay = null; this.render();
    },

    selectDay(dateStr) {
      State.cal.selectedDay = State.cal.selectedDay === dateStr ? null : dateStr;
      this.render();
    },

    openAdd(prefillDate) {
      const d = prefillDate || fmtDate(new Date());
      document.getElementById('eventModalTitle').textContent = 'Add Event';
      document.getElementById('evtId').value          = '';
      document.getElementById('evtTitle').value       = '';
      document.getElementById('evtType').value        = 'other';
      document.getElementById('evtStartDate').value   = d;
      document.getElementById('evtEndDate').value     = d;
      document.getElementById('evtAllDay').checked    = true;
      document.getElementById('evtTimeRow').classList.add('hidden');
      document.getElementById('evtStartTime').value   = '';
      document.getElementById('evtEndTime').value     = '';
      document.getElementById('evtLocation').value    = '';
      document.getElementById('evtDescription').value = '';
      document.getElementById('evtDeleteBtn').classList.add('hidden');
      document.getElementById('evtError').classList.add('hidden');
      const ct = State.cal.calType;
      document.getElementById('evtCalType').value = ct;
      document.getElementById('evtSessionRow').classList.toggle('hidden', ct !== 'training');
      document.getElementById('evtSessionHalf').value = 'full';
      this._loadResourceList(d, d, null);
      openModal('eventModal');
    },

    openEdit(ev) {
      if (!ev) return;
      document.getElementById('eventModalTitle').textContent  = 'Edit Event';
      document.getElementById('evtId').value          = ev.id;
      document.getElementById('evtTitle').value       = ev.title;
      document.getElementById('evtType').value        = ev.event_type || 'other';
      document.getElementById('evtStartDate').value   = ev.start_date.slice(0, 10);
      document.getElementById('evtEndDate').value     = ev.end_date ? ev.end_date.slice(0, 10) : ev.start_date.slice(0, 10);
      const allDay = ev.all_day !== false;
      document.getElementById('evtAllDay').checked = allDay;
      toggleEventTime();
      if (!allDay) {
        document.getElementById('evtStartTime').value = ev.start_date.length > 10 ? ev.start_date.slice(11, 16) : '';
        document.getElementById('evtEndTime').value   = ev.end_date?.length > 10  ? ev.end_date.slice(11, 16)   : '';
      }
      document.getElementById('evtLocation').value    = ev.location    || '';
      document.getElementById('evtDescription').value = ev.description || '';
      document.getElementById('evtDeleteBtn').classList.remove('hidden');
      document.getElementById('evtError').classList.add('hidden');
      const ct = ev.calendar_type || 'club';
      document.getElementById('evtCalType').value = ct;
      document.getElementById('evtSessionRow').classList.toggle('hidden', ct !== 'training');
      document.getElementById('evtSessionHalf').value = ev.session_half || 'full';
      this._loadResourceList(ev.start_date.slice(0,10), (ev.end_date || ev.start_date).slice(0,10), ev.id);
      openModal('eventModal');
    },

    async _loadResourceList(startDate, endDate, currentEventId) {
      const container = document.getElementById('evtResourceList');
      const bookable = (App.maint.equipment || []).filter(eq => ['rib','safety_boat','dinghy'].includes(eq.type));
      if (!bookable.length) {
        container.innerHTML = '<span class="form-hint" style="padding:4px 6px;display:block">No RIBs or safety boats registered</span>';
        return;
      }
      const currentlyAssigned = new Set(
        this.resources.filter(r => r.event_id === currentEventId).map(r => r.equipment_id)
      );
      const s = startDate?.slice(0,10), e = (endDate || startDate)?.slice(0,10);
      const conflicted = new Set();
      if (s) {
        this.resources.filter(r => r.event_id !== currentEventId).forEach(r => {
          const ev = this.data.find(ev => ev.id === r.event_id);
          if (!ev) return;
          const evS = ev.start_date.slice(0,10), evE = (ev.end_date || ev.start_date).slice(0,10);
          if (evS <= e && evE >= s) conflicted.add(r.equipment_id);
        });
        // Also check Corsizio training event bookings
        this.corsizioBookings.forEach(b => {
          if (b.start_date <= e && b.end_date >= s) conflicted.add(b.equipment_id);
        });
      }
      container.innerHTML = bookable.map(eq => {
        const checked  = currentlyAssigned.has(eq.id) ? 'checked' : '';
        const conflict = !currentlyAssigned.has(eq.id) && conflicted.has(eq.id);
        const warn     = conflict ? '<span class="resource-conflict">⚠ already booked</span>' : '';
        return `<label class="resource-check-item${conflict ? ' has-conflict' : ''}">
          <input type="checkbox" class="evtResourceCheck" value="${eq.id}" ${checked}>
          <span>${eqIcon(eq.type)} ${esc(eq.name)}</span>${warn}
        </label>`;
      }).join('');
    },

    async _saveResources(eventId) {
      await sbDelete('hub_event_resources', 'event_id=eq.' + eventId);
      const checked = [...document.querySelectorAll('.evtResourceCheck:checked')].map(cb => cb.value);
      if (checked.length) {
        await sbPost('hub_event_resources', checked.map(eqId => ({ event_id: eventId, equipment_id: eqId })));
      }
      const res = await sbGet('hub_event_resources', 'select=*');
      if (res && !res._err) this.resources = res;
    },

    async openCorsizioResources(ev) {
      if (!ev) return;
      await this._loadCorsizioBookings();
      this._crzEvent = ev;
      const startStr = ev.start_date ? new Date(ev.start_date).toLocaleDateString('en-IE', { day:'numeric', month:'short', year:'numeric' }) : '—';
      const endStr   = ev.end_date   ? new Date(ev.end_date).toLocaleDateString('en-IE',   { day:'numeric', month:'short', year:'numeric' }) : startStr;
      document.getElementById('crzEventInfo').innerHTML =
        `<div class="crz-event-title">${esc(ev.title)}</div>` +
        `<div class="crz-event-dates">${startStr}${endStr !== startStr ? ' → ' + endStr : ''}</div>`;
      this._loadCorsizioResourceList(ev);
      openModal('corsizioResourceModal');
    },

    _loadCorsizioResourceList(ev) {
      const container = document.getElementById('crzResourceList');
      const bookable = (App.maint.equipment || []).filter(eq => ['rib','safety_boat','dinghy'].includes(eq.type));
      if (!bookable.length) {
        container.innerHTML = '<span class="form-hint" style="padding:4px 6px;display:block">No RIBs or safety boats registered</span>';
        return;
      }
      const s = ev.start_date?.slice(0,10), e = (ev.end_date || ev.start_date)?.slice(0,10);
      const alreadyAssigned = new Set(
        this.corsizioBookings.filter(b => b.corsizio_event_id === ev.id).map(b => b.equipment_id)
      );
      // Conflicts: equipment booked on overlapping dates by OTHER events (both club and Corsizio)
      const conflicted = new Set();
      if (s) {
        this.resources.forEach(r => {
          const clubEv = this.data.find(d => d.id === r.event_id);
          if (!clubEv) return;
          const evS = clubEv.start_date.slice(0,10), evE = (clubEv.end_date || clubEv.start_date).slice(0,10);
          if (evS <= e && evE >= s) conflicted.add(r.equipment_id);
        });
        this.corsizioBookings.filter(b => b.corsizio_event_id !== ev.id).forEach(b => {
          if (b.start_date <= e && b.end_date >= s) conflicted.add(b.equipment_id);
        });
      }
      container.innerHTML = bookable.map(eq => {
        const checked  = alreadyAssigned.has(eq.id) ? 'checked' : '';
        const conflict = !alreadyAssigned.has(eq.id) && conflicted.has(eq.id);
        const warn     = conflict ? '<span class="resource-conflict">⚠ already booked</span>' : '';
        return `<label class="resource-check-item${conflict ? ' has-conflict' : ''}">
          <input type="checkbox" class="crzResourceCheck" value="${eq.id}" ${checked}>
          <span>${eqIcon(eq.type)} ${esc(eq.name)}</span>${warn}
        </label>`;
      }).join('');
    },

    async saveCorsizioResources() {
      const ev = this._crzEvent;
      if (!ev) return;
      const startDate = ev.start_date?.slice(0,10);
      const endDate   = (ev.end_date || ev.start_date)?.slice(0,10);
      await sbDelete('hub_corsizio_resource_bookings', 'corsizio_event_id=eq.' + ev.id);
      const checked = [...document.querySelectorAll('.crzResourceCheck:checked')].map(cb => cb.value);
      if (checked.length) {
        await sbPost('hub_corsizio_resource_bookings',
          checked.map(eqId => ({ corsizio_event_id: ev.id, equipment_id: eqId, start_date: startDate, end_date: endDate }))
        );
      }
      const crz = await sbGet('hub_corsizio_resource_bookings', 'select=*');
      if (crz && !crz._err) this.corsizioBookings = crz;
      closeModal('corsizioResourceModal');
      this.renderPanel(State.cal.selectedDay);
      showToast('Resources updated', 'success');
    },

    async saveEvent() {
      const id     = document.getElementById('evtId').value;
      const title  = document.getElementById('evtTitle').value.trim();
      const type   = document.getElementById('evtType').value;
      const allDay = document.getElementById('evtAllDay').checked;
      const startD = document.getElementById('evtStartDate').value;
      const endD   = document.getElementById('evtEndDate').value;
      const startT = document.getElementById('evtStartTime').value;
      const endT   = document.getElementById('evtEndTime').value;
      const errEl  = document.getElementById('evtError');

      if (!title) { showFormError(errEl, 'Title is required'); return; }
      if (!startD) { showFormError(errEl, 'Start date is required'); return; }

      const startDate = allDay ? startD : startD + 'T' + (startT || '00:00') + ':00';
      const endDate   = endD ? (allDay ? endD : endD + 'T' + (endT || '23:59') + ':00') : null;

      const calType    = document.getElementById('evtCalType').value || 'club';
      const sessionHalf = document.getElementById('evtSessionHalf').value || 'full';
      const payload = {
        title, event_type: type, all_day: allDay, start_date: startDate, end_date: endDate,
        description:   document.getElementById('evtDescription').value.trim() || null,
        location:      document.getElementById('evtLocation').value.trim()    || null,
        calendar_type: calType,
        session_half:  calType === 'training' ? sessionHalf : 'full',
      };

      const result = id
        ? await sbPatch('hub_events', 'id=eq.' + id, { ...payload, updated_at: new Date().toISOString() })
        : await sbPost('hub_events', payload);

      if (result?._err) { showFormError(errEl, result._err); return; }

      const eventId = id || (Array.isArray(result) ? result[0]?.id : null);
      if (eventId) await this._saveResources(eventId);

      closeModal('eventModal');
      await this.load(); this.render(); App.events.render();
      showToast(id ? 'Event updated' : 'Event added', 'success');
    },

    async deleteEvent() {
      const id = document.getElementById('evtId').value;
      if (!id || !confirm('Delete this event?')) return;
      const r = await sbDelete('hub_events', 'id=eq.' + id);
      if (r?._err) { showToast('Delete failed', 'error'); return; }
      closeModal('eventModal');
      await this.load(); this.render(); App.events.render();
      showToast('Event deleted', 'success');
    },
  },

  // ── Events list ───────────────────────────────────────────────
  events: {
    activeFilter: 'upcoming',

    filter(type, btn) {
      this.activeFilter = type;
      document.querySelectorAll('#eventsView .filter-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      this.render();
    },

    render() {
      const todayStr = fmtDate(new Date());
      let evs = [...App.cal.data];
      if      (this.activeFilter === 'upcoming') evs = evs.filter(e => e.start_date.slice(0,10) >= todayStr);
      else if (this.activeFilter === 'past')     evs = evs.filter(e => e.start_date.slice(0,10) <  todayStr).reverse();

      document.getElementById('eventsList').innerHTML = evs.length
        ? evs.map(eventCardHTML).join('')
        : '<div class="empty-state"><div class="empty-state-icon">📅</div><div class="empty-state-text">No events to show</div></div>';
    },
  },

  // ── Maintenance ───────────────────────────────────────────────
  maint: {
    equipment: [],
    records:   [],
    issues:    [],

    async load() {
      const [eq, rec, iss] = await Promise.all([
        sbGet('hub_equipment', 'order=name.asc&active=eq.true'),
        sbGet('hub_maintenance_records', 'order=performed_date.desc'),
        sbGet('hub_equipment_issues', 'order=reported_date.desc'),
      ]);
      if (eq  && !eq._err)  this.equipment = eq;
      if (rec && !rec._err) this.records   = rec;
      if (iss && !iss._err) this.issues    = iss;
    },

    showTab(tab, btn) {
      State.maint.tab = tab;
      document.querySelectorAll('#maintenanceView .tab-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      document.querySelectorAll('#maintenanceView .tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tab + 'Tab').classList.add('active');
      ({ equipment: () => this.renderEquipment(), issues: () => this.renderIssues(),
         upcoming: () => this.renderUpcoming(), log: () => this.renderLog() })[tab]?.();
    },

    _updateIssuesTabBadge() {
      const open = this.issues.filter(i => i.status !== 'resolved').length;
      const btn  = document.getElementById('issuesTabBtn');
      if (!btn) return;
      btn.textContent = open ? `Issues (${open})` : 'Issues';
      btn.classList.toggle('tab-btn-alert', open > 0);
    },

    renderIssues() {
      const sevOrder = { critical:4, high:3, medium:2, low:1 };
      const stOrder  = { open:0, in_progress:1, resolved:2 };
      const sorted = [...this.issues].sort((a, b) => {
        const sd = stOrder[a.status] - stOrder[b.status];
        if (sd !== 0) return sd;
        return (sevOrder[b.severity]||0) - (sevOrder[a.severity]||0);
      });
      const eqMap = Object.fromEntries(this.equipment.map(e => [e.id, e]));
      document.getElementById('issuesList').innerHTML = sorted.length
        ? sorted.map(i => {
            const eq = eqMap[i.equipment_id];
            const eqLabel = eq ? `<span class="issue-eq-label">${eqIcon(eq.type)} ${esc(eq.name)}</span>` : '';
            return `<div class="issue-row${i.status==='resolved'?' resolved':''}" onclick="App.maint.openEditIssue('${i.id}')">
              <div class="issue-row-top">
                <div class="issue-row-title">${esc(i.title)}</div>
                <div class="issue-row-badges">
                  <span class="issue-sev issue-sev-${i.severity}">${i.severity}</span>
                  <span class="issue-st issue-st-${i.status}">${i.status.replace('_',' ')}</span>
                </div>
              </div>
              <div class="issue-row-meta">
                ${eqLabel}
                ${i.assigned_to ? `<span>→ ${esc(i.assigned_to)}</span>` : '<span class="issue-unassigned">unassigned</span>'}
                <span>${fmtDateShort(i.reported_date)}</span>
              </div>
              ${i.notes ? `<div class="issue-row-notes">${esc(i.notes)}</div>` : ''}
            </div>`;
          }).join('')
        : '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No issues logged</div></div>';
    },

    renderEquipment() {
      const el = document.getElementById('equipmentList');
      if (!this.equipment.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔧</div><div class="empty-state-text">No equipment — tap + Equipment to add</div></div>';
        return;
      }
      const typeOrder = ['tractor','rib','safety_boat','dinghy','engine','other'];
      const sorted = [...this.equipment].sort((a, b) => {
        const ai = typeOrder.indexOf(a.type), bi = typeOrder.indexOf(b.type);
        const td = (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
        return td !== 0 ? td : a.name.localeCompare(b.name);
      });
      el.className = 'eq-grid';
      el.innerHTML = sorted.map(eq => {
        const nextDueRec = this.records.filter(r => r.equipment_id === eq.id && r.next_due_date)
          .sort((a,b) => a.next_due_date.localeCompare(b.next_due_date))[0];
        const maintBadge = nextDueBadge(nextDueRec);
        const openIssues = this.issues.filter(i => i.equipment_id === eq.id && i.status !== 'resolved');
        const sevOrder = {critical:4,high:3,medium:2,low:1};
        const maxSev = openIssues.reduce((m,i) => Math.max(m, sevOrder[i.severity]||0), 0);
        const sevKey = ['','low','medium','high','critical'][maxSev];
        const issueBadge = openIssues.length
          ? `<div class="eq-tile-issue issue-sev-${sevKey}">${openIssues.length} issue${openIssues.length>1?'s':''}</div>` : '';
        return `<div class="eq-tile" onclick="App.maint.openDetail('${eq.id}')">
          <div class="eq-tile-icon eq-icon-${eq.type}">${eqIcon(eq.type)}</div>
          <div class="eq-tile-name">${esc(eq.name)}</div>
          <div class="eq-tile-type">${eqTypeLabel(eq.type)}${eq.year ? ' · ' + eq.year : ''}</div>
          ${maintBadge ? `<div class="eq-tile-badge">${maintBadge}</div>` : ''}
          ${issueBadge}
        </div>`;
      }).join('');
    },

    renderUpcoming() {
      const withDue = [];
      this.equipment.forEach(eq => {
        const rec = this.records.filter(r => r.equipment_id === eq.id && r.next_due_date)
          .sort((a,b) => a.next_due_date.localeCompare(b.next_due_date))[0];
        if (rec) withDue.push({ eq, rec });
      });
      withDue.sort((a,b) => a.rec.next_due_date.localeCompare(b.rec.next_due_date));
      document.getElementById('upcomingList').innerHTML = withDue.length
        ? withDue.map(({ eq, rec }) =>
            `<div class="item-card" onclick="App.maint.openDetail('${eq.id}')">
              <div class="item-card-header">
                <div class="item-icon eq-icon-${eq.type}">${eqIcon(eq.type)}</div>
                <div style="flex:1;min-width:0"><div class="item-card-title">${esc(eq.name)}</div>
                  <div class="item-card-meta">${esc(rec.task)}</div></div>
                ${nextDueBadge(rec)}
              </div>
              <div class="item-card-meta">Due: ${fmtDateShort(rec.next_due_date)}</div>
            </div>`
          ).join('')
        : '<div class="empty-state"><div class="empty-state-icon">✅</div><div class="empty-state-text">No scheduled maintenance</div></div>';
    },

    renderLog() {
      const eqMap = Object.fromEntries(this.equipment.map(e => [e.id, e]));
      document.getElementById('logList').innerHTML = this.records.length
        ? this.records.slice(0, 60).map(rec => {
            const eq = eqMap[rec.equipment_id] || { name: 'Unknown', type: 'other' };
            return `<div class="item-card" onclick="App.maint.openEditRecord('${rec.id}')">
              <div class="item-card-header">
                <div class="item-icon eq-icon-${eq.type}">${eqIcon(eq.type)}</div>
                <div style="flex:1;min-width:0"><div class="item-card-title">${esc(rec.task)}</div>
                  <div class="item-card-meta">${esc(eq.name)}</div></div>
              </div>
              <div class="item-card-meta">
                ${fmtDateShort(rec.performed_date)}
                ${rec.performed_by  ? ' &bull; ' + esc(rec.performed_by) : ''}
                ${rec.next_due_date ? ' &bull; Next: ' + fmtDateShort(rec.next_due_date) : ''}
              </div>
              ${rec.notes ? `<div class="item-card-meta" style="margin-top:4px">${esc(rec.notes)}</div>` : ''}
            </div>`;
          }).join('')
        : '<div class="empty-state"><div class="empty-state-icon">📋</div><div class="empty-state-text">No maintenance records yet</div></div>';
    },

    openDetail(eqId) {
      const eq = this.equipment.find(e => e.id === eqId);
      if (!eq) return;
      State.maint.current = eq;

      document.getElementById('equipDetailTitle').textContent = eq.name;
      document.getElementById('equipDetailInfo').innerHTML =
        `<strong>Type:</strong> ${eqTypeLabel(eq.type)}` +
        (eq.year ? ` &bull; <strong>Year:</strong> ${eq.year}` : '') +
        (eq.description ? `<br>${esc(eq.description)}` : '');

      // Issues
      const issueList = this.issues.filter(i => i.equipment_id === eqId);
      const openFirst = [...issueList].sort((a,b) => {
        const stO = {open:0,in_progress:1,resolved:2};
        return (stO[a.status]||0) - (stO[b.status]||0) || b.reported_date.localeCompare(a.reported_date);
      });
      document.getElementById('equipDetailIssues').innerHTML = openFirst.length
        ? openFirst.map(i =>
            `<div class="issue-card${i.status==='resolved'?' resolved':''}" onclick="App.maint.openEditIssue('${i.id}')">
              <div class="issue-card-title">${esc(i.title)}</div>
              <div class="issue-card-meta">
                <span class="issue-sev issue-sev-${i.severity}">${i.severity}</span>
                <span class="issue-st issue-st-${i.status}">${i.status.replace('_',' ')}</span>
                <span>${fmtDateShort(i.reported_date)}${i.reported_by ? ' &bull; ' + esc(i.reported_by) : ''}</span>
              </div>
              ${i.notes ? `<div class="issue-card-meta" style="margin-top:3px">${esc(i.notes)}</div>` : ''}
            </div>`
          ).join('')
        : '<div style="color:var(--muted);font-size:.85rem;padding:4px 0">No issues logged</div>';

      // Maintenance records
      const recs = this.records.filter(r => r.equipment_id === eqId)
        .sort((a,b) => b.performed_date.localeCompare(a.performed_date));
      document.getElementById('equipDetailLog').innerHTML = recs.length
        ? recs.map(r =>
            `<div class="maint-record item-card" onclick="App.maint.openEditRecord('${r.id}')">
              <div class="maint-record-title">${esc(r.task)}</div>
              <div class="maint-record-meta">
                ${fmtDateShort(r.performed_date)}
                ${r.performed_by  ? ' &bull; ' + esc(r.performed_by) : ''}
                ${r.next_due_date ? ' &bull; Next: ' + fmtDateShort(r.next_due_date) : ''}
              </div>
              ${r.notes ? `<div class="maint-record-meta" style="margin-top:2px">${esc(r.notes)}</div>` : ''}
            </div>`
          ).join('')
        : '<div style="color:var(--muted);font-size:.85rem;padding:8px 0">No records yet</div>';

      openModal('equipDetailModal');
    },

    editEquipment() {
      const eq = State.maint.current;
      if (!eq) return;
      closeModal('equipDetailModal');
      this._equipForm(eq);
    },
    openAddEquipment() { this._equipForm(null); },
    duplicateEquipment(eqId) {
      const eq = this.equipment.find(e => e.id === eqId);
      if (!eq) return;
      closeModal('equipDetailModal');
      this._equipForm({ ...eq, id: '' }); // blank id = new record
      document.getElementById('equipmentModalTitle').textContent = 'Duplicate Equipment';
    },

    _equipForm(eq) {
      document.getElementById('equipmentModalTitle').textContent = eq ? 'Edit Equipment' : 'Add Equipment';
      document.getElementById('eqId').value          = eq?.id || '';
      document.getElementById('eqName').value        = eq?.name || '';
      document.getElementById('eqType').value        = eq?.type || 'tractor';
      document.getElementById('eqYear').value        = eq?.year || '';
      document.getElementById('eqDescription').value = eq?.description || '';
      document.getElementById('eqDeleteBtn').classList.toggle('hidden', !eq);
      document.getElementById('eqError').classList.add('hidden');
      openModal('equipmentModal');
    },

    async saveEquipment() {
      const id    = document.getElementById('eqId').value;
      const name  = document.getElementById('eqName').value.trim();
      const type  = document.getElementById('eqType').value;
      const year  = document.getElementById('eqYear').value;
      const desc  = document.getElementById('eqDescription').value.trim();
      const errEl = document.getElementById('eqError');
      if (!name) { showFormError(errEl, 'Name is required'); return; }
      const payload = { name, type, description: desc || null, year: year ? parseInt(year) : null, active: true };
      const result  = id ? await sbPatch('hub_equipment', 'id=eq.'+id, payload) : await sbPost('hub_equipment', payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('equipmentModal');
      await this.load(); this.renderEquipment(); App.sops.populateEquipmentSelect();
      showToast(id ? 'Equipment updated' : 'Equipment added', 'success');
    },

    async deleteEquipment() {
      const id = document.getElementById('eqId').value;
      if (!id || !confirm('Delete this equipment and all its maintenance records?')) return;
      const r = await sbDelete('hub_equipment', 'id=eq.'+id);
      if (r?._err) { showToast('Delete failed', 'error'); return; }
      closeModal('equipmentModal');
      await this.load(); this.renderEquipment();
      showToast('Equipment deleted', 'success');
    },

    openLogMaintenance(eqId) {
      document.getElementById('maintModalTitle').textContent = 'Log Maintenance';
      document.getElementById('maintId').value      = '';
      document.getElementById('maintTask').value    = '';
      document.getElementById('maintDate').value    = fmtDate(new Date());
      document.getElementById('maintBy').value      = '';
      document.getElementById('maintNextDue').value = '';
      document.getElementById('maintNotes').value   = '';
      document.getElementById('maintDeleteBtn').classList.add('hidden');
      document.getElementById('maintError').classList.add('hidden');
      this._populateEquipSel(eqId);
      openModal('maintModal');
    },
    openLogForCurrent() { closeModal('equipDetailModal'); this.openLogMaintenance(State.maint.current?.id); },
    openLogIssueForCurrent() { closeModal('equipDetailModal'); this.openLogIssue(State.maint.current?.id); },

    openLogIssue(eqId) {
      document.getElementById('issueModalTitle').textContent = 'Log Issue';
      document.getElementById('issueId').value             = '';
      document.getElementById('issueTitle').value          = '';
      document.getElementById('issueSeverity').value       = 'medium';
      document.getElementById('issueStatus').value         = 'open';
      document.getElementById('issueDate').value           = fmtDate(new Date());
      document.getElementById('issueBy').value             = '';
      document.getElementById('issueAssignedTo').value     = '';
      document.getElementById('issueResolvedDate').value   = '';
      document.getElementById('issueNotes').value          = '';
      document.getElementById('issueDeleteBtn').classList.add('hidden');
      document.getElementById('issueError').classList.add('hidden');
      document.getElementById('issueResolvedRow').classList.add('hidden');
      this._populateIssueEquipSel(eqId);
      openModal('issueModal');
    },

    openEditIssue(issueId) {
      const iss = this.issues.find(i => i.id === issueId);
      if (!iss) return;
      document.getElementById('issueModalTitle').textContent = 'Edit Issue';
      document.getElementById('issueId').value             = iss.id;
      document.getElementById('issueTitle').value          = iss.title;
      document.getElementById('issueSeverity').value       = iss.severity;
      document.getElementById('issueStatus').value         = iss.status;
      document.getElementById('issueDate').value           = iss.reported_date;
      document.getElementById('issueBy').value             = iss.reported_by || '';
      document.getElementById('issueAssignedTo').value     = iss.assigned_to || '';
      document.getElementById('issueResolvedDate').value   = iss.resolved_date || '';
      document.getElementById('issueNotes').value          = iss.notes || '';
      document.getElementById('issueDeleteBtn').classList.remove('hidden');
      document.getElementById('issueError').classList.add('hidden');
      document.getElementById('issueResolvedRow').classList.toggle('hidden', iss.status !== 'resolved');
      this._populateIssueEquipSel(iss.equipment_id);
      openModal('issueModal');
    },

    onIssueStatusChange() {
      const resolved = document.getElementById('issueStatus').value === 'resolved';
      document.getElementById('issueResolvedRow').classList.toggle('hidden', !resolved);
      if (resolved && !document.getElementById('issueResolvedDate').value)
        document.getElementById('issueResolvedDate').value = fmtDate(new Date());
    },

    _populateIssueEquipSel(selectedId) {
      document.getElementById('issueEquipmentSel').innerHTML = this.equipment.length
        ? this.equipment.map(e => `<option value="${e.id}" ${e.id===selectedId?'selected':''}>${esc(e.name)}</option>`).join('')
        : '<option value="">No equipment — add some first</option>';
    },

    async saveIssue() {
      const id      = document.getElementById('issueId').value;
      const eqId    = document.getElementById('issueEquipmentSel').value;
      const title   = document.getElementById('issueTitle').value.trim();
      const date    = document.getElementById('issueDate').value;
      const errEl   = document.getElementById('issueError');
      if (!eqId)  { showFormError(errEl, 'Select equipment'); return; }
      if (!title) { showFormError(errEl, 'Issue description is required'); return; }
      if (!date)  { showFormError(errEl, 'Date is required'); return; }
      const status = document.getElementById('issueStatus').value;
      const payload = {
        equipment_id:  eqId,
        title,
        severity:      document.getElementById('issueSeverity').value,
        status,
        reported_date: date,
        reported_by:   document.getElementById('issueBy').value.trim()           || null,
        assigned_to:   document.getElementById('issueAssignedTo').value.trim()   || null,
        resolved_date: status === 'resolved'
                         ? (document.getElementById('issueResolvedDate').value || null) : null,
        notes:         document.getElementById('issueNotes').value.trim()         || null,
      };
      const result = id ? await sbPatch('hub_equipment_issues','id=eq.'+id,payload) : await sbPost('hub_equipment_issues',payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('issueModal');
      await this.load();
      this._updateIssuesTabBadge();
      ({ equipment:()=>this.renderEquipment(), issues:()=>this.renderIssues(),
         upcoming:()=>this.renderUpcoming(), log:()=>this.renderLog() })[State.maint.tab]?.();
      showToast(id ? 'Issue updated' : 'Issue logged', 'success');
    },

    async deleteIssue() {
      const id = document.getElementById('issueId').value;
      if (!id || !confirm('Delete this issue?')) return;
      const r = await sbDelete('hub_equipment_issues','id=eq.'+id);
      if (r?._err) { showToast('Delete failed','error'); return; }
      closeModal('issueModal');
      await this.load();
      this._updateIssuesTabBadge();
      this.renderEquipment();
      showToast('Issue deleted','success');
    },

    openEditRecord(recId) {
      const rec = this.records.find(r => r.id === recId);
      if (!rec) return;
      document.getElementById('maintModalTitle').textContent  = 'Edit Record';
      document.getElementById('maintId').value      = rec.id;
      document.getElementById('maintTask').value    = rec.task;
      document.getElementById('maintDate').value    = rec.performed_date;
      document.getElementById('maintBy').value      = rec.performed_by || '';
      document.getElementById('maintNextDue').value = rec.next_due_date || '';
      document.getElementById('maintNotes').value   = rec.notes || '';
      document.getElementById('maintDeleteBtn').classList.remove('hidden');
      document.getElementById('maintError').classList.add('hidden');
      this._populateEquipSel(rec.equipment_id);
      openModal('maintModal');
    },

    _populateEquipSel(selectedId) {
      document.getElementById('maintEquipmentSel').innerHTML = this.equipment.length
        ? this.equipment.map(e => `<option value="${e.id}" ${e.id===selectedId?'selected':''}>${esc(e.name)}</option>`).join('')
        : '<option value="">No equipment — add some first</option>';
    },

    async saveMaintenance() {
      const id      = document.getElementById('maintId').value;
      const eqId    = document.getElementById('maintEquipmentSel').value;
      const task    = document.getElementById('maintTask').value.trim();
      const date    = document.getElementById('maintDate').value;
      const errEl   = document.getElementById('maintError');
      if (!eqId) { showFormError(errEl, 'Select equipment'); return; }
      if (!task) { showFormError(errEl, 'Task is required'); return; }
      if (!date) { showFormError(errEl, 'Date is required'); return; }
      const payload = {
        equipment_id: eqId, task, performed_date: date,
        performed_by:   document.getElementById('maintBy').value.trim()      || null,
        next_due_date:  document.getElementById('maintNextDue').value         || null,
        notes:          document.getElementById('maintNotes').value.trim()    || null,
      };
      const result = id ? await sbPatch('hub_maintenance_records','id=eq.'+id,payload) : await sbPost('hub_maintenance_records',payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('maintModal');
      await this.load();
      ({ equipment:()=>this.renderEquipment(), upcoming:()=>this.renderUpcoming(), log:()=>this.renderLog() })[State.maint.tab]?.();
      showToast(id ? 'Record updated' : 'Maintenance logged', 'success');
    },

    async deleteRecord() {
      const id = document.getElementById('maintId').value;
      if (!id || !confirm('Delete this maintenance record?')) return;
      const r = await sbDelete('hub_maintenance_records','id=eq.'+id);
      if (r?._err) { showToast('Delete failed','error'); return; }
      closeModal('maintModal');
      await this.load();
      State.maint.tab === 'log' ? this.renderLog() : this.renderEquipment();
      showToast('Record deleted','success');
    },
  },

  // ── SOPs ──────────────────────────────────────────────────────
  sops: {
    data: [],
    current: null,

    async load() {
      const rows = await sbGet('hub_sop_documents', 'order=category.asc,title.asc');
      if (rows && !rows._err) this.data = rows;
      this.populateEquipmentSelect();
    },

    populateEquipmentSelect() {
      const sel = document.getElementById('sopEquipment');
      if (!sel) return;
      sel.innerHTML = '<option value="">— Not equipment-specific —</option>' +
        App.maint.equipment.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
    },

    filterCat(cat, btn) {
      State.sops.catFilter = cat;
      document.querySelectorAll('#sopsView .filter-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      this.render();
    },

    render() {
      const filtered = State.sops.catFilter === 'all' ? this.data
        : this.data.filter(s => s.category === State.sops.catFilter);
      document.getElementById('sopsList').innerHTML = filtered.length
        ? filtered.map(sop => {
            const eqName = App.maint.equipment.find(e => e.id === sop.equipment_id)?.name || '';
            return `<div class="item-card" onclick="App.sops.viewSOP('${sop.id}')">
              <div class="item-card-header">
                <div style="flex:1;min-width:0">
                  <div class="item-card-title">${esc(sop.title)}</div>
                  ${eqName ? `<div class="item-card-meta">${esc(eqName)}</div>` : ''}
                </div>
                <div style="display:flex;gap:4px;align-items:center;flex-shrink:0">
                  ${sop.doc_link ? `<span class="sop-cat-badge sop-doc-badge">&#128196; Doc</span>` : ''}
                  <span class="sop-cat-badge">${esc(catLabel(sop.category))}</span>
                </div>
              </div>
              <div class="item-card-meta" style="margin-top:4px">v${esc(sop.version||'1.0')} &bull; ${fmtDateShort(sop.updated_at||sop.created_at)}</div>
            </div>`;
          }).join('')
        : '<div class="empty-state"><div class="empty-state-icon">📖</div><div class="empty-state-text">No SOPs in this category</div></div>';
    },

    viewSOP(sopId) {
      const sop = this.data.find(s => s.id === sopId);
      if (!sop) return;
      this.current = sop;
      const eqName = App.maint.equipment.find(e => e.id === sop.equipment_id)?.name;
      document.getElementById('sopViewTitle').textContent = sop.title;
      document.getElementById('sopViewMeta').innerHTML =
        `<span class="sop-cat-badge">${esc(catLabel(sop.category))}</span>` +
        (eqName ? `<span>${esc(eqName)}</span>` : '') +
        `<span>v${esc(sop.version||'1.0')}</span><span>Updated ${fmtDateShort(sop.updated_at||sop.created_at)}</span>`;
      const docLinkEl = document.getElementById('sopViewDocLink');
      if (sop.doc_link) {
        document.getElementById('sopViewDocAnchor').href = sop.doc_link;
        docLinkEl.classList.remove('hidden');
      } else {
        docLinkEl.classList.add('hidden');
      }
      const contentEl = document.getElementById('sopViewContent');
      contentEl.textContent = sop.content || '';
      contentEl.classList.toggle('hidden', !sop.content);
      openModal('sopViewModal');
    },

    editCurrent() { if (this.current) { closeModal('sopViewModal'); this._sopForm(this.current); } },
    openAdd()     { this._sopForm(null); },

    _sopForm(sop) {
      document.getElementById('sopModalTitle').textContent   = sop ? 'Edit SOP' : 'Add SOP';
      document.getElementById('sopId').value        = sop?.id || '';
      document.getElementById('sopTitle').value     = sop?.title || '';
      document.getElementById('sopCategory').value  = sop?.category || 'general';
      document.getElementById('sopVersion').value   = sop?.version || '1.0';
      document.getElementById('sopEquipment').value = sop?.equipment_id || '';
      document.getElementById('sopDocLink').value   = sop?.doc_link || '';
      document.getElementById('sopContent').value   = sop?.content || '';
      document.getElementById('sopDeleteBtn').classList.toggle('hidden', !sop);
      document.getElementById('sopError').classList.add('hidden');
      openModal('sopModal');
    },

    async saveSOP() {
      const id      = document.getElementById('sopId').value;
      const title   = document.getElementById('sopTitle').value.trim();
      const content = document.getElementById('sopContent').value.trim();
      const docLink = document.getElementById('sopDocLink').value.trim();
      const errEl   = document.getElementById('sopError');
      if (!title)              { showFormError(errEl, 'Title is required');                  return; }
      if (!content && !docLink){ showFormError(errEl, 'Add content or a document link');     return; }
      const now = new Date().toISOString();
      const payload = {
        title,
        category:     document.getElementById('sopCategory').value,
        version:      document.getElementById('sopVersion').value.trim() || '1.0',
        equipment_id: document.getElementById('sopEquipment').value || null,
        doc_link:     docLink || null,
        content:      content || null,
        updated_at:   now,
      };
      const result = id
        ? await sbPatch('hub_sop_documents','id=eq.'+id, payload)
        : await sbPost('hub_sop_documents', { ...payload, created_at: now });
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('sopModal');
      await this.load(); this.render();
      showToast(id ? 'SOP updated' : 'SOP added', 'success');
    },

    async deleteSOP() {
      const id = document.getElementById('sopId').value;
      if (!id || !confirm('Delete this SOP?')) return;
      const r = await sbDelete('hub_sop_documents','id=eq.'+id);
      if (r?._err) { showToast('Delete failed','error'); return; }
      closeModal('sopModal');
      await this.load(); this.render();
      showToast('SOP deleted','success');
    },
  },

  // ── Members ──────────────────────────────────────────────────
  members: {
    roster: [],
    types: [],
    payments: [],
    _import: null, // transient CSV-import wizard state

    async load() {
      const [roster, types, payments] = await Promise.all([
        sbGet('hub_membership_roster', 'order=last_name.asc&select=*'),
        sbGet('hub_membership_types', 'order=display_order.asc,name.asc&select=*'),
        sbGet('hub_membership_payments', 'order=paid_at.desc&select=*'),
      ]);
      if (roster   && !roster._err)   this.roster = roster;
      if (types    && !types._err)    this.types = types;
      if (payments && !payments._err) this.payments = payments;
    },

    showTab(tab, btn) {
      State.members.tab = tab;
      document.querySelectorAll('#membersView .tab-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      document.querySelectorAll('#membersView .tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tab + 'Tab').classList.add('active');
    },

    filterStatus(status, btn) {
      State.members.statusFilter = status;
      document.querySelectorAll('#rosterTab .filter-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      this.showTab('roster', document.querySelector('#membersView .tab-btn'));
      this.renderRoster();
    },

    _typeName(id) { return this.types.find(t => t.id === id)?.name || ''; },
    _memberName(id) { const m = this.roster.find(x => x.id === id); return m ? `${m.first_name} ${m.last_name}` : ''; },
    _initials(m) { return ((m.first_name?.[0]||'') + (m.last_name?.[0]||'')).toUpperCase() || '?'; },

    // Shared by renderRoster() and the export/copy actions, so "export" always
    // means exactly what's currently on screen (e.g. filter to Active first).
    _filteredRoster() {
      const q      = (document.getElementById('memberSearch')?.value || '').trim().toLowerCase();
      const status = State.members.statusFilter;
      const typeF  = document.getElementById('memberTypeFilter')?.value || '';
      let rows = this.roster;
      if (status === 'arrears') rows = rows.filter(m => m.in_arrears);
      else if (status !== 'all') rows = rows.filter(m => m.status === status);
      if (typeF === '__none__') rows = rows.filter(m => !m.membership_type_id);
      else if (typeF) rows = rows.filter(m => m.membership_type_id === typeF);
      if (q) rows = rows.filter(m =>
        (m.first_name + ' ' + m.last_name).toLowerCase().includes(q) ||
        (m.email || '').toLowerCase().includes(q) ||
        (m.membership_number || '').toLowerCase().includes(q));
      return [...rows].sort((a,b) => (a.last_name||'').localeCompare(b.last_name||'') || (a.first_name||'').localeCompare(b.first_name||''));
    },

    renderRoster() {
      const rows = this._filteredRoster();

      document.getElementById('rosterCount').textContent =
        `${rows.length} of ${this.roster.length} member${this.roster.length!==1?'s':''}`;

      document.getElementById('rosterList').innerHTML = rows.length ? rows.map(m => `
        <div class="item-card" onclick="App.members.openDetail('${m.id}')">
          <div class="item-card-header">
            <div class="item-icon member-icon-${m.status}">${esc(this._initials(m))}</div>
            <div style="flex:1;min-width:0">
              <div class="item-card-title">${esc(m.first_name)} ${esc(m.last_name)}</div>
              <div class="item-card-meta"><span class="type-chip">${esc(this._typeName(m.membership_type_id) || 'No type')}</span>${m.email ? ' &bull; ' + esc(m.email) : ''}</div>
            </div>
            <div class="item-card-badge badge-${m.status}">${m.status}</div>
          </div>
          ${m.in_arrears ? '<div class="item-card-meta" style="color:var(--danger)">⚠ In arrears</div>' : ''}
        </div>`).join('')
        : '<div class="empty-state"><div class="empty-state-icon">👥</div><div class="empty-state-text">No members found</div></div>';
    },

    // Both act on whatever's currently filtered/searched — filter to Active
    // (and a type, if you're segmenting) before using either of these.
    exportCSV() {
      const rows = this._filteredRoster().filter(m => m.email);
      if (!rows.length) { showToast('No members with an email in the current view', 'error'); return; }
      const csvField = v => { const s = String(v ?? ''); return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
      const lines = ['first_name,last_name,email']
        .concat(rows.map(m => [m.first_name, m.last_name, m.email].map(csvField).join(',')));
      const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `gbsc-members-${fmtDate(new Date())}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast(`Exported ${rows.length} member${rows.length!==1?'s':''}`, 'success');
    },

    async copyEmails() {
      const emails = this._filteredRoster().map(m => m.email).filter(Boolean);
      if (!emails.length) { showToast('No members with an email in the current view', 'error'); return; }
      const text = emails.join(', ');
      try {
        await navigator.clipboard.writeText(text);
        showToast(`Copied ${emails.length} email${emails.length!==1?'s':''}`, 'success');
      } catch {
        window.prompt(`Copy ${emails.length} email${emails.length!==1?'s':''}:`, text);
      }
    },

    renderTypes() {
      document.getElementById('typesList').innerHTML = this.types.length ? this.types.map(t => `
        <div class="item-card" onclick="App.members.openEditType('${t.id}')">
          <div class="item-card-header">
            <div class="item-icon" style="background:rgba(39,174,96,.15);color:var(--success)">€</div>
            <div style="flex:1;min-width:0">
              <div class="item-card-title">${esc(t.name)}</div>
              <div class="item-card-meta">${this.roster.filter(m=>m.membership_type_id===t.id).length} member(s)</div>
            </div>
            <div class="item-card-badge ${t.active ? 'badge-ok' : 'badge-lapsed'}">${t.active ? 'Active' : 'Inactive'}</div>
          </div>
          <div class="item-card-meta">€${(t.annual_fee_cents/100).toFixed(2)} / year</div>
        </div>`).join('')
        : '<div class="empty-state"><div class="empty-state-icon">💳</div><div class="empty-state-text">No membership types yet</div></div>';
      this._populateTypeSelects();
      this._populateTypeFilter();
    },

    _populateTypeFilter() {
      const sel = document.getElementById('memberTypeFilter');
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = '<option value="">All Types</option>' +
        this.types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('') +
        '<option value="__none__">— No Type —</option>';
      if ([...sel.options].some(o => o.value === current)) sel.value = current;
    },

    _populateTypeSelects() {
      const sel = document.getElementById('memType');
      if (sel) sel.innerHTML = '<option value="">— None —</option>' + this.types.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('');
    },

    _populatePrimarySelect(excludeId) {
      const sel = document.getElementById('memPrimary');
      if (!sel) return;
      const others = this.roster.filter(m => m.id !== excludeId)
        .sort((a,b) => (a.last_name||'').localeCompare(b.last_name||''));
      sel.innerHTML = '<option value="">— None (independent) —</option>' +
        others.map(m => `<option value="${m.id}">${esc(m.first_name)} ${esc(m.last_name)}</option>`).join('');
    },

    // ── Member CRUD ────────────────────────────────────────────
    openAdd() { this._memberForm(null); },
    editCurrent() { if (State.members.current) { closeModal('memberDetailModal'); this._memberForm(State.members.current); } },

    openDetail(id) {
      const m = this.roster.find(x => x.id === id);
      if (!m) return;
      State.members.current = m;

      document.getElementById('memberDetailTitle').textContent = `${m.first_name} ${m.last_name}`;
      const type = this._typeName(m.membership_type_id) || '—';
      const addrParts = [m.address_line1, m.address_line2, m.city, m.county, m.eircode].filter(Boolean).join(', ');
      document.getElementById('memberDetailInfo').innerHTML = `
        <strong>Type:</strong> ${esc(type)} &bull; <strong>Status:</strong> ${m.status}${m.in_arrears ? ' <span style="color:var(--danger)">(in arrears)</span>' : ''}<br>
        ${m.email ? `<strong>Email:</strong> ${esc(m.email)}<br>` : ''}
        ${m.mobile ? `<strong>Mobile:</strong> ${esc(m.mobile)}<br>` : ''}
        ${m.phone  ? `<strong>Phone:</strong> ${esc(m.phone)}<br>` : ''}
        ${addrParts ? `<strong>Address:</strong> ${esc(addrParts)}<br>` : ''}
        ${m.joined_date  ? `<strong>Joined:</strong> ${fmtDateShort(m.joined_date)} &bull; ` : ''}${m.renewal_date ? `<strong>Renewal due:</strong> ${fmtDateShort(m.renewal_date)}` : ''}
        ${m.membership_number ? `<br><strong>Membership #:</strong> ${esc(m.membership_number)}` : ''}
        ${m.primary_member_id ? `<br><strong>Household head:</strong> ${esc(this._memberName(m.primary_member_id))}` : ''}
        ${m.notes ? `<br><strong>Notes:</strong> ${esc(m.notes)}` : ''}
      `;

      const pays = this.payments.filter(p => p.member_id === id).sort((a,b) => b.period_year - a.period_year);
      document.getElementById('memberDetailPayments').innerHTML = pays.length ? pays.map(p => `
        <div class="maint-record" onclick="App.members.openEditPayment('${p.id}')">
          <div class="maint-record-title">${p.period_year} &bull; €${(p.amount_cents/100).toFixed(2)}</div>
          <div class="maint-record-meta">${p.method.replace('_',' ')} &bull; ${fmtDateShort(p.paid_at)}${p.notes ? ' &bull; ' + esc(p.notes) : ''}</div>
        </div>`).join('')
        : '<div style="color:var(--muted);font-size:.85rem;padding:8px 0">No payments logged</div>';

      openModal('memberDetailModal');
    },

    _memberForm(m) {
      document.getElementById('memberModalTitle').textContent = m ? 'Edit Member' : 'Add Member';
      document.getElementById('memId').value        = m?.id || '';
      document.getElementById('memFirstName').value = m?.first_name || '';
      document.getElementById('memLastName').value  = m?.last_name || '';
      document.getElementById('memEmail').value     = m?.email || '';
      document.getElementById('memMobile').value    = m?.mobile || '';
      document.getElementById('memPhone').value     = m?.phone || '';
      this._populateTypeSelects();
      document.getElementById('memType').value      = m?.membership_type_id || '';
      document.getElementById('memStatus').value    = m?.status || 'active';
      document.getElementById('memJoined').value    = m?.joined_date || '';
      document.getElementById('memRenewal').value   = m?.renewal_date || '';
      document.getElementById('memArrears').checked = !!m?.in_arrears;
      this._populatePrimarySelect(m?.id || '');
      document.getElementById('memPrimary').value   = m?.primary_member_id || '';
      document.getElementById('memNumber').value    = m?.membership_number || '';
      document.getElementById('memAddr1').value     = m?.address_line1 || '';
      document.getElementById('memAddr2').value     = m?.address_line2 || '';
      document.getElementById('memCity').value      = m?.city || '';
      document.getElementById('memCounty').value    = m?.county || '';
      document.getElementById('memEircode').value   = m?.eircode || '';
      document.getElementById('memDob').value       = m?.date_of_birth || '';
      document.getElementById('memEmName').value    = m?.emergency_contact_name || '';
      document.getElementById('memEmPhone').value   = m?.emergency_contact_phone || '';
      document.getElementById('memNotes').value     = m?.notes || '';
      document.getElementById('memDeleteBtn').classList.toggle('hidden', !m);
      document.getElementById('memError').classList.add('hidden');
      openModal('memberModal');
    },

    async saveMember() {
      const id        = document.getElementById('memId').value;
      const firstName = document.getElementById('memFirstName').value.trim();
      const lastName  = document.getElementById('memLastName').value.trim();
      const errEl     = document.getElementById('memError');
      if (!firstName || !lastName) { showFormError(errEl, 'First and last name are required'); return; }
      const payload = {
        first_name: firstName,
        last_name:  lastName,
        email:      document.getElementById('memEmail').value.trim() || null,
        mobile:     document.getElementById('memMobile').value.trim() || null,
        phone:      document.getElementById('memPhone').value.trim() || null,
        membership_type_id: document.getElementById('memType').value || null,
        status:     document.getElementById('memStatus').value,
        joined_date:  document.getElementById('memJoined').value || null,
        renewal_date: document.getElementById('memRenewal').value || null,
        in_arrears: document.getElementById('memArrears').checked,
        primary_member_id: document.getElementById('memPrimary').value || null,
        membership_number: document.getElementById('memNumber').value.trim() || null,
        address_line1: document.getElementById('memAddr1').value.trim() || null,
        address_line2: document.getElementById('memAddr2').value.trim() || null,
        city:          document.getElementById('memCity').value.trim() || null,
        county:        document.getElementById('memCounty').value.trim() || null,
        eircode:       document.getElementById('memEircode').value.trim() || null,
        date_of_birth: document.getElementById('memDob').value || null,
        emergency_contact_name:  document.getElementById('memEmName').value.trim() || null,
        emergency_contact_phone: document.getElementById('memEmPhone').value.trim() || null,
        notes: document.getElementById('memNotes').value.trim() || null,
        updated_at: new Date().toISOString(),
      };
      if (id && payload.primary_member_id === id) { showFormError(errEl, 'A member cannot be their own household head'); return; }
      const result = id ? await sbPatch('hub_membership_roster', 'id=eq.'+id, payload) : await sbPost('hub_membership_roster', payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('memberModal');
      await this.load(); this.renderRoster(); App.renderPortal();
      showToast(id ? 'Member updated' : 'Member added', 'success');
    },

    async deleteMember() {
      const id = document.getElementById('memId').value;
      if (!id || !confirm('Delete this member and their payment history? This cannot be undone.')) return;
      const r = await sbDelete('hub_membership_roster', 'id=eq.'+id);
      if (r?._err) { showToast('Delete failed', 'error'); return; }
      closeModal('memberModal');
      closeModal('memberDetailModal');
      await this.load(); this.renderRoster(); App.renderPortal();
      showToast('Member deleted', 'success');
    },

    // ── Payments ────────────────────────────────────────────────
    openLogPaymentForCurrent() { this._paymentForm(null, State.members.current?.id); },
    openEditPayment(id) {
      const p = this.payments.find(x => x.id === id);
      if (p) this._paymentForm(p, p.member_id);
    },

    _paymentForm(p, memberId) {
      document.getElementById('paymentModalTitle').textContent = p ? 'Edit Payment' : 'Log Payment';
      document.getElementById('payId').value       = p?.id || '';
      document.getElementById('payMemberId').value = memberId || '';
      document.getElementById('payYear').value     = p?.period_year || new Date().getFullYear();
      document.getElementById('payAmount').value   = p ? (p.amount_cents/100).toFixed(2) : '';
      document.getElementById('payMethod').value   = p?.method || 'cash';
      document.getElementById('payDate').value     = p ? p.paid_at.slice(0,10) : fmtDate(new Date());
      document.getElementById('payNotes').value    = p?.notes || '';
      document.getElementById('payDeleteBtn').classList.toggle('hidden', !p);
      document.getElementById('payError').classList.add('hidden');
      openModal('paymentModal');
    },

    async savePayment() {
      const id       = document.getElementById('payId').value;
      const memberId = document.getElementById('payMemberId').value;
      const year     = parseInt(document.getElementById('payYear').value, 10);
      const amount   = parseFloat(document.getElementById('payAmount').value);
      const errEl    = document.getElementById('payError');
      if (!memberId)             { showFormError(errEl, 'No member selected'); return; }
      if (!year)                 { showFormError(errEl, 'Year is required'); return; }
      if (isNaN(amount) || amount < 0) { showFormError(errEl, 'Enter a valid amount'); return; }
      const member = this.roster.find(m => m.id === memberId);
      const payload = {
        member_id: memberId,
        membership_type_id: member?.membership_type_id || null,
        period_year: year,
        amount_cents: Math.round(amount * 100),
        method: document.getElementById('payMethod').value,
        paid_at: document.getElementById('payDate').value ? document.getElementById('payDate').value + 'T12:00:00' : new Date().toISOString(),
        notes: document.getElementById('payNotes').value.trim() || null,
      };
      const result = id ? await sbPatch('hub_membership_payments', 'id=eq.'+id, payload) : await sbPost('hub_membership_payments', payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('paymentModal');
      await this.load();
      if (State.members.current) this.openDetail(State.members.current.id);
      this.renderRoster();
      showToast(id ? 'Payment updated' : 'Payment logged', 'success');
    },

    async deletePayment() {
      const id = document.getElementById('payId').value;
      if (!id || !confirm('Delete this payment record?')) return;
      const r = await sbDelete('hub_membership_payments', 'id=eq.'+id);
      if (r?._err) { showToast('Delete failed', 'error'); return; }
      closeModal('paymentModal');
      await this.load();
      if (State.members.current) this.openDetail(State.members.current.id);
      showToast('Payment deleted', 'success');
    },

    // ── Membership Types ────────────────────────────────────────
    openAddType() { this._typeForm(null); },
    openEditType(id) { const t = this.types.find(x => x.id === id); if (t) this._typeForm(t); },

    _typeForm(t) {
      document.getElementById('membershipTypeModalTitle').textContent = t ? 'Edit Membership Type' : 'Add Membership Type';
      document.getElementById('mtId').value     = t?.id || '';
      document.getElementById('mtName').value   = t?.name || '';
      document.getElementById('mtFee').value    = t ? (t.annual_fee_cents/100).toFixed(2) : '';
      document.getElementById('mtActive').checked = t ? !!t.active : true;
      document.getElementById('mtDeleteBtn').classList.toggle('hidden', !t);
      document.getElementById('mtError').classList.add('hidden');
      openModal('membershipTypeModal');
    },

    async saveType() {
      const id   = document.getElementById('mtId').value;
      const name = document.getElementById('mtName').value.trim();
      const fee  = parseFloat(document.getElementById('mtFee').value);
      const errEl = document.getElementById('mtError');
      if (!name) { showFormError(errEl, 'Name is required'); return; }
      if (isNaN(fee) || fee < 0) { showFormError(errEl, 'Enter a valid fee'); return; }
      const payload = { name, annual_fee_cents: Math.round(fee * 100), active: document.getElementById('mtActive').checked, updated_at: new Date().toISOString() };
      const result = id ? await sbPatch('hub_membership_types', 'id=eq.'+id, payload) : await sbPost('hub_membership_types', payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('membershipTypeModal');
      await this.load(); this.renderTypes(); this.renderRoster();
      showToast(id ? 'Type updated' : 'Type added', 'success');
    },

    async deleteType() {
      const id = document.getElementById('mtId').value;
      if (!id || !confirm('Delete this membership type? Members using it will be left with no type, not deleted.')) return;
      const r = await sbDelete('hub_membership_types', 'id=eq.'+id);
      if (r?._err) { showToast('Delete failed', 'error'); return; }
      closeModal('membershipTypeModal');
      await this.load(); this.renderTypes(); this.renderRoster();
      showToast('Type deleted', 'success');
    },

    // ── CSV Import ──────────────────────────────────────────────
    _importFields: [
      { key: 'first_name',        label: 'First Name',          guesses: ['first_name','firstname','first'] },
      { key: 'last_name',         label: 'Last Name',           guesses: ['last_name','lastname','surname','last'] },
      { key: 'email',             label: 'Email',                guesses: ['email','e-mail'] },
      { key: 'mobile',            label: 'Mobile',               guesses: ['mobile','cell'] },
      { key: 'phone',             label: 'Phone (other)',        guesses: ['phone','telephone','tel'] },
      { key: 'address_line1',     label: 'Address Line 1',       guesses: ['street','address1','address_line1','addr1'] },
      { key: 'address_line2',     label: 'Address Line 2',       guesses: ['locality','address2','address_line2','addr2'] },
      { key: 'city',              label: 'City / Town',          guesses: ['city','town'] },
      { key: 'county',            label: 'County',               guesses: ['county','state'] },
      { key: 'eircode',           label: 'Eircode / Postcode',   guesses: ['post_code','postcode','postal_code','eircode','zip'] },
      { key: 'date_of_birth',     label: 'Date of Birth',        guesses: ['birthday','dob','date_of_birth'] },
      { key: 'membership_number', label: 'Membership Number',    guesses: ['uid','membership_number','member_no','id'] },
      { key: 'membership_type',   label: 'Membership Type',      guesses: ['membership_types','membership_type','type'] },
      { key: 'status_source',     label: 'Status (for arrears)', guesses: ['membership_status','status'] },
      { key: 'joined_date',       label: 'Joined Date',          guesses: ['membership_started','joined','join_date','start_date'] },
      { key: 'renewal_date',      label: 'Renewal Date',         guesses: ['membership_ending','renewal','end_date','expiry'] },
    ],

    openImport() {
      this._import = { headers: [], rows: [], mapping: {}, mapped: [], newTypes: [] };
      document.getElementById('importFile').value = '';
      document.getElementById('importPaste').value = '';
      document.getElementById('importError1').classList.add('hidden');
      document.getElementById('importStep1').classList.remove('hidden');
      document.getElementById('importStep2').classList.add('hidden');
      document.getElementById('importStep3').classList.add('hidden');
      document.getElementById('importBackBtn').classList.add('hidden');
      document.getElementById('importNextBtn').textContent = 'Parse File';
      openModal('importModal');
    },

    importFileChosen(ev) {
      const file = ev.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { document.getElementById('importPaste').value = String(reader.result || ''); };
      reader.readAsText(file);
    },

    _parseCSV(text) {
      // Quote-aware CSV parser: handles "a,b" quoted fields, "" escaped quotes, \r\n.
      const rows = [];
      let row = [], field = '', inQuotes = false;
      for (let i = 0; i < text.length; i++) {
        const c = text[i], next = text[i+1];
        if (inQuotes) {
          if (c === '"' && next === '"') { field += '"'; i++; }
          else if (c === '"') { inQuotes = false; }
          else { field += c; }
        } else {
          if (c === '"') inQuotes = true;
          else if (c === ',') { row.push(field); field = ''; }
          else if (c === '\r') { /* skip */ }
          else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
          else field += c;
        }
      }
      if (field.length || row.length) { row.push(field); rows.push(row); }
      const filtered = rows.filter(r => r.some(f => f.trim() !== ''));
      if (!filtered.length) return { headers: [], rows: [] };
      const headers = filtered[0].map(h => h.trim());
      return { headers, rows: filtered.slice(1) };
    },

    _guessColumn(headers, guesses) {
      const lower = headers.map(h => h.toLowerCase());
      for (const g of guesses) {
        const i = lower.indexOf(g.toLowerCase());
        if (i !== -1) return headers[i];
      }
      for (const g of guesses) {
        const i = lower.findIndex(h => h.includes(g.toLowerCase()));
        if (i !== -1) return headers[i];
      }
      return '';
    },

    _parseFlexDate(s) {
      if (!s) return null;
      s = s.trim();
      if (!s) return null;
      const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (iso) return iso[0].slice(0,10);
      const d = new Date(s);
      if (!isNaN(d.getTime())) return fmtDate(d);
      return null;
    },

    importNext() {
      if (!document.getElementById('importStep1').classList.contains('hidden')) return this._importParseStep();
      if (!document.getElementById('importStep2').classList.contains('hidden')) return this._importPreviewStep();
      if (!document.getElementById('importStep3').classList.contains('hidden')) return this._importCommitStep();
    },

    importBack() {
      if (!document.getElementById('importStep3').classList.contains('hidden')) {
        document.getElementById('importStep3').classList.add('hidden');
        document.getElementById('importStep2').classList.remove('hidden');
        document.getElementById('importNextBtn').textContent = 'Preview';
      } else if (!document.getElementById('importStep2').classList.contains('hidden')) {
        document.getElementById('importStep2').classList.add('hidden');
        document.getElementById('importStep1').classList.remove('hidden');
        document.getElementById('importBackBtn').classList.add('hidden');
        document.getElementById('importNextBtn').textContent = 'Parse File';
      }
    },

    _importParseStep() {
      const text = document.getElementById('importPaste').value;
      const errEl = document.getElementById('importError1');
      const { headers, rows } = this._parseCSV(text);
      if (!headers.length || !rows.length) { showFormError(errEl, 'Could not find any rows — paste CSV text or choose a file first'); return; }
      errEl.classList.add('hidden');
      this._import.headers = headers;
      this._import.rows = rows;

      document.getElementById('importMapGrid').innerHTML = this._importFields.map(f => {
        const guess = this._guessColumn(headers, f.guesses);
        const opts = ['<option value="">— Skip —</option>']
          .concat(headers.map(h => `<option value="${esc(h)}"${h === guess ? ' selected' : ''}>${esc(h)}</option>`));
        return `<div class="form-group"><label>${esc(f.label)}</label><select data-field="${f.key}">${opts.join('')}</select></div>`;
      }).join('');

      document.getElementById('importStep1').classList.add('hidden');
      document.getElementById('importStep2').classList.remove('hidden');
      document.getElementById('importBackBtn').classList.remove('hidden');
      document.getElementById('importNextBtn').textContent = 'Preview';
    },

    _importPreviewStep() {
      const mapping = {};
      document.querySelectorAll('#importMapGrid select').forEach(sel => { mapping[sel.dataset.field] = sel.value; });
      this._import.mapping = mapping;

      const idx = {};
      this._import.headers.forEach((h, i) => { idx[h] = i; });
      const col = (row, field) => { const h = mapping[field]; return h && idx[h] !== undefined ? (row[idx[h]] || '').trim() : ''; };

      const mapped = this._import.rows.map(row => {
        const statusSrc = col(row, 'status_source');
        return {
          first_name:  col(row, 'first_name'),
          last_name:   col(row, 'last_name'),
          email:       col(row, 'email') || null,
          mobile:      col(row, 'mobile') || null,
          phone:       col(row, 'phone') || null,
          address_line1: col(row, 'address_line1') || null,
          address_line2: col(row, 'address_line2') || null,
          city:        col(row, 'city') || null,
          county:      col(row, 'county') || null,
          eircode:     col(row, 'eircode') || null,
          date_of_birth: this._parseFlexDate(col(row, 'date_of_birth')),
          membership_number: col(row, 'membership_number') || null,
          membership_type_name: col(row, 'membership_type') || null,
          status: 'active',
          in_arrears: /arrears/i.test(statusSrc),
          joined_date:  this._parseFlexDate(col(row, 'joined_date')),
          renewal_date: this._parseFlexDate(col(row, 'renewal_date')),
        };
      }).filter(m => m.first_name || m.last_name);

      const errEl = document.getElementById('importError2');
      if (!mapped.length) { showFormError(errEl, 'No rows have a first or last name — check your column mapping'); return; }
      errEl.classList.add('hidden');
      this._import.mapped = mapped;

      const newTypes = [...new Set(mapped.map(m => m.membership_type_name).filter(Boolean))]
        .filter(name => !this.types.some(t => t.name.toLowerCase() === name.toLowerCase()));
      this._import.newTypes = newTypes;

      const arrearsCount = mapped.filter(m => m.in_arrears).length;
      document.getElementById('importSummary').innerHTML =
        `<strong>${mapped.length}</strong> members will be imported, all set to <strong>Active</strong> status` +
        (arrearsCount ? ` (${arrearsCount} flagged in arrears)` : '') + '.' +
        (newTypes.length ? `<br>${newTypes.length} new membership type(s) will be created: ${newTypes.map(esc).join(', ')} (fee €0 — set real fees under Fee Schedule afterward).` : '') +
        `<br>Family/household links aren't set automatically — link a dependent to their household head afterward via Edit Member → Household Head.` +
        (mapping.membership_number ? `<br>Rows with a Membership Number matching an existing member will be <strong>updated</strong> rather than duplicated.` : '');

      const previewRows = mapped.slice(0, 10);
      document.getElementById('importPreviewWrap').innerHTML = `
        <div class="import-preview-scroll"><table class="import-preview-table">
          <thead><tr><th>Name</th><th>Email</th><th>Mobile</th><th>Type</th><th>Arrears</th></tr></thead>
          <tbody>${previewRows.map(m => `<tr>
            <td>${esc(m.first_name)} ${esc(m.last_name)}</td>
            <td>${esc(m.email||'')}</td>
            <td>${esc(m.mobile||'')}</td>
            <td>${esc(m.membership_type_name||'')}</td>
            <td>${m.in_arrears ? '⚠' : ''}</td>
          </tr>`).join('')}</tbody>
        </table></div>
        ${mapped.length > previewRows.length ? `<div class="form-hint">…and ${mapped.length - previewRows.length} more</div>` : ''}`;

      document.getElementById('importStep2').classList.add('hidden');
      document.getElementById('importStep3').classList.remove('hidden');
      document.getElementById('importNextBtn').textContent = `Import ${mapped.length} Member${mapped.length!==1?'s':''}`;
    },

    async _importCommitStep() {
      const errEl = document.getElementById('importError3');
      const btn = document.getElementById('importNextBtn');
      btn.disabled = true;
      const origText = btn.textContent;
      btn.textContent = 'Importing…';
      try {
        // Create any new membership types first, then look up ids.
        for (const name of this._import.newTypes) {
          const r = await sbPost('hub_membership_types', { name, annual_fee_cents: 0, active: true });
          if (r?._err) throw new Error('Creating type "' + name + '": ' + r._err);
        }
        if (this._import.newTypes.length) await this.load();
        const typeByName = {};
        this.types.forEach(t => { typeByName[t.name.toLowerCase()] = t.id; });

        const toInsert = this._import.mapped.map(m => {
          const { membership_type_name, ...rest } = m;
          return { ...rest, membership_type_id: membership_type_name ? (typeByName[membership_type_name.toLowerCase()] || null) : null };
        });

        const withNumber    = toInsert.filter(m => m.membership_number);
        const withoutNumber = toInsert.filter(m => !m.membership_number);
        const chunk = (arr, n) => { const out = []; for (let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; };

        for (const batch of chunk(withNumber, 200)) {
          const r = await sbUpsert('hub_membership_roster', batch, 'membership_number');
          if (r?._err) throw new Error(r._err);
        }
        for (const batch of chunk(withoutNumber, 200)) {
          const r = await sbPost('hub_membership_roster', batch);
          if (r?._err) throw new Error(r._err);
        }

        closeModal('importModal');
        await this.load(); this.renderRoster(); this.renderTypes(); App.renderPortal();
        showToast(`Imported ${toInsert.length} member${toInsert.length!==1?'s':''}`, 'success');
      } catch (e) {
        showFormError(errEl, String(e.message || e));
        btn.textContent = origText;
      } finally {
        btn.disabled = false;
      }
    },
  },

  // ── Access (hub login whitelist + account settings) ────────────
  access: {
    hubMembers: [],

    async load() {
      const rows = await sbGet('hub_members', 'order=name.asc&select=*');
      if (rows && !rows._err) this.hubMembers = rows;
    },

    showTab(tab, btn) {
      State.access.tab = tab;
      document.querySelectorAll('#accessView .tab-btn').forEach(b => b.classList.remove('active'));
      btn?.classList.add('active');
      document.querySelectorAll('#accessView .tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tab + 'Tab').classList.add('active');
      if (tab === 'account') this.renderAccount();
    },

    renderLogins() {
      document.getElementById('hubMembersList').innerHTML = this.hubMembers.length ? this.hubMembers.map(m => `
        <div class="item-card" onclick="App.access.openEdit('${m.id}')">
          <div class="item-card-header">
            <div class="item-icon" style="background:rgba(0,174,239,.15);color:var(--teal)">${esc(((m.name||m.email||'?')[0]||'?').toUpperCase())}</div>
            <div style="flex:1;min-width:0">
              <div class="item-card-title">${esc(m.name || m.email || 'Unnamed')}</div>
              ${m.name && m.email ? `<div class="item-card-meta">${esc(m.email)}</div>` : ''}
            </div>
            ${m.role ? `<div class="sop-cat-badge">${esc(m.role)}</div>` : ''}
          </div>
        </div>`).join('')
        : '<div class="empty-state"><div class="empty-state-icon">🔐</div><div class="empty-state-text">No hub logins yet</div></div>';
    },

    renderAccount() {
      document.getElementById('accountInfo').innerHTML =
        `<strong>Name:</strong> ${esc(_member?.name || '—')}<br><strong>Email:</strong> ${esc(_session?.user?.email || '—')}`;
      document.getElementById('pwNew').value = '';
      document.getElementById('pwConfirm').value = '';
      document.getElementById('pwError').classList.add('hidden');
    },

    openAdd() { this._hmForm(null); },
    openEdit(id) { const m = this.hubMembers.find(x => x.id === id); if (m) this._hmForm(m); },

    _hmForm(m) {
      document.getElementById('hubMemberModalTitle').textContent = m ? 'Edit Login' : 'Add Login';
      document.getElementById('hmId').value    = m?.id || '';
      document.getElementById('hmName').value  = m?.name || '';
      document.getElementById('hmEmail').value = m?.email || '';
      document.getElementById('hmRole').value  = m?.role || '';
      document.getElementById('hmDeleteBtn').classList.toggle('hidden', !m);
      document.getElementById('hmInviteBtn').classList.toggle('hidden', !!m); // invite only makes sense for a brand-new login
      document.getElementById('hmError').classList.add('hidden');
      openModal('hubMemberModal');
    },

    async saveHubMember(sendInvite) {
      const id    = document.getElementById('hmId').value;
      const name  = document.getElementById('hmName').value.trim();
      const email = document.getElementById('hmEmail').value.trim().toLowerCase();
      const role  = document.getElementById('hmRole').value.trim();
      const errEl = document.getElementById('hmError');
      if (!name)  { showFormError(errEl, 'Name is required'); return; }
      if (!email || !email.includes('@')) { showFormError(errEl, 'A valid email is required'); return; }

      if (sendInvite) {
        const btn = document.getElementById('hmInviteBtn');
        const origText = btn.textContent;
        btn.disabled = true; btn.textContent = 'Sending…';
        try {
          const r = await fetch('/.netlify/functions/invite-hub-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, redirectTo: window.location.origin + window.location.pathname }),
          });
          const data = await r.json().catch(() => ({}));
          if (!r.ok) { showFormError(errEl, data.error || 'Could not send invite'); return; }
        } catch (e) {
          showFormError(errEl, 'Could not reach the invite service: ' + e.message);
          return;
        } finally {
          btn.disabled = false; btn.textContent = origText;
        }
      }

      const payload = { name, email, role: role || null };
      const result = id ? await sbPatch('hub_members', 'id=eq.'+id, payload) : await sbPost('hub_members', payload);
      if (result?._err) { showFormError(errEl, result._err); return; }
      closeModal('hubMemberModal');
      await this.load(); this.renderLogins(); App.renderPortal();
      showToast(sendInvite ? 'Login added — invite email sent' : (id ? 'Login updated' : 'Login added'), 'success');
    },

    async deleteHubMember() {
      const id = document.getElementById('hmId').value;
      if (!id) return;
      if (this.hubMembers.length <= 1) {
        showToast("Can't remove the last hub login — add another first, or you'll lock everyone out.", 'error');
        return;
      }
      const target = this.hubMembers.find(m => m.id === id);
      const isSelf = !!(target?.email && _session?.user?.email && target.email.toLowerCase() === _session.user.email.toLowerCase());
      const msg = isSelf
        ? "This is YOUR login. Removing it signs you out immediately — you won't be able to sign back in unless someone else re-adds you. Continue?"
        : 'Remove this login? They will no longer be able to access the hub.';
      if (!confirm(msg)) return;
      const r = await sbDelete('hub_members', 'id=eq.'+id);
      if (r?._err) { showToast('Delete failed', 'error'); return; }
      closeModal('hubMemberModal');
      if (isSelf) {
        showToast('Access removed — signing out…', 'success');
        try { await fetch(`${SB_URL}/auth/v1/logout`, { method: 'POST', headers: { apikey: SB_KEY, Authorization: 'Bearer ' + _session.access_token } }); } catch {}
        _clearSession(); _member = null;
        document.getElementById('app').classList.add('hidden');
        document.getElementById('loginScreen').classList.remove('hidden');
        return;
      }
      await this.load(); this.renderLogins(); App.renderPortal();
      showToast('Login removed', 'success');
    },

    async changePassword() {
      const pw1 = document.getElementById('pwNew').value;
      const pw2 = document.getElementById('pwConfirm').value;
      const errEl = document.getElementById('pwError');
      if (pw1.length < 8) { showFormError(errEl, 'Password must be at least 8 characters'); return; }
      if (pw1 !== pw2)    { showFormError(errEl, 'Passwords do not match'); return; }
      try {
        const r = await fetch(`${SB_URL}/auth/v1/user`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + _session.access_token },
          body: JSON.stringify({ password: pw1 }),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error_description || data.msg || 'Could not update password');
        document.getElementById('pwNew').value = '';
        document.getElementById('pwConfirm').value = '';
        errEl.classList.add('hidden');
        showToast('Password updated', 'success');
      } catch (e) {
        showFormError(errEl, e.message);
      }
    },
  },
};

// ── Modal helpers ──────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  if (!document.querySelector('.modal-overlay:not(.hidden)')) document.body.style.overflow = '';
}
function overlayClose(e, id) { if (e.target === e.currentTarget) closeModal(id); }

function toggleEventTime() {
  document.getElementById('evtTimeRow').classList.toggle('hidden', document.getElementById('evtAllDay').checked);
}

// ── Toast ──────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast' + (type ? ' '+type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}
function showFormError(el, msg) { el.textContent = msg; el.classList.remove('hidden'); }

// ── Calendar cell ──────────────────────────────────────────────
function makeCell(day, otherMonth, dateStr, events, isToday, isSelected) {
  const div = document.createElement('div');
  div.className = 'cal-cell' +
    (otherMonth ? ' other-month' : '') +
    (isToday    ? ' today'       : '') +
    (isSelected ? ' selected'    : '') +
    (events.length ? ' has-events' : '');
  const numSpan = document.createElement('span');
  numSpan.className = 'cal-num';
  numSpan.textContent = day;
  div.appendChild(numSpan);
  if (!otherMonth && events.length) {
    events.slice(0, 3).forEach(ev => {
      const lbl = document.createElement('span');
      lbl.className = 'cal-ev-label';
      lbl.style.background = evTypeColour(ev.event_type);
      const prefix = ev.session_half === 'morning' ? 'AM: ' : ev.session_half === 'afternoon' ? 'PM: ' : '';
      lbl.textContent = prefix + ev.title;
      lbl.title = ev.title;
      div.appendChild(lbl);
    });
    if (events.length > 3) {
      const more = document.createElement('span');
      more.className = 'cal-ev-label';
      more.style.background = 'rgba(255,255,255,.15)';
      more.style.color = 'var(--white)';
      more.textContent = '+' + (events.length - 3) + ' more';
      div.appendChild(more);
    }
  }
  if (!otherMonth && dateStr) {
    div.addEventListener('click', () => App.cal.selectDay(dateStr));
  }
  return div;
}

// ── Render helpers ─────────────────────────────────────────────
function eventCardHTML(ev) {
  const colour     = evTypeColour(ev.event_type);
  const isCorsizio = ev._source === 'corsizio';
  const resources  = isCorsizio ? [] : App.cal.resources
    .filter(r => r.event_id === ev.id)
    .map(r => App.maint.equipment?.find(e => e.id === r.equipment_id))
    .filter(Boolean);
  const sessionLabel = !isCorsizio && ev.calendar_type === 'training' && ev.session_half !== 'full'
    ? `<span class="event-badge" style="color:var(--ev-dinghys);border-color:var(--ev-dinghys)">${ev.session_half === 'morning' ? 'AM' : 'PM'}</span>` : '';
  const sourceBadge = isCorsizio
    ? `<span class="event-badge corsizio-badge">Corsizio</span>` : '';
  const resourceBadges = resources.length
    ? `<div class="event-resources">${resources.map(eq => `<span class="resource-badge">${eqIcon(eq.type)} ${esc(eq.name)}</span>`).join('')}</div>` : '';
  const regLink = isCorsizio && ev._corsizio_url
    ? `<div style="margin-top:4px"><a href="${esc(ev._corsizio_url)}" target="_blank" rel="noopener" style="color:var(--teal);font-size:.78rem">Register on Corsizio ↗</a></div>` : '';

  if (isCorsizio) {
    const crzResources = (App.cal.corsizioBookings || [])
      .filter(b => b.corsizio_event_id === ev.id)
      .map(b => App.maint.equipment?.find(e => e.id === b.equipment_id))
      .filter(Boolean);
    const crzResourceBadges = crzResources.length
      ? `<div class="event-resources">${crzResources.map(eq => `<span class="resource-badge">${eqIcon(eq.type)} ${esc(eq.name)}</span>`).join('')}</div>` : '';
    return `<div class="event-card" style="border-left-color:${colour}">
      <div class="event-card-body">
        <div class="event-card-title">${esc(ev.title)}</div>
        <div class="event-card-meta">
          <span>${fmtEventDate(ev)}</span>
          ${ev.location ? `<span>📍 ${esc(ev.location)}</span>` : ''}
          ${sourceBadge}
        </div>
        ${ev.description ? `<div class="event-desc">${esc(ev.description)}</div>` : ''}
        ${crzResourceBadges}
        <div class="crz-card-actions">
          ${regLink ? regLink : ''}
          <button class="btn-crz-resources" onclick="App.cal.openCorsizioResources(App.cal.corsizioEvents.find(e=>e.id==='${ev.id}'))">⚙ Resources</button>
        </div>
      </div>
    </div>`;
  }

  return `<div class="event-card admin-card" style="border-left-color:${colour}"
    onclick="App.cal.openEdit(App.cal.data.find(e=>e.id==='${ev.id}'))">
    <div class="event-card-body">
      <div class="event-card-title">${esc(ev.title)}</div>
      <div class="event-card-meta">
        <span>${fmtEventDate(ev)}</span>
        ${ev.location ? `<span>📍 ${esc(ev.location)}</span>` : ''}
        <span class="event-badge" style="color:${colour};border-color:${colour}">${evTypeLabel(ev.event_type)}</span>
        ${sessionLabel}
      </div>
      ${ev.description ? `<div class="event-desc">${esc(ev.description)}</div>` : ''}
      ${resourceBadges}
    </div>
  </div>`;
}

function nextDueBadge(rec) {
  if (!rec?.next_due_date) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const days  = Math.round((new Date(rec.next_due_date+'T12:00:00') - today) / 86400000);
  if (days < 0)   return `<span class="item-card-badge badge-overdue">Overdue</span>`;
  if (days <= 14) return `<span class="item-card-badge badge-due-soon">Due Soon</span>`;
  return `<span class="item-card-badge badge-ok">OK</span>`;
}

// ── Utilities ──────────────────────────────────────────────────
function fmtDate(d)       { return d.getFullYear()+'-'+pad2(d.getMonth()+1)+'-'+pad2(d.getDate()); }
function pad2(n)          { return String(n).padStart(2,'0'); }
function fmtDateShort(s)  { return s ? new Date(s.slice(0,10)+'T12:00:00').toLocaleDateString('en-IE',{day:'numeric',month:'short',year:'numeric'}) : ''; }
function fmtEventDate(ev) {
  const s = fmtDateShort(ev.start_date), same = !ev.end_date || ev.end_date.slice(0,10)===ev.start_date.slice(0,10);
  const e = same ? '' : ' – '+fmtDateShort(ev.end_date);
  return (!ev.all_day && ev.start_date.length > 10) ? s+' at '+ev.start_date.slice(11,16)+e : s+e;
}
function esc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function evTypeColour(t)  { return {cruisers:'#2196f3',dinghys:'#27ae60',regattas:'#e63946',social:'#fee01e',other:'#90a4ae',external:'#9c27b0'}[t]||'#90a4ae'; }
function evTypeLabel(t)   { return {cruisers:'Cruisers',dinghys:'Dinghys',regattas:'Regattas',social:'Social',other:'Other',external:'External'}[t]||t; }
function eqIcon(t)        { return {tractor:'🚜',rib:'🚤',dinghy:'⛵',engine:'⚙️',safety_boat:'🛥️',other:'🔧'}[t]||'🔧'; }
function eqTypeLabel(t)   { return {tractor:'Tractor',rib:'RIB',dinghy:'Dinghy',engine:'Engine',safety_boat:'Safety Boat',other:'Other'}[t]||t; }
function catLabel(c)      { return {general:'General',tractor:'Tractor',rib:'RIB',engine:'Engine',safety:'Safety',launch:'Launch',recovery:'Recovery'}[c]||c; }

// ── Service Worker ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW reg failed', e));
}


// ── Back-button navigation ─────────────────────────────────────
window.addEventListener('popstate', e => {
  App.navigate(e.state?.view || 'portal', true);
});

// ── Boot ───────────────────────────────────────────────────────
App.init();
