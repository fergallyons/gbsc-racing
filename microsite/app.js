// ── Club Config (set by /club-config.js edge function) ────────
const _C = window.CLUB || {};
if (!window.CLUB) console.warn('window.CLUB not set — /club-config.js may have failed');

// Apply branding immediately
(function () {
  const short = _C.short || 'GBSC';
  const logoUrl = _C.logoUrl || _C.logoURL || _C.logo_url || _C.logo || '';
  const img = document.getElementById('clubLogoImg');
  const txt = document.getElementById('clubLogoText');
  if (img && logoUrl) {
    img.src = logoUrl; img.alt = short;
    img.style.display = '';
    if (txt) txt.style.display = 'none';
  }
  document.title = (short || 'GBSC') + ' Club Hub';
  if (_C.primaryColor) {
    document.documentElement.style.setProperty('--teal', _C.primaryColor);
  }
})();

// ── Supabase (raw fetch — same pattern as gbsc.racing) ────────
const SB_URL = _C.sbUrl || '';
const SB_KEY = _C.sbKey || '';
const SBH = { 'Content-Type': 'application/json', 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY };

async function sb(path, opts = {}) {
  if (!SB_URL || !SB_KEY) return { _err: 'Supabase not configured' };
  try {
    const r = await fetch(SB_URL + path, { headers: { ...SBH }, ...opts });
    if (!r.ok) {
      const e = await r.text();
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

async function sbGet(table, query = '') {
  return sb('/rest/v1/' + table + '?' + query);
}

async function sbPost(table, body, prefer = 'return=representation') {
  return sb('/rest/v1/' + table, {
    method: 'POST',
    headers: { ...SBH, 'Prefer': prefer },
    body: JSON.stringify(body),
  });
}

async function sbPatch(table, query, body) {
  return sb('/rest/v1/' + table + '?' + query, {
    method: 'PATCH',
    headers: { ...SBH, 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
}

async function sbDelete(table, query) {
  return sb('/rest/v1/' + table + '?' + query, { method: 'DELETE' });
}

// ── State ──────────────────────────────────────────────────────
const State = {
  admin: false,
  view: 'calendar',
  cal: { year: new Date().getFullYear(), month: new Date().getMonth(), selectedDay: null },
  events: { data: [], filter: 'upcoming', editing: null },
  maint: { equipment: [], records: [], tab: 'equipment', current: null },
  sops: { data: [], catFilter: 'all', current: null },
  adminPinEntry: '',
};

// ── App ────────────────────────────────────────────────────────
const App = {

  async init() {
    // Restore admin session
    if (sessionStorage.getItem('hub_admin') === '1') setAdminMode(true, true);

    await Promise.all([
      App.cal.load(),
      App.maint.load(),
      App.sops.load(),
    ]);

    App.cal.render();
    App.events.render();
    App.maint.renderEquipment();
    App.sops.render();
  },

  navigate(view) {
    // Update views
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    const el = document.getElementById(view + 'View') ||
               document.getElementById(view.charAt(0).toUpperCase() + view.slice(1) + 'View');

    // Map view name to element id
    const viewMap = { calendar: 'calendarView', events: 'eventsView', maintenance: 'maintenanceView', sops: 'sopsView' };
    const target = document.getElementById(viewMap[view]);
    if (target) target.classList.add('active');

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    State.view = view;
  },

  // ── Calendar ─────────────────────────────────────────────────
  cal: {
    data: [],

    async load() {
      const rows = await sbGet('hub_events', 'order=start_date.asc&select=*');
      if (!rows || rows._err) return;
      this.data = rows;
    },

    render() {
      const { year, month } = State.cal;
      const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      document.getElementById('calMonthLabel').textContent = months[month] + ' ' + year;

      const firstDay = new Date(year, month, 1);
      const lastDay  = new Date(year, month + 1, 0);
      const startDow = (firstDay.getDay() + 6) % 7; // Monday = 0
      const today = new Date();
      const todayStr = fmtDate(today);

      // Build events-by-date lookup
      const byDate = {};
      this.data.forEach(ev => {
        const d = ev.start_date.slice(0, 10);
        if (!byDate[d]) byDate[d] = [];
        byDate[d].push(ev);
        // Multi-day: fill intermediate days
        if (ev.end_date) {
          const end = new Date(ev.end_date.slice(0, 10));
          const cur = new Date(d);
          cur.setDate(cur.getDate() + 1);
          while (cur <= end) {
            const ds = fmtDate(cur);
            if (!byDate[ds]) byDate[ds] = [];
            byDate[ds].push({ ...ev, _cont: true });
            cur.setDate(cur.getDate() + 1);
          }
        }
      });

      const grid = document.getElementById('calGrid');
      grid.innerHTML = '';

      // Leading days from prev month
      const prevLast = new Date(year, month, 0).getDate();
      for (let i = startDow - 1; i >= 0; i--) {
        grid.appendChild(makeCell(prevLast - i, true, '', []));
      }

      // Days in this month
      for (let d = 1; d <= lastDay.getDate(); d++) {
        const ds = year + '-' + pad2(month + 1) + '-' + pad2(d);
        const evs = byDate[ds] || [];
        const isToday = ds === todayStr;
        const isSelected = State.cal.selectedDay === ds;
        const cell = makeCell(d, false, ds, evs, isToday, isSelected);
        grid.appendChild(cell);
      }

      // Trailing days to fill last row
      const filled = startDow + lastDay.getDate();
      const trailing = filled % 7 === 0 ? 0 : 7 - (filled % 7);
      for (let i = 1; i <= trailing; i++) {
        grid.appendChild(makeCell(i, true, '', []));
      }

      this.renderDayDetail(State.cal.selectedDay);
      this.renderUpcoming();
    },

    renderDayDetail(dateStr) {
      const el = document.getElementById('calDayDetail');
      if (!dateStr) { el.className = 'cal-day-detail empty'; el.innerHTML = ''; return; }

      const dayEvs = this.data.filter(ev => {
        const s = ev.start_date.slice(0, 10);
        const e = ev.end_date ? ev.end_date.slice(0, 10) : s;
        return dateStr >= s && dateStr <= e;
      });

      const d = new Date(dateStr + 'T12:00:00');
      const heading = d.toLocaleDateString('en-IE', { weekday: 'long', day: 'numeric', month: 'long' });

      if (!dayEvs.length) {
        el.className = 'cal-day-detail';
        el.innerHTML = `<div class="cal-day-detail-heading">${heading}</div>` +
          `<div style="color:var(--muted);font-size:.85rem;">No events</div>`;
        return;
      }

      el.className = 'cal-day-detail';
      el.innerHTML = `<div class="cal-day-detail-heading">${heading}</div>` +
        dayEvs.map(ev => eventCardHTML(ev, State.admin)).join('');
    },

    renderUpcoming() {
      const todayStr = fmtDate(new Date());
      const upcoming = this.data
        .filter(ev => ev.start_date.slice(0, 10) >= todayStr)
        .slice(0, 5);

      const el = document.getElementById('calUpcoming');
      if (!upcoming.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-text">No upcoming events</div></div>';
        return;
      }
      el.innerHTML = upcoming.map(ev => eventCardHTML(ev, State.admin)).join('');
    },

    prev() {
      const { year, month } = State.cal;
      if (month === 0) { State.cal.year = year - 1; State.cal.month = 11; }
      else { State.cal.month = month - 1; }
      State.cal.selectedDay = null;
      this.render();
    },

    next() {
      const { year, month } = State.cal;
      if (month === 11) { State.cal.year = year + 1; State.cal.month = 0; }
      else { State.cal.month = month + 1; }
      State.cal.selectedDay = null;
      this.render();
    },

    selectDay(dateStr) {
      State.cal.selectedDay = State.cal.selectedDay === dateStr ? null : dateStr;
      this.render();
    },

    openAdd(prefillDate) {
      document.getElementById('eventModalTitle').textContent = 'Add Event';
      document.getElementById('evtId').value = '';
      document.getElementById('evtTitle').value = '';
      document.getElementById('evtType').value = 'general';
      const d = prefillDate || fmtDate(new Date());
      document.getElementById('evtStartDate').value = d;
      document.getElementById('evtEndDate').value = d;
      document.getElementById('evtAllDay').checked = true;
      document.getElementById('evtTimeRow').classList.add('hidden');
      document.getElementById('evtStartTime').value = '';
      document.getElementById('evtEndTime').value = '';
      document.getElementById('evtLocation').value = '';
      document.getElementById('evtDescription').value = '';
      document.getElementById('evtDeleteBtn').classList.add('hidden');
      document.getElementById('evtError').classList.add('hidden');
      openModal('eventModal');
    },

    openEdit(ev) {
      if (!State.admin) return;
      State.events.editing = ev;
      document.getElementById('eventModalTitle').textContent = 'Edit Event';
      document.getElementById('evtId').value = ev.id;
      document.getElementById('evtTitle').value = ev.title;
      document.getElementById('evtType').value = ev.event_type || 'general';
      document.getElementById('evtStartDate').value = ev.start_date.slice(0, 10);
      document.getElementById('evtEndDate').value = ev.end_date ? ev.end_date.slice(0, 10) : ev.start_date.slice(0, 10);
      const allDay = ev.all_day !== false;
      document.getElementById('evtAllDay').checked = allDay;
      toggleEventTime();
      if (!allDay) {
        document.getElementById('evtStartTime').value = ev.start_date.slice(11, 16) || '';
        document.getElementById('evtEndTime').value = ev.end_date ? ev.end_date.slice(11, 16) : '';
      }
      document.getElementById('evtLocation').value = ev.location || '';
      document.getElementById('evtDescription').value = ev.description || '';
      document.getElementById('evtDeleteBtn').classList.remove('hidden');
      document.getElementById('evtError').classList.add('hidden');
      openModal('eventModal');
    },

    async saveEvent() {
      const id       = document.getElementById('evtId').value;
      const title    = document.getElementById('evtTitle').value.trim();
      const type     = document.getElementById('evtType').value;
      const allDay   = document.getElementById('evtAllDay').checked;
      const startD   = document.getElementById('evtStartDate').value;
      const endD     = document.getElementById('evtEndDate').value;
      const startT   = document.getElementById('evtStartTime').value;
      const endT     = document.getElementById('evtEndTime').value;
      const location = document.getElementById('evtLocation').value.trim();
      const desc     = document.getElementById('evtDescription').value.trim();
      const errEl    = document.getElementById('evtError');

      if (!title) { showFormError(errEl, 'Title is required'); return; }
      if (!startD) { showFormError(errEl, 'Start date is required'); return; }

      const startDate = allDay ? startD : (startD + (startT ? 'T' + startT + ':00' : 'T00:00:00'));
      const endDate   = endD ? (allDay ? endD : (endD + (endT ? 'T' + endT + ':00' : 'T23:59:59'))) : null;

      const payload = { title, event_type: type, all_day: allDay, start_date: startDate, description: desc || null, location: location || null };
      if (endDate) payload.end_date = endDate;

      let result;
      if (id) {
        result = await sbPatch('hub_events', 'id=eq.' + id, { ...payload, updated_at: new Date().toISOString() });
      } else {
        result = await sbPost('hub_events', payload);
      }

      if (result && result._err) { showFormError(errEl, result._err); return; }

      closeModal('eventModal');
      await this.load();
      this.render();
      App.events.render();
      showToast(id ? 'Event updated' : 'Event added', 'success');
    },

    async deleteEvent() {
      const id = document.getElementById('evtId').value;
      if (!id) return;
      if (!confirm('Delete this event?')) return;
      const r = await sbDelete('hub_events', 'id=eq.' + id);
      if (r && r._err) { showToast('Delete failed', 'error'); return; }
      closeModal('eventModal');
      await this.load();
      this.render();
      App.events.render();
      showToast('Event deleted', 'success');
    },
  },

  // ── Events list view ──────────────────────────────────────────
  events: {
    activeFilter: 'upcoming',

    filter(type, btn) {
      this.activeFilter = type;
      document.querySelectorAll('#eventsView .filter-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      this.render();
    },

    render() {
      const todayStr = fmtDate(new Date());
      let evs = [...App.cal.data];

      if (this.activeFilter === 'upcoming') evs = evs.filter(e => e.start_date.slice(0, 10) >= todayStr);
      else if (this.activeFilter === 'past') evs = evs.filter(e => e.start_date.slice(0, 10) < todayStr).reverse();

      const el = document.getElementById('eventsList');
      if (!evs.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📅</div>' +
          '<div class="empty-state-text">No events to show</div></div>';
        return;
      }
      el.innerHTML = evs.map(ev => eventCardHTML(ev, State.admin)).join('');
    },
  },

  // ── Maintenance ───────────────────────────────────────────────
  maint: {
    equipment: [],
    records: [],

    async load() {
      const [eq, rec] = await Promise.all([
        sbGet('hub_equipment', 'order=name.asc&active=eq.true'),
        sbGet('hub_maintenance_records', 'order=performed_date.desc'),
      ]);
      if (eq && !eq._err)  this.equipment = eq;
      if (rec && !rec._err) this.records   = rec;
    },

    showTab(tab, btn) {
      State.maint.tab = tab;
      document.querySelectorAll('#maintenanceView .tab-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      document.querySelectorAll('#maintenanceView .tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tab + 'Tab').classList.add('active');
      if (tab === 'equipment') this.renderEquipment();
      else if (tab === 'upcoming') this.renderUpcoming();
      else if (tab === 'log') this.renderLog();
    },

    renderEquipment() {
      const el = document.getElementById('equipmentList');
      if (!this.equipment.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🔧</div>' +
          '<div class="empty-state-text">No equipment yet</div></div>';
        return;
      }

      el.innerHTML = this.equipment.map(eq => {
        const lastRec = this.records.filter(r => r.equipment_id === eq.id).sort((a,b) => b.performed_date.localeCompare(a.performed_date))[0];
        const nextDue = this.records.filter(r => r.equipment_id === eq.id && r.next_due_date).sort((a,b) => a.next_due_date.localeCompare(b.next_due_date))[0];
        const badge = nextDueBadge(nextDue);

        return `<div class="item-card" onclick="App.maint.openDetail('${eq.id}')">
          <div class="item-card-header">
            <div class="item-icon eq-icon-${eq.type}">${eqIcon(eq.type)}</div>
            <div class="item-card-title">${esc(eq.name)}</div>
            ${badge}
          </div>
          <div class="item-card-meta">
            ${eqTypeLabel(eq.type)}${eq.year ? ' &bull; ' + eq.year : ''}
            ${lastRec ? ' &bull; Last service: ' + fmtDateShort(lastRec.performed_date) : ''}
          </div>
        </div>`;
      }).join('');
    },

    renderUpcoming() {
      const el = document.getElementById('upcomingList');
      const today = fmtDate(new Date());
      const withDue = [];

      this.equipment.forEach(eq => {
        const rec = this.records
          .filter(r => r.equipment_id === eq.id && r.next_due_date)
          .sort((a,b) => a.next_due_date.localeCompare(b.next_due_date))[0];
        if (rec) withDue.push({ eq, rec });
      });

      withDue.sort((a,b) => a.rec.next_due_date.localeCompare(b.rec.next_due_date));

      if (!withDue.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">✅</div>' +
          '<div class="empty-state-text">No scheduled maintenance</div></div>';
        return;
      }

      el.innerHTML = withDue.map(({ eq, rec }) => {
        const badge = nextDueBadge(rec);
        return `<div class="item-card" onclick="App.maint.openDetail('${eq.id}')">
          <div class="item-card-header">
            <div class="item-icon eq-icon-${eq.type}">${eqIcon(eq.type)}</div>
            <div style="flex:1;min-width:0;">
              <div class="item-card-title">${esc(eq.name)}</div>
              <div class="item-card-meta">${esc(rec.task)}</div>
            </div>
            ${badge}
          </div>
          <div class="item-card-meta">Due: ${fmtDateShort(rec.next_due_date)}</div>
        </div>`;
      }).join('');
    },

    renderLog() {
      const el = document.getElementById('logList');
      if (!this.records.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📋</div>' +
          '<div class="empty-state-text">No maintenance records yet</div></div>';
        return;
      }

      const eqMap = Object.fromEntries(this.equipment.map(e => [e.id, e]));

      el.innerHTML = this.records.slice(0, 50).map(rec => {
        const eq = eqMap[rec.equipment_id] || { name: 'Unknown', type: 'other' };
        return `<div class="item-card ${State.admin ? 'admin-card' : ''}" ${State.admin ? `onclick="App.maint.openEditRecord('${rec.id}')"` : ''}>
          <div class="item-card-header">
            <div class="item-icon eq-icon-${eq.type}">${eqIcon(eq.type)}</div>
            <div style="flex:1;min-width:0;">
              <div class="item-card-title">${esc(rec.task)}</div>
              <div class="item-card-meta">${esc(eq.name)}</div>
            </div>
          </div>
          <div class="item-card-meta">
            ${fmtDateShort(rec.performed_date)}
            ${rec.performed_by ? ' &bull; ' + esc(rec.performed_by) : ''}
            ${rec.next_due_date ? ' &bull; Next: ' + fmtDateShort(rec.next_due_date) : ''}
          </div>
          ${rec.notes ? `<div class="item-card-meta" style="margin-top:4px">${esc(rec.notes)}</div>` : ''}
        </div>`;
      }).join('');
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

      const recs = this.records.filter(r => r.equipment_id === eqId)
                               .sort((a,b) => b.performed_date.localeCompare(a.performed_date));

      const logEl = document.getElementById('equipDetailLog');
      if (!recs.length) {
        logEl.innerHTML = '<div style="color:var(--muted);font-size:.85rem;">No records yet</div>';
      } else {
        logEl.innerHTML = recs.map(r =>
          `<div class="maint-record ${State.admin ? 'admin-card item-card' : ''}" ${State.admin ? `onclick="App.maint.openEditRecord('${r.id}')"` : ''}>
            <div class="maint-record-title">${esc(r.task)}</div>
            <div class="maint-record-meta">
              ${fmtDateShort(r.performed_date)}
              ${r.performed_by ? ' &bull; ' + esc(r.performed_by) : ''}
              ${r.next_due_date ? ' &bull; Next: ' + fmtDateShort(r.next_due_date) : ''}
            </div>
            ${r.notes ? `<div class="maint-record-meta" style="margin-top:2px">${esc(r.notes)}</div>` : ''}
          </div>`
        ).join('');
      }

      document.getElementById('equipDetailEditBtn').classList.toggle('hidden', !State.admin);
      document.getElementById('equipDetailLogBtn').classList.toggle('hidden', !State.admin);
      openModal('equipDetailModal');
    },

    editEquipment() {
      const eq = State.maint.current;
      if (!eq) return;
      closeModal('equipDetailModal');
      document.getElementById('equipmentModalTitle').textContent = 'Edit Equipment';
      document.getElementById('eqId').value = eq.id;
      document.getElementById('eqName').value = eq.name;
      document.getElementById('eqType').value = eq.type;
      document.getElementById('eqYear').value = eq.year || '';
      document.getElementById('eqDescription').value = eq.description || '';
      document.getElementById('eqDeleteBtn').classList.remove('hidden');
      document.getElementById('eqError').classList.add('hidden');
      openModal('equipmentModal');
    },

    openAddEquipment() {
      document.getElementById('equipmentModalTitle').textContent = 'Add Equipment';
      document.getElementById('eqId').value = '';
      document.getElementById('eqName').value = '';
      document.getElementById('eqType').value = 'tractor';
      document.getElementById('eqYear').value = '';
      document.getElementById('eqDescription').value = '';
      document.getElementById('eqDeleteBtn').classList.add('hidden');
      document.getElementById('eqError').classList.add('hidden');
      openModal('equipmentModal');
    },

    async saveEquipment() {
      const id   = document.getElementById('eqId').value;
      const name = document.getElementById('eqName').value.trim();
      const type = document.getElementById('eqType').value;
      const year = document.getElementById('eqYear').value;
      const desc = document.getElementById('eqDescription').value.trim();
      const errEl = document.getElementById('eqError');

      if (!name) { showFormError(errEl, 'Name is required'); return; }

      const payload = { name, type, description: desc || null, year: year ? parseInt(year) : null, active: true };

      let result;
      if (id) {
        result = await sbPatch('hub_equipment', 'id=eq.' + id, payload);
      } else {
        result = await sbPost('hub_equipment', payload);
      }

      if (result && result._err) { showFormError(errEl, result._err); return; }
      closeModal('equipmentModal');
      await this.load();
      this.renderEquipment();
      // Refresh sops equipment selects
      App.sops.populateEquipmentSelect();
      showToast(id ? 'Equipment updated' : 'Equipment added', 'success');
    },

    async deleteEquipment() {
      const id = document.getElementById('eqId').value;
      if (!id) return;
      if (!confirm('Delete this equipment and all its maintenance records?')) return;
      const r = await sbDelete('hub_equipment', 'id=eq.' + id);
      if (r && r._err) { showToast('Delete failed', 'error'); return; }
      closeModal('equipmentModal');
      await this.load();
      this.renderEquipment();
      showToast('Equipment deleted', 'success');
    },

    openLogMaintenance(eqId) {
      document.getElementById('maintModalTitle').textContent = 'Log Maintenance';
      document.getElementById('maintId').value = '';
      document.getElementById('maintTask').value = '';
      document.getElementById('maintDate').value = fmtDate(new Date());
      document.getElementById('maintBy').value = '';
      document.getElementById('maintNextDue').value = '';
      document.getElementById('maintNotes').value = '';
      document.getElementById('maintDeleteBtn').classList.add('hidden');
      document.getElementById('maintError').classList.add('hidden');

      // Populate equipment select
      const sel = document.getElementById('maintEquipmentSel');
      sel.innerHTML = this.equipment.map(e =>
        `<option value="${e.id}" ${e.id === eqId ? 'selected' : ''}>${esc(e.name)}</option>`
      ).join('');
      if (!this.equipment.length) sel.innerHTML = '<option value="">No equipment</option>';

      openModal('maintModal');
    },

    openLogForCurrent() {
      closeModal('equipDetailModal');
      this.openLogMaintenance(State.maint.current?.id);
    },

    openEditRecord(recId) {
      const rec = this.records.find(r => r.id === recId);
      if (!rec) return;
      document.getElementById('maintModalTitle').textContent = 'Edit Record';
      document.getElementById('maintId').value = rec.id;
      document.getElementById('maintTask').value = rec.task;
      document.getElementById('maintDate').value = rec.performed_date;
      document.getElementById('maintBy').value = rec.performed_by || '';
      document.getElementById('maintNextDue').value = rec.next_due_date || '';
      document.getElementById('maintNotes').value = rec.notes || '';
      document.getElementById('maintDeleteBtn').classList.remove('hidden');
      document.getElementById('maintError').classList.add('hidden');

      const sel = document.getElementById('maintEquipmentSel');
      sel.innerHTML = this.equipment.map(e =>
        `<option value="${e.id}" ${e.id === rec.equipment_id ? 'selected' : ''}>${esc(e.name)}</option>`
      ).join('');

      openModal('maintModal');
    },

    async saveMaintenance() {
      const id      = document.getElementById('maintId').value;
      const eqId    = document.getElementById('maintEquipmentSel').value;
      const task    = document.getElementById('maintTask').value.trim();
      const date    = document.getElementById('maintDate').value;
      const by      = document.getElementById('maintBy').value.trim();
      const nextDue = document.getElementById('maintNextDue').value;
      const notes   = document.getElementById('maintNotes').value.trim();
      const errEl   = document.getElementById('maintError');

      if (!eqId)  { showFormError(errEl, 'Select equipment'); return; }
      if (!task)  { showFormError(errEl, 'Task is required'); return; }
      if (!date)  { showFormError(errEl, 'Date is required'); return; }

      const payload = {
        equipment_id: eqId, task, performed_date: date,
        performed_by: by || null, next_due_date: nextDue || null, notes: notes || null,
      };

      let result;
      if (id) {
        result = await sbPatch('hub_maintenance_records', 'id=eq.' + id, payload);
      } else {
        result = await sbPost('hub_maintenance_records', payload);
      }

      if (result && result._err) { showFormError(errEl, result._err); return; }
      closeModal('maintModal');
      await this.load();
      this.renderEquipment();
      if (State.maint.tab !== 'equipment') {
        if (State.maint.tab === 'upcoming') this.renderUpcoming();
        else this.renderLog();
      }
      showToast(id ? 'Record updated' : 'Maintenance logged', 'success');
    },

    async deleteRecord() {
      const id = document.getElementById('maintId').value;
      if (!id) return;
      if (!confirm('Delete this maintenance record?')) return;
      const r = await sbDelete('hub_maintenance_records', 'id=eq.' + id);
      if (r && r._err) { showToast('Delete failed', 'error'); return; }
      closeModal('maintModal');
      await this.load();
      this.renderEquipment();
      showToast('Record deleted', 'success');
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
      const eq = App.maint.equipment;
      const sel = document.getElementById('sopEquipment');
      if (!sel) return;
      sel.innerHTML = '<option value="">— Not equipment-specific —</option>' +
        eq.map(e => `<option value="${e.id}">${esc(e.name)}</option>`).join('');
    },

    filterCat(cat, btn) {
      State.sops.catFilter = cat;
      document.querySelectorAll('#sopsView .filter-btn').forEach(b => b.classList.remove('active'));
      if (btn) btn.classList.add('active');
      this.render();
    },

    render() {
      const cat = State.sops.catFilter;
      const filtered = cat === 'all' ? this.data : this.data.filter(s => s.category === cat);
      const el = document.getElementById('sopsList');

      if (!filtered.length) {
        el.innerHTML = '<div class="empty-state"><div class="empty-state-icon">📖</div>' +
          '<div class="empty-state-text">No SOPs in this category</div></div>';
        return;
      }

      el.innerHTML = filtered.map(sop => {
        const eqName = App.maint.equipment.find(e => e.id === sop.equipment_id)?.name || '';
        return `<div class="item-card" onclick="App.sops.viewSOP('${sop.id}')">
          <div class="item-card-header">
            <div style="flex:1;min-width:0;">
              <div class="item-card-title">${esc(sop.title)}</div>
              ${eqName ? `<div class="item-card-meta">${esc(eqName)}</div>` : ''}
            </div>
            <span class="sop-cat-badge">${esc(catLabel(sop.category))}</span>
          </div>
          <div class="item-card-meta" style="margin-top:4px">v${esc(sop.version || '1.0')} &bull; Updated ${fmtDateShort(sop.updated_at || sop.created_at)}</div>
        </div>`;
      }).join('');
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
        `<span>v${esc(sop.version || '1.0')}</span>` +
        `<span>Updated ${fmtDateShort(sop.updated_at || sop.created_at)}</span>`;

      document.getElementById('sopViewContent').textContent = sop.content;
      document.getElementById('sopViewEditBtn').classList.toggle('hidden', !State.admin);
      openModal('sopViewModal');
    },

    editCurrent() {
      const sop = this.current;
      if (!sop) return;
      closeModal('sopViewModal');
      document.getElementById('sopModalTitle').textContent = 'Edit SOP';
      document.getElementById('sopId').value = sop.id;
      document.getElementById('sopTitle').value = sop.title;
      document.getElementById('sopCategory').value = sop.category || 'general';
      document.getElementById('sopVersion').value = sop.version || '1.0';
      document.getElementById('sopEquipment').value = sop.equipment_id || '';
      document.getElementById('sopContent').value = sop.content;
      document.getElementById('sopDeleteBtn').classList.remove('hidden');
      document.getElementById('sopError').classList.add('hidden');
      openModal('sopModal');
    },

    openAdd() {
      document.getElementById('sopModalTitle').textContent = 'Add SOP';
      document.getElementById('sopId').value = '';
      document.getElementById('sopTitle').value = '';
      document.getElementById('sopCategory').value = 'general';
      document.getElementById('sopVersion').value = '1.0';
      document.getElementById('sopEquipment').value = '';
      document.getElementById('sopContent').value = '';
      document.getElementById('sopDeleteBtn').classList.add('hidden');
      document.getElementById('sopError').classList.add('hidden');
      openModal('sopModal');
    },

    async saveSOP() {
      const id      = document.getElementById('sopId').value;
      const title   = document.getElementById('sopTitle').value.trim();
      const cat     = document.getElementById('sopCategory').value;
      const version = document.getElementById('sopVersion').value.trim() || '1.0';
      const eqId    = document.getElementById('sopEquipment').value;
      const content = document.getElementById('sopContent').value.trim();
      const errEl   = document.getElementById('sopError');

      if (!title)   { showFormError(errEl, 'Title is required'); return; }
      if (!content) { showFormError(errEl, 'Content is required'); return; }

      const now = new Date().toISOString();
      const payload = {
        title, category: cat, version, content,
        equipment_id: eqId || null,
        updated_at: now,
      };

      let result;
      if (id) {
        result = await sbPatch('hub_sop_documents', 'id=eq.' + id, payload);
      } else {
        result = await sbPost('hub_sop_documents', { ...payload, created_at: now });
      }

      if (result && result._err) { showFormError(errEl, result._err); return; }
      closeModal('sopModal');
      await this.load();
      this.render();
      showToast(id ? 'SOP updated' : 'SOP added', 'success');
    },

    async deleteSOP() {
      const id = document.getElementById('sopId').value;
      if (!id) return;
      if (!confirm('Delete this SOP?')) return;
      const r = await sbDelete('hub_sop_documents', 'id=eq.' + id);
      if (r && r._err) { showToast('Delete failed', 'error'); return; }
      closeModal('sopModal');
      await this.load();
      this.render();
      showToast('SOP deleted', 'success');
    },
  },
};

// ── Admin Auth ─────────────────────────────────────────────────
let _pinEntry = '';

function showAdminLogin() {
  _pinEntry = '';
  updatePinDisplay();
  document.getElementById('adminPinError').classList.add('hidden');
  document.getElementById('adminLogoutBtn').classList.toggle('hidden', !State.admin);
  openModal('adminLoginModal');
}

function adminPinKey(k) {
  if (k === 'C') { _pinEntry = ''; }
  else if (k === 'DEL') { _pinEntry = _pinEntry.slice(0, -1); }
  else if (_pinEntry.length < 4) { _pinEntry += k; }
  updatePinDisplay();
  if (_pinEntry.length === 4) setTimeout(checkAdminPin, 100);
}

function updatePinDisplay() {
  for (let i = 0; i < 4; i++) {
    const dot = document.getElementById('pd' + i);
    if (dot) dot.classList.toggle('filled', i < _pinEntry.length);
  }
}

function checkAdminPin() {
  const pin = _C.adminPin || _C.hubPin || _C.roPin || '';
  if (!pin) {
    document.getElementById('adminPinError').textContent = 'No admin PIN configured';
    document.getElementById('adminPinError').classList.remove('hidden');
    _pinEntry = '';
    updatePinDisplay();
    return;
  }
  if (_pinEntry === String(pin)) {
    setAdminMode(true);
    closeModal('adminLoginModal');
  } else {
    document.getElementById('adminPinError').classList.remove('hidden');
    _pinEntry = '';
    updatePinDisplay();
  }
}

function setAdminMode(on, quiet) {
  State.admin = on;
  sessionStorage.setItem('hub_admin', on ? '1' : '0');

  const btn = document.getElementById('adminBtn');
  const badge = document.getElementById('adminBadge');

  if (on) {
    btn.classList.add('active');
    badge.classList.remove('hidden');
  } else {
    btn.classList.remove('active');
    badge.classList.add('hidden');
    closeModal('adminLoginModal');
  }

  // Toggle admin bars
  ['calAdminBar','eventsAdminBar','maintAdminBar','sopsAdminBar'].forEach(id => {
    document.getElementById(id)?.classList.toggle('hidden', !on);
  });

  // Re-render current view to show/hide edit affordances
  App.cal.render();
  App.events.render();
  App.maint.renderEquipment();
  App.sops.render();

  if (!quiet) showToast(on ? 'Admin mode on' : 'Admin mode off', 'success');
}

// ── Modal helpers ──────────────────────────────────────────────
function openModal(id) {
  document.getElementById(id)?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id)?.classList.add('hidden');
  // Only restore scroll if no other modals open
  if (!document.querySelector('.modal-overlay:not(.hidden)')) {
    document.body.style.overflow = '';
  }
}

function overlayClose(e, id) {
  if (e.target === e.currentTarget) closeModal(id);
}

function toggleEventTime() {
  const allDay = document.getElementById('evtAllDay').checked;
  document.getElementById('evtTimeRow').classList.toggle('hidden', allDay);
}

// ── Toast ──────────────────────────────────────────────────────
let _toastTimer;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (type ? ' ' + type : '');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.add('hidden'), 2800);
}

function showFormError(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

// ── Calendar cell builder ──────────────────────────────────────
function makeCell(day, otherMonth, dateStr, events, isToday, isSelected) {
  const div = document.createElement('div');
  div.className = 'cal-cell' +
    (otherMonth ? ' other-month' : '') +
    (isToday    ? ' today'       : '') +
    (isSelected ? ' selected'    : '') +
    (events.length ? ' has-events' : '');

  div.innerHTML = `<span>${day}</span>`;

  if (events.length) {
    const dots = document.createElement('div');
    dots.className = 'cal-dots';
    const shown = events.slice(0, 3);
    shown.forEach(ev => {
      const d = document.createElement('span');
      d.className = 'cal-dot';
      d.style.background = evTypeColour(ev.event_type);
      dots.appendChild(d);
    });
    div.appendChild(dots);
  }

  if (!otherMonth && dateStr) {
    div.addEventListener('click', () => {
      if (State.admin && !events.length) {
        App.cal.openAdd(dateStr);
      } else {
        App.cal.selectDay(dateStr);
      }
    });
  }

  return div;
}

// ── Render helpers ─────────────────────────────────────────────
function eventCardHTML(ev, admin) {
  const colour = evTypeColour(ev.event_type);
  const dateStr = fmtEventDate(ev);
  return `<div class="event-card ${admin ? 'admin-card' : ''}" style="border-left-color:${colour}" ${admin ? `onclick="App.cal.openEdit(App.cal.data.find(e=>e.id==='${ev.id}'))"` : ''}>
    <div class="event-card-body">
      <div class="event-card-title">${esc(ev.title)}</div>
      <div class="event-card-meta">
        <span>${dateStr}</span>
        ${ev.location ? `<span>📍 ${esc(ev.location)}</span>` : ''}
        <span class="event-badge" style="color:${colour};border-color:${colour}">${evTypeLabel(ev.event_type)}</span>
      </div>
      ${ev.description ? `<div class="event-desc">${esc(ev.description)}</div>` : ''}
    </div>
  </div>`;
}

function nextDueBadge(rec) {
  if (!rec || !rec.next_due_date) return '';
  const today = new Date(); today.setHours(0,0,0,0);
  const due   = new Date(rec.next_due_date + 'T12:00:00');
  const days  = Math.round((due - today) / 86400000);

  if (days < 0)  return `<span class="item-card-badge badge-overdue">Overdue</span>`;
  if (days <= 14) return `<span class="item-card-badge badge-due-soon">Due Soon</span>`;
  return `<span class="item-card-badge badge-ok">OK</span>`;
}

// ── Formatting / utility ───────────────────────────────────────
function fmtDate(d) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}

function fmtDateShort(str) {
  if (!str) return '';
  const d = new Date(str.slice(0, 10) + 'T12:00:00');
  return d.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtEventDate(ev) {
  const s = fmtDateShort(ev.start_date);
  const e = ev.end_date && ev.end_date.slice(0, 10) !== ev.start_date.slice(0, 10)
    ? ' – ' + fmtDateShort(ev.end_date)
    : '';
  if (!ev.all_day && ev.start_date.length > 10) {
    const t = ev.start_date.slice(11, 16);
    return s + ' at ' + t + e;
  }
  return s + e;
}

function pad2(n) { return String(n).padStart(2, '0'); }

function esc(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function evTypeColour(type) {
  const map = {
    general:'#00aeef', racing:'#e63946', social:'#fee01e',
    training:'#27ae60', maintenance:'#f4a261',
  };
  return map[type] || map.general;
}

function evTypeLabel(type) {
  return { general:'General', racing:'Racing', social:'Social', training:'Training', maintenance:'Maintenance' }[type] || type;
}

function eqIcon(type) {
  return { tractor:'🚜', rib:'🚤', engine:'⚙️', safety_boat:'🛥️', other:'🔧' }[type] || '🔧';
}

function eqTypeLabel(type) {
  return { tractor:'Tractor', rib:'RIB', engine:'Engine', safety_boat:'Safety Boat', other:'Other' }[type] || type;
}

function catLabel(cat) {
  return { general:'General', tractor:'Tractor', rib:'RIB', engine:'Engine',
           safety:'Safety', launch:'Launch', recovery:'Recovery' }[cat] || cat;
}

// ── Service Worker ─────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(e => console.warn('SW reg failed', e));
}

// ── Boot ───────────────────────────────────────────────────────
App.init();
