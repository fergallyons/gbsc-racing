// Race Officer actions in the club's Sail Scoring workspace, through the
// club's connection (ss-connect.js / _sailscoring.js wsApi, migrations
// 076/078). Called from the RO's Results panel and the Finish Line panel:
//
//   POST { action: 'day', pin, date }
//     the day's races across every series, with their starts (fleet names),
//     finishes and finish-sheet submissions so far, and each series'
//     publication
//   POST { action: 'startTime', pin, raceId, startId, startTime }   move a gun
//   POST { action: 'deleteStart', pin, raceId, startId }            cancel a start
//   POST { action: 'deleteRace', pin, seriesId, raceId }            cancel a race —
//     refused while it has finishes, so recorded results can't be lost
//   POST { action: 'publish', pin, seriesId }    republish a published series
//   POST { action: 'submit', pin, raceId, seriesId, submissionId, revision,
//          rows, complete }
//     hand the Finish Line's recording to the scorer as a finish-sheet
//     submission: rows [{ id, sailNumber, boatName, finishTime | resultCode }]
//     in crossing order; boats are named by Sail Scoring entry id where the
//     sail number or boat name matches one, else by the sail number written
//     down. Each send is the whole recording at a higher revision.
//   POST { action: 'submission', pin, raceId, submissionId }  where the scorer is
//   POST { action: 'entries', pin, seriesId }   the series' entry list, for
//     the Finish Line when nobody registered for a synced race in the app
//   POST { action: 'sync', pin }   bring the app's race list in step with
//     Sail Scoring now (_sssync.js) — also run after each change above
//
// Every action needs the club's RO or Club Admin PIN (roPinOk). The club
// comes from the hostname or ?club= (resolveClubSlug); the PIN is checked
// against that club. Sail Scoring's own refusals (role, workspace settings,
// validation) come back as { status, error, message } so the RO sees why.

const crypto = require('crypto');
const { resolveClubSlug } = require('./_club');
const { clubDb, wsApi, roPinOk } = require('./_sailscoring');
const { syncClub } = require('./_sssync');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
const RESULT_CODES = ['DNC', 'DNS', 'OCS', 'NSC', 'DNF', 'RET', 'DSQ', 'DNE', 'UFD', 'BFD'];

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});
// A Sail Scoring reply that isn't success, as the app shows it
function failure(r, what) {
  if (r.status === 0) {
    return json(409, { error: r.error || 'not-connected', message: r.error === 'lapsed'
      ? 'The Sail Scoring connection has ended — reconnect in Sail Scoring Setup'
      : 'Not connected to Sail Scoring — connect in Sail Scoring Setup' });
  }
  const b = r.body || {};
  const detail = Array.isArray(b.problems) && b.problems.length
    ? ' (' + b.problems.map(p => p.field + ': ' + p.message).join('; ') + ')' : '';
  return json(r.status >= 400 && r.status < 600 ? r.status : 502, {
    error: b.error || 'sailscoring', message: what + ' — Sail Scoring said: ' + (b.message || ('HTTP ' + r.status)) + detail,
  });
}
// The app's race list follows a change the RO just made; a failure here
// doesn't undo the change, it's only reported
async function syncAfter(slug) {
  try { return await syncClub(slug); } catch (e) { return { error: e.message }; }
}
const sailKey = s => String(s == null ? '' : s).replace(/[^a-z0-9]/gi, '').toUpperCase();
const nameKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const enc = encodeURIComponent;

async function day(slug, date) {
  const r = await wsApi(slug, 'GET', '/races?date=' + enc(date));
  if (r.status !== 200) return failure(r, 'Could not load the day\'s races');
  const races = Array.isArray(r.body && r.body.races) ? r.body.races : [];
  const seriesIds = [...new Set(races.map(x => x.seriesId).filter(Boolean))];
  const series = {};
  await Promise.all(seriesIds.map(async id => {
    const [fl, pub] = await Promise.all([
      wsApi(slug, 'GET', '/series/' + enc(id) + '/fleets'),
      wsApi(slug, 'GET', '/series/' + enc(id) + '/publish'),
    ]);
    const fleets = {};
    (fl.status === 200 && fl.body && Array.isArray(fl.body.fleets) ? fl.body.fleets : []).forEach(f => { if (f && f.id) fleets[f.id] = f.name || f.id; });
    const p = pub.status === 200 && pub.body ? pub.body.publication : null;
    series[id] = { fleets, publication: p ? { url: p.url || null, publishedAt: p.publishedAt || null } : null };
  }));
  const out = await Promise.all(races.map(async race => {
    const [fin, sub] = await Promise.all([
      wsApi(slug, 'GET', '/races/' + enc(race.id) + '/finishes'),
      wsApi(slug, 'GET', '/races/' + enc(race.id) + '/submissions'),
    ]);
    const fleets = (series[race.seriesId] || {}).fleets || {};
    return {
      id: race.id, number: race.number, name: race.name || null, date: race.date,
      seriesId: race.seriesId, seriesName: race.seriesName,
      starts: (race.starts || []).map(s => ({
        id: s.id, startTime: s.startTime || null,
        fleets: (s.fleetIds || []).map(f => fleets[f] || 'Fleet'),
      })),
      finishes: fin.status === 200 && fin.body && Array.isArray(fin.body.finishes) ? fin.body.finishes.length : null,
      submissions: (sub.status === 200 && sub.body && Array.isArray(sub.body.submissions) ? sub.body.submissions : [])
        .map(s => ({ id: s.id, revision: s.revision, status: s.status, recordedBy: s.recordedBy || null, submittedAt: s.submittedAt || null })),
    };
  }));
  out.sort((a, b) => String(a.seriesName).localeCompare(String(b.seriesName)) || a.number - b.number);
  return json(200, {
    date,
    races: out,
    series: seriesIds.map(id => ({ id, name: (races.find(x => x.seriesId === id) || {}).seriesName || '', publication: series[id].publication })),
  });
}

