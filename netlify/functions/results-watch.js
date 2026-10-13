// Scheduled function (see netlify.toml) — "Results are up" notifications.
//
// Every 10 minutes, for each club whose Results Source is Sail Scoring:
//   1. find the club's published series. Sail Scoring's public series index
//      (/p/<ws>/index.json) can't be used from a server — it answers non-
//      browser requests with a 429 bot challenge — so this uses the
//      Sail Scoring API with the club's key (_sailscoring.js; settings
//      .ss_api_key, migration 069), plus any series addresses saved in
//      Sail Scoring Setup (features.ssSeriesUrls). The series' public
//      .sailscoring.json files themselves load fine server-side.
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

  const series = await listSeries(slug, known, features);
  if (!series.length) return { slug, skipped: 'no series found (Sail Scoring API key or saved addresses needed)' };

  let boats = null;
  const done = [];
  for (const s of series) {
    let doc;
    try { doc = await fetchJson(s.dataUrl + (s.dataUrl.includes('?') ? '&' : '?') + 't=' + Date.now()); }
    catch (e) { done.push({ series: s.name || s.dataUrl, error: e.message }); continue; }
    const scored = scoredRaceIdx(doc);
    const name = (doc.series && doc.series.name) || s.name || 'Series';
    const row = known[s.seriesId];
    const upsert = fields => fetch(config.sbUrl + '/rest/v1/results_watch', {
      method: 'POST',
      headers: { ...h, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ series_id: s.seriesId, data_url: s.dataUrl, name, updated_at: new Date().toISOString(), ...fields }),
    });

    if (!row) { // first sight: record, don't announce
      await upsert({ scored_races: scored.length, last_notified_race: null });
      done.push({ series: name, recorded: scored.length });
      continue;
    }
    if (scored.length <= row.scored_races) {
      if (scored.length !== row.scored_races) await upsert({ scored_races: scored.length }); // a race un-scored: just track it
      continue;
    }

    // New race(s) with results: announce the latest one
    const i = scored[scored.length - 1];
    const race = (doc.races || [])[i] || {};
    const raceNo = race.raceNumber != null ? race.raceNumber : i + 1;
    const newCount = scored.length - row.scored_races;
    if (!boats) boats = await fetchJson(config.sbUrl + '/rest/v1/boats?select=id,name,sail_number', h).catch(() => []);
    const title = '🏆 ' + (newCount > 1 ? 'Results are up' : 'Race ' + raceNo + ' results');
    const general = (newCount > 1 ? newCount + ' new races scored, latest Race ' + raceNo : 'Race ' + raceNo + ' results are up') + ' — ' + name;
    const perBoat = Object.fromEntries(Object.entries(placesForRace(doc, i, boats))
      .map(([id, line]) => [id, line + ' · Race ' + raceNo + ', ' + name]));
    const res = await notify(slug, serviceKey, { title, general, perBoat });
    await upsert({ scored_races: scored.length, last_notified_race: raceNo });
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
