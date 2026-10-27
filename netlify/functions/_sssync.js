// Sail Scoring → the app's race list (migration 079). Sail Scoring is the
// master for a Sail Scoring club's series and races: the scorer sets them up
// there, and this keeps the club's `races` table in step, so the calendar,
// race cards, registrations, start sequence and Finish Line all follow.
// Used by the scheduled ss-sync.js and by the RO (ss-ro.js 'sync', and after
// each RO change in Sail Scoring).
//
// Only upcoming racing is touched — races dated from SYNC_BACK_DAYS ago on.
// Earlier races are history: left exactly as they are.
//
// For each race in a Sail Scoring series that isn't archived:
//   - already linked (races.ss_race_id): its date, start time and series
//     follow Sail Scoring, and it's active;
//   - not linked yet: an unlinked app race on the same day is linked to it
//     (same start time, or the only race that day on both sides) — races
//     entered by hand before syncing aren't duplicated;
//   - otherwise it's added, labelled like the app's own ("<series> — Wed Oct 28").
// A linked upcoming race that's gone from Sail Scoring (deleted, or its
// series archived) is made inactive, never deleted: registrations,
// payments and finish recordings hang off it.
//
// The label is set when a race is added and otherwise left alone, unless
// its date moves: registrations, payments and finish recordings are keyed
// by date + label (raceKey() in app.js), so relabelling an unmoved race
// would cut them off.

const { clubDb, readConnection, wsApi } = require('./_sailscoring');

const SYNC_BACK_DAYS = 2;
const enc = encodeURIComponent;

const dublinToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Dublin' });
function addDays(ymd, n) {
  const d = new Date(ymd + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// "Winter Series — Wed Oct 28", the app's own label style
function makeLabel(seriesName, ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  const wd = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
  const mo = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  return seriesName + ' — ' + wd + ' ' + mo + ' ' + d.getUTCDate();
}
// The race's first gun, as start_hour/start_min, or null when no start has a time
function firstGun(race) {
  const t = (race.starts || []).map(s => s && s.startTime).filter(Boolean).sort()[0];
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return { start_hour: h, start_min: m };
}

async function syncClub(slug) {
  const db = clubDb(slug);
  if (!db) return { skipped: 'no service key' };
  let conn;
  try { conn = await readConnection(slug); } catch (e) { return { skipped: e.message }; }
  if (!conn || conn.status !== 'connected') return { skipped: 'not connected to Sail Scoring' };
  const probe = await db.req('races?select=ss_race_id&limit=1');
  if (!probe.ok) return { skipped: 'migration 079 not applied' };

  const from = addDays(dublinToday(), -SYNC_BACK_DAYS);

  // Sail Scoring's upcoming races, every series that isn't archived
  const sl = await wsApi(slug, 'GET', '/series');
  if (sl.status !== 200 || !sl.body || !Array.isArray(sl.body.series)) {
    return { error: 'Could not list the series (' + (sl.error || 'HTTP ' + sl.status) + ')' };
  }
  const ssRaces = [];
  for (const s of sl.body.series.filter(x => x && x.id && !x.archived)) {
    const r = await wsApi(slug, 'GET', '/series/' + enc(s.id) + '/races');
    if (r.status !== 200 || !r.body || !Array.isArray(r.body.races)) {
      // Without every series, a missing race can't be told from a failed read
      return { error: 'Could not read the races of ' + (s.name || s.id) + ' (' + (r.error || 'HTTP ' + r.status) + ')' };
    }
    r.body.races.forEach(x => { if (x && x.id && x.date && x.date >= from) ssRaces.push({ ...x, seriesId: s.id, seriesName: s.name || 'Series' }); });
  }

  // The app's races from the same day on, and every linked one
  const ar = await db.req('races?select=id,label,race_date,start_hour,start_min,series,active,ss_race_id,ss_series_id'
    + '&or=(race_date.gte.' + from + ',ss_race_id.not.is.null)');
  if (!ar.ok || !Array.isArray(ar.body)) return { error: 'Could not read the app\'s races (HTTP ' + ar.status + ')' };
  const appRaces = ar.body;
  const byLink = {};
  appRaces.forEach(r => { if (r.ss_race_id) byLink[r.ss_race_id] = r; });

  const out = { added: 0, linked: 0, updated: 0, deactivated: 0, unchanged: 0 };
  const patch = (id, fields) => db.req('races?id=eq.' + enc(id), { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: fields });

  for (const x of ssRaces.sort((a, b) => a.date.localeCompare(b.date))) {
    const gun = firstGun(x);
    let row = byLink[x.id];
    if (!row) {
      // Link an app race entered by hand for the same day, if it's clearly this one
      const sameDay = appRaces.filter(r => !r.ss_race_id && r.race_date === x.date);
      const ssSameDay = ssRaces.filter(o => o.date === x.date && !byLink[o.id]);
      row = (gun && sameDay.find(r => r.start_hour === gun.start_hour && r.start_min === gun.start_min))
        || (sameDay.length === 1 && ssSameDay.length === 1 ? sameDay[0] : null);
      if (row) {
        const res = await patch(row.id, { ss_race_id: x.id, ss_series_id: x.seriesId, series: x.seriesName, active: true, ...(gun || {}) });
        if (!res.ok) return { error: 'Could not link a race (HTTP ' + res.status + ')', ...out };
        row.ss_race_id = x.id; byLink[x.id] = row;
        out.linked++;
        continue;
      }
      const res = await db.req('races', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: {
        label: makeLabel(x.seriesName, x.date), race_date: x.date, series: x.seriesName, active: true,
        ss_race_id: x.id, ss_series_id: x.seriesId, ...(gun || {}),
      } });
      if (!res.ok) return { error: 'Could not add a race (HTTP ' + res.status + ')', ...out };
      out.added++;
      continue;
    }
    // Linked: date, gun and series follow Sail Scoring
    const fields = {};
    if (row.race_date !== x.date) { fields.race_date = x.date; fields.label = makeLabel(x.seriesName, x.date); }
    if (gun && (row.start_hour !== gun.start_hour || row.start_min !== gun.start_min)) Object.assign(fields, gun);
    if (row.series !== x.seriesName) fields.series = x.seriesName;
    if (!row.active) fields.active = true;
    if (row.ss_series_id !== x.seriesId) fields.ss_series_id = x.seriesId;
    if (Object.keys(fields).length) {
      const res = await patch(row.id, fields);
      if (!res.ok) return { error: 'Could not update a race (HTTP ' + res.status + ')', ...out };
      out.updated++;
    } else out.unchanged++;
  }

  // Linked upcoming races Sail Scoring no longer has
  const live = new Set(ssRaces.map(x => x.id));
  for (const r of appRaces) {
    if (r.ss_race_id && r.active && r.race_date >= from && !live.has(r.ss_race_id)) {
      const res = await patch(r.id, { active: false });
      if (res.ok) out.deactivated++;
    }
  }
  return out;
}

module.exports = { syncClub, makeLabel };