// The Finish Line's rows → SubmitFinishes. Boats named by Sail Scoring entry
// id where one matches (sail number, else boat name), else by the sail
// number written down (or the boat's name, when it has none) for the scorer
// to resolve.
async function buildFinishes(slug, seriesId, rows) {
  const c = await wsApi(slug, 'GET', '/series/' + enc(seriesId) + '/competitors');
  const comps = c.status === 200 && c.body && Array.isArray(c.body.competitors) ? c.body.competitors : [];
  const bySail = {}, byName = {};
  comps.forEach(x => {
    if (!x || !UUID.test(String(x.id || ''))) return;
    const k = sailKey(x.sailNumber); if (k && !bySail[k]) bySail[k] = x.id;
    const n = nameKey(x.boatName); if (n && !byName[n]) byName[n] = x.id;
  });
  return rows.map(row => {
    const id = String(row.id || '').slice(0, 64);
    // A row recorded against the Sail Scoring entry list already names its entry
    const competitorId = (UUID.test(String(row.competitorId || '')) && row.competitorId)
      || bySail[sailKey(row.sailNumber)] || byName[nameKey(row.boatName)] || null;
    const f = { id };
    if (competitorId) f.competitorId = competitorId;
    else f.sailNumber = String(row.sailNumber || row.boatName || '?').slice(0, 40);
    if (row.resultCode) f.resultCode = row.resultCode;
    else f.finishTime = row.finishTime;
    return f;
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const slug = resolveClubSlug(event);
  const db = clubDb(slug);
  if (!db) return json(503, { error: 'not-configured', message: 'This club has no server key set up' });
  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'invalid' }); }
  if (!(await roPinOk(db.cfg, req.pin))) return json(403, { error: 'pin', message: 'RO or Club Admin PIN required' });

  const a = req.action;
  const bad = msg => json(400, { error: 'invalid', message: msg });

  if (a === 'day') {
    if (!DATE.test(req.date || '')) return bad('Date must be YYYY-MM-DD');
    return day(slug, req.date);
  }

  if (a === 'sync') {
    const r = await syncClub(slug);
    return r.error || r.skipped ? json(r.error ? 502 : 409, { error: 'sync', message: r.error || r.skipped, ...r }) : json(200, { ok: true, sync: r });
  }

  if (a === 'entries') {
    // A series' entry list for the Finish Line: entry id, sail number,
    // boat name and the fleets it's entered in (excluded entries left out)
    if (!UUID.test(req.seriesId || '')) return bad('Unknown series');
    const [c, fl] = await Promise.all([
      wsApi(slug, 'GET', '/series/' + enc(req.seriesId) + '/competitors'),
      wsApi(slug, 'GET', '/series/' + enc(req.seriesId) + '/fleets'),
    ]);
    if (c.status !== 200) return failure(c, 'Could not load the entry list');
    const fleets = {};
    (fl.status === 200 && fl.body && Array.isArray(fl.body.fleets) ? fl.body.fleets : []).forEach(f => { if (f && f.id) fleets[f.id] = f.name || ''; });
    const entries = (Array.isArray(c.body && c.body.competitors) ? c.body.competitors : [])
      .filter(x => x && UUID.test(String(x.id || '')) && !x.excluded)
      .map(x => ({ id: x.id, sailNumber: x.sailNumber || '', boatName: x.boatName || '',
        fleets: (x.fleetIds || []).map(f => fleets[f]).filter(Boolean) }));
    return json(200, { entries });
  }

  if (a === 'startTime') {
    if (!UUID.test(req.raceId || '') || !UUID.test(req.startId || '')) return bad('Unknown start');
    if (!TIME.test(req.startTime || '')) return bad('Start time must be HH:MM or HH:MM:SS');
    const r = await wsApi(slug, 'PATCH', '/races/' + enc(req.raceId) + '/starts/' + enc(req.startId), { body: { startTime: req.startTime } });
    if (r.status !== 200) return failure(r, 'Could not change the start time');
    return json(200, { ok: true, start: { id: r.body.id, startTime: r.body.startTime }, sync: await syncAfter(slug) });
  }

  if (a === 'deleteStart') {
    if (!UUID.test(req.raceId || '') || !UUID.test(req.startId || '')) return bad('Unknown start');
    const r = await wsApi(slug, 'DELETE', '/races/' + enc(req.raceId) + '/starts/' + enc(req.startId));
    if (r.status < 200 || r.status >= 300) return failure(r, 'Could not cancel the start');
    return json(200, { ok: true, sync: await syncAfter(slug) });
  }

  if (a === 'deleteRace') {
    if (!UUID.test(req.seriesId || '') || !UUID.test(req.raceId || '')) return bad('Unknown race');
    // Never delete recorded results: only a race with no finishes yet
    const fin = await wsApi(slug, 'GET', '/races/' + enc(req.raceId) + '/finishes');
    if (fin.status !== 200) return failure(fin, 'Could not check the race\'s finishes');
    const n = Array.isArray(fin.body && fin.body.finishes) ? fin.body.finishes.length : 0;
    if (n) return json(409, { error: 'conflict', message: 'This race has ' + n + ' finish' + (n === 1 ? '' : 'es') + ' in Sail Scoring — cancel it there if it really should go' });
    const r = await wsApi(slug, 'DELETE', '/series/' + enc(req.seriesId) + '/races/' + enc(req.raceId));
    if (r.status < 200 || r.status >= 300) return failure(r, 'Could not cancel the race');
    return json(200, { ok: true, sync: await syncAfter(slug) });
  }

  if (a === 'publish') {
    if (!UUID.test(req.seriesId || '')) return bad('Unknown series');
    // Republish only: a first publish chooses the season, folder and page
    // address, which belongs in Sail Scoring itself
    const cur = await wsApi(slug, 'GET', '/series/' + enc(req.seriesId) + '/publish');
    if (cur.status !== 200) return failure(cur, 'Could not check the series\' publication');
    if (!cur.body || !cur.body.publication) return json(409, { error: 'conflict', message: 'This series hasn\'t been published yet — publish it once in Sail Scoring, then republish from here' });
    const r = await wsApi(slug, 'POST', '/series/' + enc(req.seriesId) + '/publish', { body: {}, headers: { 'Idempotency-Key': crypto.randomUUID() } });
    const p = r.status === 200 && r.body && r.body.publication;
    return p ? json(200, { ok: true, publication: { url: p.url || null, publishedAt: p.publishedAt || null } }) : failure(r, 'Could not publish');
  }

  if (a === 'submit') {
    if (!UUID.test(req.raceId || '') || !UUID.test(req.seriesId || '') || !UUID.test(req.submissionId || '')) return bad('Unknown race or submission');
    const rows = Array.isArray(req.rows) ? req.rows : [];
    if (!rows.length || rows.length > 500) return bad('Nothing to send');
    for (const row of rows) {
      if (!row || !row.id) return bad('Every row needs an id');
      if (row.resultCode ? !RESULT_CODES.includes(row.resultCode) : !TIME.test(row.finishTime || '')) return bad('Bad finish for ' + (row.boatName || row.sailNumber || row.id));
    }
    let revision = Math.max(1, parseInt(req.revision, 10) || 1);
    const finishes = await buildFinishes(slug, req.seriesId, rows);
    const path = '/races/' + enc(req.raceId) + '/submissions/' + enc(req.submissionId);
    const send = () => wsApi(slug, 'PUT', path, { body: {
      revision, recordedBy: 'RaceOps Finish Line', starts: [], finishes, complete: !!req.complete,
    } });
    let r = await send();
    if (r.status === 409) {
      // Sail Scoring already holds this revision or a later one (another
      // device, or a send whose reply was lost): go one past it
      const cur = await wsApi(slug, 'GET', path);
      if (cur.status === 200 && cur.body && Number.isInteger(cur.body.revision)) { revision = cur.body.revision + 1; r = await send(); }
    }
    if (r.status !== 200 || !r.body) return failure(r, 'Could not send the finishes');
    const s = r.body;
    return json(200, { ok: true, submission: {
      id: s.id, revision: s.revision, status: s.status, matched: s.matched,
      unknownSailNumbers: s.unknownSailNumbers || [], skipped: s.skipped || [], reviewUrl: s.reviewUrl || null,
    } });
  }

  if (a === 'submission') {
    if (!UUID.test(req.raceId || '') || !UUID.test(req.submissionId || '')) return bad('Unknown submission');
    const r = await wsApi(slug, 'GET', '/races/' + enc(req.raceId) + '/submissions/' + enc(req.submissionId));
    if (r.status === 404) return json(200, { submission: null });
    if (r.status !== 200 || !r.body) return failure(r, 'Could not check the submission');
    const s = r.body;
    return json(200, { submission: {
      id: s.id, revision: s.revision, status: s.status, matched: s.matched, reviewedRevision: s.reviewedRevision ?? null,
      unknownSailNumbers: s.unknownSailNumbers || [], skipped: s.skipped || [], reviewUrl: s.reviewUrl || null,
    } });
  }

  return bad('Unknown action');
};
