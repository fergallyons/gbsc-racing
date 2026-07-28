// Scheduled function (see netlify.toml) — runs every minute across every
// configured club, looking for races marked `automated` whose start
// sequence has actually fired, and records a finish the first time each
// tracked boat's GPS path crosses the finish line after that start time.
//
// Built for the "no Officer of the Day present" scenario: nothing here
// waits for a human to confirm anything, because by definition there may
// not be one. A detected finish is written straight to race_finishes as
// the authoritative record; the RO's Finish Line panel picks it up
// whenever someone next opens it, for after-the-fact review — see
// 046_automated_finish_detection.sql for the full rationale.
//
// No single request/hostname to resolve a club from here (unlike every
// other function, which handles one HTTP request for one club) — this
// walks every CLUB_CONFIG_<SLUG> env var itself instead.
//
// Setup: same per-club SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_KEY_<SLUG>
// env vars send-push.js already documents and uses — reused here read-write
// instead of read-only, since this is the one thing in the app that writes
// results without a human clicking anything.

const { findCrossing } = require('./_geometry');

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(url + ' -> HTTP ' + r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

function raceKeyFor(race) {
  // Mirrors app.js's raceKey() exactly — must stay in sync with it.
  return race.race_date + '_' + race.label.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
}

async function processClub(slug, clubConfig) {
  const sbUrl = clubConfig.sbUrl, anonKey = clubConfig.sbKey;
  const serviceKey = process.env['SUPABASE_SERVICE_KEY_' + slug] || process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !anonKey) return { slug, skipped: 'no sbUrl/sbKey' };
  if (!serviceKey) return { slug, skipped: 'no SUPABASE_SERVICE_KEY configured — can\'t write results' };

  const anonHeaders = { apikey: anonKey, Authorization: 'Bearer ' + anonKey };
  const serviceHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };

  const today = new Date().toISOString().split('T')[0];
  const races = await fetchJson(
    sbUrl + '/rest/v1/races?race_date=eq.' + today + '&automated=eq.true&active=eq.true&select=*',
    anonHeaders,
  );
  if (!races.length) return { slug, races: 0 };

  const results = [];
  for (const race of races) {
    try {
      results.push(await processRace(sbUrl, anonHeaders, serviceHeaders, race));
    } catch (e) {
      results.push({ race: race.label, error: String(e.message || e) });
    }
  }
  return { slug, races: races.length, results };
}

async function processRace(sbUrl, anonHeaders, serviceHeaders, race) {
  const raceKey = raceKeyFor(race);
  const label = race.label;

  // Has the start sequence actually fired? Same "most recent non-cancelled
  // start" resolution app.js's sbLoadActiveStart() uses — race_starts has
  // no race linkage of its own (this app only ever runs one live start
  // sequence at a time), so this is the authoritative gun time for
  // whichever race is actually in progress right now.
  const starts = await fetchJson(
    sbUrl + '/rest/v1/race_starts?status=in.(armed,postponed)&order=start_time.desc&limit=1',
    anonHeaders,
  );
  const startRow = starts[0];
  if (!startRow) return { race: label, skipped: 'no start sequence run yet' };
  const startTime = new Date(startRow.start_time).getTime();
  if (startTime > Date.now()) return { race: label, skipped: 'armed but hasn\'t fired yet' };

  const courses = await fetchJson(
    sbUrl + '/rest/v1/published_courses?id=eq.current&select=finish_line_id',
    anonHeaders,
  );
  const finishLineId = courses[0] && courses[0].finish_line_id;
  if (!finishLineId) return { race: label, skipped: 'no finish line published for the current course' };
  const lines = await fetchJson(
    sbUrl + '/rest/v1/start_finish_lines?id=eq.' + encodeURIComponent(finishLineId) + '&select=lat1,lng1,lat2,lng2',
    anonHeaders,
  );
  const line = lines[0];
  if (!line) return { race: label, skipped: 'finish_line_id points at a line that no longer exists' };

  const alreadyDone = await fetchJson(
    sbUrl + '/rest/v1/race_finishes?race_key=eq.' + encodeURIComponent(raceKey) + '&select=boat_id',
    anonHeaders,
  );
  const doneIds = new Set(alreadyDone.map((r) => r.boat_id));

  const positions = await fetchJson(
    sbUrl + '/rest/v1/race_positions?race_key=eq.' + encodeURIComponent(raceKey)
      + '&recorded_at=gte.' + encodeURIComponent(startRow.start_time)
      + '&order=boat_id.asc,recorded_at.asc&select=boat_id,lat,lng,recorded_at',
    anonHeaders,
  );

  const byBoat = {};
  positions.forEach((p) => {
    (byBoat[p.boat_id] = byBoat[p.boat_id] || []).push({ lat: p.lat, lng: p.lng, t: new Date(p.recorded_at).getTime() });
  });

  const detected = [];
  for (const [boatId, pings] of Object.entries(byBoat)) {
    if (doneIds.has(boatId)) continue;
    for (let i = 0; i < pings.length - 1; i++) {
      const crossing = findCrossing(pings[i], pings[i + 1], line);
      if (!crossing) continue;
      const row = {
        boat_id: boatId,
        race_key: raceKey,
        finish_time: new Date(crossing.t).toISOString(),
        crossing_lat: crossing.lat,
        crossing_lng: crossing.lng,
      };
      // ignore-duplicates, not merge — race_finishes is a write-once log;
      // if this boat already has a row (e.g. a previous run beat us to
      // it), leave that row exactly as first recorded.
      const r = await fetch(sbUrl + '/rest/v1/race_finishes', {
        method: 'POST',
        headers: { ...serviceHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      if (r.ok) detected.push({ boatId, finish_time: row.finish_time });
      break; // only the first crossing after the start counts as the finish
    }
  }

  return { race: label, boatsWithPings: Object.keys(byBoat).length, alreadyDone: doneIds.size, detected };
}

exports.handler = async () => {
  let clubs;
  try {
    clubs = Object.entries(process.env)
      .map(([key, value]) => {
        const m = key.match(/^CLUB_CONFIG_([A-Z0-9]+)$/);
        if (!m) return null;
        try { return [m[1], JSON.parse(value)]; } catch (e) { return null; }
      })
      .filter(Boolean);
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: String(e) }) };
  }

  const results = [];
  for (const [slug, config] of clubs) {
    try {
      results.push(await processClub(slug, config));
    } catch (e) {
      results.push({ slug, error: String(e.message || e) });
    }
  }

  return { statusCode: 200, body: JSON.stringify({ ranAt: new Date().toISOString(), results }) };
};
