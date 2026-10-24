// Scheduled function (see netlify.toml) — "Results are up" notifications.
//
// Every 10 minutes, for each club whose Results Source is Sail Scoring:
//   1. find the club's published series: Sail Scoring's public series index
//      (/p/<ws>/index.json, features.ssWorkspace). Each publication with an
//      `api` link is read through the published results API
//      (docs/public-api.md — keyless, the stable contract). If the index
//      can't be read (it used to answer servers with a 429 bot challenge;
//      it no longer did as of 2026-10-24), or for publications without an
//      API link, this falls back to the Sail Scoring API with the club's
//      key (_sailscoring.js; settings.ss_api_key, migration 069) and the
//      series' public .sailscoring.json files, plus any series addresses
//      saved in Sail Scoring Setup (features.ssSeriesUrls).
//   2. count the races in each that have results (any finisher scored).
//   3. compare with what it saw last time (results_watch, migration 075):
//        - a series seen for the first time is only recorded, never
//          announced, so the first run doesn't push a season's history;
//        - more scored races than last time -> "Race N results are up":
//          each racing boat's skipper gets that boat's own place(s), crew
//          subscribers a general line (send-push results_published, signed
//          with the club's service key so only this function can send it);
//        - corrections to races already announced are silent.
//
// Like detect-finishes.js this walks every CLUB_CONFIG_<SLUG> env var
// itself (no request hostname to resolve a club from). A club without a
// service key, push setup, migration 075 or any way to find its series is
// skipped with a reason in the log.

const crypto = require('crypto');
const { envForSlug } = require('./_club');
const { apiGetForSlug } = require('./_sailscoring');

const MAX_SERIES = 20;

const sailKey = s => String(s == null ? '' : s).replace(/[^a-z0-9]/gi, '').toUpperCase();
const nameKey = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
const ordinal = n => n + (['th', 'st', 'nd', 'rd'][(n % 100 - 20) % 10] || ['th', 'st', 'nd', 'rd'][n % 100] || 'th');

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers: headers || { Accept: 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url.replace(/\?.*$/, ''));
  return r.json();
}

const SS_ORIGIN = 'https://app.sailscoring.ie';
const API_RE = /^https:\/\/([a-z0-9-]+\.)*sailscoring\.ie\/api\/public\/v1\/publications\/[A-Za-z0-9_-]+$/;
const DATA_RE = /^https:\/\/([a-z0-9-]+\.)*sailscoring\.ie\/.+\.sailscoring\.json$/i;

// The club's publications from Sail Scoring's public index, as
// [{seriesId, api, dataUrl, name}], or null if the index can't be read.
// Rows in results_watch are keyed by the data file address where there is
// one, so a series keeps its row if it gets an API link later.
async function listFromIndex(ws) {
  if (!/^[A-Za-z0-9_-]+$/.test(ws || '')) return null;
  let idx;
  try { idx = await fetchJson(SS_ORIGIN + '/p/' + ws + '/index.json'); }
  catch (e) { console.warn('[' + ws + '] Sail Scoring index unavailable: ' + e.message); return null; }
  if (!idx || !Array.isArray(idx.publications) || (typeof idx.version === 'number' && idx.version > 1)) return null;
  return idx.publications
    .filter(p => p && (API_RE.test(p.api || '') || DATA_RE.test(p.data || '')))
    .sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')))
    .slice(0, MAX_SERIES)
    .map(p => {
      const dataUrl = DATA_RE.test(p.data || '') ? p.data : null;
      const api = API_RE.test(p.api || '') ? p.api : null;
      return { seriesId: dataUrl || api, api, dataUrl, name: p.name || '' };
    });
}

// The club's series as [{seriesId, dataUrl, name}]: published, not orphaned,
// newest first; data URLs come from the publish status, cached in
// results_watch so each series costs one API call ever, not one per run.
async function listSeries(slug, known, features) {
  const out = [];
  const pub = await apiGetForSlug(slug, '/published');
  if (pub.status >= 200 && pub.status < 300 && Array.isArray(pub.body)) {
    const pubs = pub.body
      .filter(p => p && p.seriesId && !p.orphaned && !p.archived)
      .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
      .slice(0, MAX_SERIES);
    for (const p of pubs) {
      let dataUrl = known[p.seriesId] && known[p.seriesId].data_url;
      if (!dataUrl) {
        const st = await apiGetForSlug(slug, '/series/' + encodeURIComponent(p.seriesId) + '/publish');
        dataUrl = st.body && st.body.published && st.body.published.dataUrl;
      }
      if (dataUrl) out.push({ seriesId: p.seriesId, dataUrl, name: p.title || '' });
    }
  } else if (pub.status !== 0) {
    console.warn('[' + slug + '] Sail Scoring API ' + pub.status + ' — falling back to saved series addresses');
  }
  const saved = Array.isArray(features.ssSeriesUrls) ? features.ssSeriesUrls : [];
  saved.forEach(u => {
    if (typeof u === 'string' && /^https:\/\/([a-z0-9-]+\.)*sailscoring\.ie\/.+\.sailscoring\.json$/i.test(u) && !out.some(s => s.dataUrl === u)) {
      out.push({ seriesId: u, dataUrl: u, name: '' });
    }
  });
  return out;
}

// Indices of races with at least one scored finisher in any fleet
function scoredRaceIdx(doc) {
  const idx = new Set();
  (doc.standings || []).forEach(st => (st.rows || []).forEach(r => {
    (r.racePoints || []).forEach((p, i) => {
      if (p != null && !(r.raceCodes && r.raceCodes[i])) idx.add(i);
    });
  }));
  return [...idx].sort((a, b) => a - b);
}

// Each club boat that sailed race `i`: "Tux 2nd on ECHO" (one line per boat,
// both fleets when it's in two). Places are the race points of finishers.
function placesForRace(doc, i, boats) {
  const bySail = {}, byName = {};
  boats.forEach(b => {
    if (b.sail_number) bySail[sailKey(b.sail_number)] = b;
    byName[nameKey(b.name)] = b;
  });
  const comps = {};
  (doc.competitors || []).forEach(c => { comps[sailKey(c.sailNumber)] = c; });
  const fleetLabel = {};
  (doc.fleets || []).forEach(f => { fleetLabel[f.name] = f.label || f.name; });
  const lines = {}; // boatId -> [{fleet, text}]
  (doc.standings || []).forEach(st => (st.rows || []).forEach(r => {
    const k = sailKey(r.sailNumber);
    const comp = comps[k];
    const boat = bySail[k] || (comp && byName[nameKey(comp.boatName)]);
    if (!boat) return;
    const pts = r.racePoints && r.racePoints[i];
    if (pts == null) return;
    const code = r.raceCodes && r.raceCodes[i];
    const what = code ? code : ordinal(Math.floor(pts)); // a tie scores e.g. 2.5 — tied 2nd
    (lines[boat.id] = lines[boat.id] || []).push((fleetLabel[st.fleetName] || st.fleetName) + ' ' + what);
  }));
  const boatName = Object.fromEntries(boats.map(b => [b.id, b.name]));
  return Object.fromEntries(Object.entries(lines).map(([id, parts]) => [id, boatName[id] + ': ' + parts.join(', ')]));
}

// Same as placesForRace, from the results API's /races/{n} (per fleet:
// each boat's rank, points and code)
function placesForApiRace(race, boats) {
  const bySail = {}, byName = {};
  boats.forEach(b => {
    if (b.sail_number) bySail[sailKey(b.sail_number)] = b;
    byName[nameKey(b.name)] = b;
  });
  const lines = {};
  (race.fleets || []).forEach(f => {
    if (!f || !f.fleet || f.subSeries) return;
    (f.results || []).forEach(x => {
      const c = (x && x.competitor) || {};
      const boat = bySail[sailKey(c.sailNumber)] || (c.boatName && byName[nameKey(c.boatName)]);
      if (!boat || (x.points == null && !x.code)) return;
      const place = Number.isInteger(x.rank) ? x.rank : (x.points != null ? Math.floor(x.points) : null);
      const what = x.code || (place ? ordinal(place) : null);
      if (what) (lines[boat.id] = lines[boat.id] || []).push((f.fleet.name || f.fleet.key) + ' ' + what);
    });
  });
  const boatName = Object.fromEntries(boats.map(b => [b.id, b.name]));
  return Object.fromEntries(Object.entries(lines).map(([id, parts]) => [id, boatName[id] + ': ' + parts.join(', ')]));
}

// A series through the results API: its sailed races (those with results
// in any fleet) and, on demand, one race's places per club boat
async function readApiSeries(s) {
  const list = await fetchJson(s.api + '/races');
  const sailed = (list.races || []).filter(r => r && Number.isInteger(r.race) && Array.isArray(r.fleets) && r.fleets.length);
  return {
    count: sailed.length,
    latest: sailed.length ? sailed[sailed.length - 1].race : null,
    places: async (n, boats) => placesForApiRace(await fetchJson(s.api + '/races/' + n), boats),
  };
}
// The same from a .sailscoring.json data file
async function readDataSeries(s) {
  const doc = await fetchJson(s.dataUrl + (s.dataUrl.includes('?') ? '&' : '?') + 't=' + Date.now());
  const scored = scoredRaceIdx(doc);
  const i = scored.length ? scored[scored.length - 1] : null;
  const race = i != null ? (doc.races || [])[i] || {} : {};
  return {
    count: scored.length,
    latest: i == null ? null : (race.raceNumber != null ? race.raceNumber : i + 1),
    name: doc.series && doc.series.name,
    places: async (n, boats) => placesForRace(doc, i, boats),
  };
}

async function notify(slug, serviceKey, payload) {
  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) { console.warn('[' + slug + '] results push skipped: no process.env.URL'); return null; }
  const signed = { type: 'results_published', title: payload.title, general: payload.general, perBoat: payload.perBoat };
  const sig = crypto.createHmac('sha256', serviceKey).update(JSON.stringify(signed)).digest('hex');
  const r = await fetch(base + '/.netlify/functions/send-push?club=' + encodeURIComponent(slug), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...signed, sig }),
  });
  const text = await r.text();
  if (!r.ok) console.warn('[' + slug + '] results push HTTP ' + r.status + ': ' + text.slice(0, 200));
  return text;
}

async function processClub(slug, config) {
  const serviceKey = envForSlug(slug, 'SUPABASE_SERVICE_KEY');
  if (!config.sbUrl || !serviceKey) return { slug, skipped: 'no service key' };
  const h = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json' };

  const settings = (await fetchJson(config.sbUrl + '/rest/v1/settings?id=eq.club&select=features', h))[0] || {};
  const features = settings.features || {};
  const src = features.resultsSource || (features.sailScoring ? 'sailscoring' : 'halsail');
  if (src !== 'sailscoring') return { slug, skipped: 'results source is ' + src };

  let watched;
  try { watched = await fetchJson(config.sbUrl + '/rest/v1/results_watch?select=*', h); }
  catch (e) { return { slug, skipped: 'results_watch table missing (migration 075)' }; }
  const known = Object.fromEntries(watched.map(w => [w.series_id, w]));

  // The public index and results API first; the keyed API if the index
  // can't be read. Saved addresses not in either are added as data files.
  let series = await listFromIndex(features.ssWorkspace);
  if (series) {
    const saved = Array.isArray(features.ssSeriesUrls) ? features.ssSeriesUrls : [];
    saved.forEach(u => {
      if (typeof u === 'string' && DATA_RE.test(u) && !series.some(s => s.dataUrl === u)) series.push({ seriesId: u, api: null, dataUrl: u, name: '' });
    });
  } else {
    series = await listSeries(slug, known, features);
  }
  if (!series.length) return { slug, skipped: 'no series found (Sail Scoring workspace, API key or saved addresses needed)' };

  let boats = null;
  const done = [];
  for (const s of series) {
    let rd;
    try { rd = s.api ? await readApiSeries(s) : await readDataSeries(s); }
    catch (e) { done.push({ series: s.name || s.api || s.dataUrl, error: e.message }); continue; }
    const scored = rd.count;
    const name = s.name || rd.name || 'Series';
    const row = known[s.seriesId];
    const upsert = fields => fetch(config.sbUrl + '/rest/v1/results_watch', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ series_id: s.seriesId, data_url: s.dataUrl || s.api, name, updated_at: new Date().toISOString(), ...fields }),
    });

    if (!row) { // first sight: record, don't announce
      await upsert({ scored_races: scored, last_notified_race: null });
      done.push({ series: name, recorded: scored });
      continue;
    }
    if (scored <= row.scored_races) {
      if (scored !== row.scored_races) await upsert({ scored_races: scored }); // a race un-scored: just track it
      continue;
    }

    // New race(s) with results: announce the latest one
    const raceNo = rd.latest;
    const newCount = scored - row.scored_races;
    if (!boats) boats = await fetchJson(config.sbUrl + '/rest/v1/boats?select=id,name,sail_number', h).catch(() => []);
    const title = '🏆 ' + (newCount > 1 ? 'Results are up' : 'Race ' + raceNo + ' results');
    const general = (newCount > 1 ? newCount + ' new races scored, latest Race ' + raceNo : 'Race ' + raceNo + ' results are up') + ' — ' + name;
    const places = await rd.places(raceNo, boats).catch(e => { console.warn('[' + slug + '] places for ' + name + ' R' + raceNo + ': ' + e.message); return {}; });
    const perBoat = Object.fromEntries(Object.entries(places)
      .map(([id, line]) => [id, line + ' · Race ' + raceNo + ', ' + name]));
    const res = await notify(slug, serviceKey, { title, general, perBoat });
    await upsert({ scored_races: scored, last_notified_race: raceNo });
    done.push({ series: name, announced: raceNo, boats: Object.keys(perBoat).length, push: res && res.slice(0, 120) });
  }
  return { slug, series: series.length, done };
}

exports.handler = async () => {
  const clubs = Object.entries(process.env)
    .map(([key, value]) => {
      const m = key.match(/^CLUB_CONFIG_([A-Z0-9]+)$/);
      if (!m) return null;
      try { return [m[1].toLowerCase(), JSON.parse(value)]; } catch (e) { return null; }
    })
    .filter(Boolean);
  const results = [];
  for (const [slug, config] of clubs) {
    try { results.push(await processClub(slug, config)); }
    catch (e) {
      console.error('[' + slug + '] results-watch error:', e);
      results.push({ slug, error: String(e.message || e) });
    }
  }
  console.log('results-watch run complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ ranAt: new Date().toISOString(), results }) };
};
