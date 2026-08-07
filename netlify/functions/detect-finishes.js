// Scheduled function (see netlify.toml) — runs every minute across every
// configured club, looking for races marked `automated` whose start
// sequence has actually fired, and:
//   1. records a finish the first time each tracked boat's GPS path
//      crosses the finish line after that start time;
//   2. checks whether each tracked boat was on the course side of the
//      start line at the gun (rule 29.1) and, if so, logs it + alerts that
//      boat's own skipper.
//
// Built for the "no Officer of the Day present" scenario: nothing here
// waits for a human to confirm anything, because by definition there may
// not be one. A detected finish is written straight to race_finishes as
// the authoritative record; the RO's Finish Line panel picks it up
// whenever someone next opens it, for after-the-fact review — see
// 046_automated_finish_detection.sql for the full rationale.
//
// OCS detection is different in kind, not just in geometry: race_ocs is an
// EVENT log, never a scoring RESULT. A boat can clear an OCS by returning
// and restarting correctly (rule 30.1/30.2), so nothing here — or anywhere
// else in the app — ever auto-writes OCS into race_finishes or any results
// field. The only things this does about a detected OCS are (a) log it for
// RO context and (b) push an informational alert to that boat's own
// skipper; see 047_ocs_detection.sql.
//
// Fleet-aware gun resolution (051_fleets.sql/052): race_starts has no
// linkage to `races` at all — which gun applies to a given boat is
// resolved per-BOAT via that boat's own boats.fleet_id, matched against
// the most recent FIRED race_starts row for that same fleet_id (null
// fleet_id = the "all fleets" bucket every boat at a single-fleet club
// sits in, which collapses this back to exactly one row — unchanged
// behavior for every club that's never touched fleets). This mirrors
// app.js's sbLoadActiveStartForFleet() resolution on the client side.
//
// No single request/hostname to resolve a club from here (unlike every
// other function, which handles one HTTP request for one club) — this
// walks every CLUB_CONFIG_<SLUG> env var itself instead.
//
// Setup: same per-club SUPABASE_SERVICE_KEY / SUPABASE_SERVICE_KEY_<SLUG>
// env vars send-push.js already documents and uses — reused here read-write
// instead of read-only, since this is the one thing in the app that writes
// results without a human clicking anything. OCS alerts are sent by calling
// send-push.js itself over HTTP (using process.env.URL, which Netlify sets
// on every function invocation) rather than duplicating its subscriber
// lookup/VAPID/stale-cleanup logic here — ?club=<slug> uses the same
// override _club.js's resolveClubSlug() already supports, so no hostname
// spoofing is needed to pick the right club from a request with no Host.

const { findCrossing, isOnCourseSide, interpolateAtTime, offsetToBow } = require('./_geometry');

async function fetchJson(url, headers) {
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const bodyText = await r.text();
    const err = new Error(url + ' -> HTTP ' + r.status + ': ' + bodyText.slice(0, 200));
    try { err.code = JSON.parse(bodyText).code; } catch (e) {}
    throw err;
  }
  return r.json();
}

function raceKeyFor(race) {
  // Mirrors app.js's raceKey() exactly — must stay in sync with it.
  return race.race_date + '_' + race.label.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 20);
}

// {offsetById, fleetIdById} for every boat — fetched once per race and
// shared between finish and OCS detection. offsetById only has entries for
// boats with a bow offset actually set (offsetToBow no-ops on a falsy
// offset); fleetIdById always has an entry (null for unassigned boats),
// since it's used as a lookup key below, not just an optional adjustment.
async function fetchBoatMeta(sbUrl, anonHeaders) {
  const rows = await fetchJson(sbUrl + '/rest/v1/boats?select=id,bow_offset_m,fleet_id', anonHeaders);
  const offsetById = {};
  const fleetIdById = {};
  rows.forEach((b) => {
    if (b.bow_offset_m) offsetById[b.id] = b.bow_offset_m;
    fleetIdById[b.id] = b.fleet_id || null;
  });
  return { offsetById, fleetIdById };
}

async function processClub(slug, clubConfig) {
  const sbUrl = clubConfig.sbUrl, anonKey = clubConfig.sbKey;
  const serviceKey = process.env['SUPABASE_SERVICE_KEY_' + slug] || process.env.SUPABASE_SERVICE_KEY;
  if (!sbUrl || !anonKey) { console.log('[' + slug + '] skip: no sbUrl/sbKey'); return { slug, skipped: 'no sbUrl/sbKey' }; }
  if (!serviceKey) { console.log('[' + slug + '] skip: no SUPABASE_SERVICE_KEY'); return { slug, skipped: 'no SUPABASE_SERVICE_KEY configured — can\'t write results' }; }

  const anonHeaders = { apikey: anonKey, Authorization: 'Bearer ' + anonKey };
  const serviceHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };

  // Confirm migration 046 is actually applied here *before* ever querying
  // races.automated, rather than finding out via a failed query. On a
  // pre-046 database that query is a genuine Postgres "column does not
  // exist" error, which PostgREST reports as a real 400 — Supabase logs
  // that at the API level regardless of how gracefully the catch below
  // handles the resulting exception, so a club that's behind on migrations
  // sees a real error in its own dashboard every single run, forever, not
  // just once. Confirmed live on HYC, 2026-08-05 (RCYC/MSC likely the same
  // — none had migration 046 as of this session's last check of them).
  let migrationCheck;
  try {
    migrationCheck = await fetchJson(
      sbUrl + '/rest/v1/schema_migrations?filename=eq.046_automated_finish_detection.sql&select=filename',
      anonHeaders,
    );
  } catch (e) {
    console.log('[' + slug + '] skip: could not check schema_migrations (' + (e.message || e) + ')');
    return { slug, skipped: 'schema_migrations check failed' };
  }
  if (!migrationCheck.length) {
    console.log('[' + slug + '] skip: migration 046 not applied here yet (checked schema_migrations, no races query attempted)');
    return { slug, skipped: 'migration 046 not applied' };
  }

  const today = new Date().toISOString().split('T')[0];
  let races;
  try {
    races = await fetchJson(
      sbUrl + '/rest/v1/races?race_date=eq.' + today + '&automated=eq.true&active=eq.true&select=*',
      anonHeaders,
    );
  } catch (e) {
    // Migration IS applied (just confirmed above) — this is a genuinely
    // unexpected error, but keep the same graceful skip as a defensive
    // fallback rather than taking the whole club's run down over it.
    if (e.code === '42703') { console.log('[' + slug + '] skip: races.automated missing despite 046 showing applied — schema drift?'); return { slug, skipped: 'races.automated missing unexpectedly' }; }
    throw e;
  }
  console.log('[' + slug + '] today=' + today + ' automated races found=' + races.length);
  if (!races.length) return { slug, races: 0 };

  const results = [];
  for (const race of races) {
    try {
      results.push(await processRace(slug, sbUrl, anonHeaders, serviceHeaders, race));
    } catch (e) {
      console.error('[' + slug + '] processRace error for "' + race.label + '":', e);
      results.push({ race: race.label, error: String(e.message || e) });
    }
  }
  console.log('[' + slug + '] results:', JSON.stringify(results));
  return { slug, races: races.length, results };
}

async function processRace(slug, sbUrl, anonHeaders, serviceHeaders, race) {
  const raceKey = raceKeyFor(race);
  const label = race.label;

  // Every fired armed/postponed start, across every fleet — was a single
  // limit=1 global row before fleets existed. race_starts still has no
  // linkage to `races` itself, so which gun applies to a given boat is
  // resolved per-boat via that boat's own fleet_id below, not per-race.
  const allStarts = await fetchJson(
    sbUrl + '/rest/v1/race_starts?status=in.(armed,postponed)&order=start_time.desc&select=*',
    anonHeaders,
  );
  const now = Date.now();
  const startsByFleet = {}; // fleet_id||'__none__' -> most recent FIRED row for that fleet
  allStarts.forEach((s) => {
    if (new Date(s.start_time).getTime() > now) return; // hasn't fired yet
    const key = s.fleet_id || '__none__';
    if (!startsByFleet[key]) startsByFleet[key] = s; // first-seen wins — already ordered start_time desc
  });
  if (!Object.keys(startsByFleet).length) { console.log('[' + label + '] skip: no fleet has a fired start yet'); return { race: label, skipped: 'no fleet has a fired start yet' }; }
  console.log('[' + label + '] raceKey=' + raceKey + ' fired starts by fleet:', JSON.stringify(Object.fromEntries(Object.entries(startsByFleet).map(([k, s]) => [k, s.start_time]))));

  // Shared between finish and OCS detection below — both project each
  // ping forward to the bow before any crossing/course-side check, and
  // both need to know which fleet (and therefore which start) each boat
  // belongs to.
  const { offsetById, fleetIdById } = await fetchBoatMeta(sbUrl, anonHeaders);
  const resolveBoatStart = (boatId) => startsByFleet[fleetIdById[boatId] || '__none__'] || null;

  // Independent of finish detection below — its own course/line lookup
  // (the start line, not the finish line), its own failure mode. A bad OCS
  // geometry lookup should never take down finish detection, or vice versa.
  let ocsResult;
  try {
    ocsResult = await processOcsForRace(slug, sbUrl, anonHeaders, serviceHeaders, race, raceKey, label, startsByFleet, resolveBoatStart, offsetById);
  } catch (e) {
    console.error('[' + label + '] OCS detection error:', e);
    ocsResult = { error: String(e.message || e) };
  }

  const courses = await fetchJson(
    sbUrl + '/rest/v1/published_courses?id=eq.current&select=finish_line_id',
    anonHeaders,
  );
  const finishLineId = courses[0] && courses[0].finish_line_id;
  if (!finishLineId) { console.log('[' + label + '] skip: no finish_line_id on the published course'); return { race: label, skipped: 'no finish line published for the current course' }; }
  const lines = await fetchJson(
    sbUrl + '/rest/v1/start_finish_lines?id=eq.' + encodeURIComponent(finishLineId) + '&select=lat1,lng1,lat2,lng2',
    anonHeaders,
  );
  const line = lines[0];
  if (!line) { console.log('[' + label + '] skip: finish_line_id=' + finishLineId + ' not found in start_finish_lines'); return { race: label, skipped: 'finish_line_id points at a line that no longer exists' }; }
  console.log('[' + label + '] finish line ' + finishLineId + ':', JSON.stringify(line));

  const alreadyDone = await fetchJson(
    sbUrl + '/rest/v1/race_finishes?race_key=eq.' + encodeURIComponent(raceKey) + '&select=boat_id',
    anonHeaders,
  );
  const doneIds = new Set(alreadyDone.map((r) => r.boat_id));

  // Widened to the EARLIEST fired gun across every fleet — a safe superset
  // fetched once; each boat's own crossing scan below is still bounded by
  // *its own* resolved start (see the pings[i+1].t < boatStartMs guard),
  // so this bound only avoids under-fetching, never mixes fleets' results.
  // Collapses to exactly the old single-start bound when only one fleet
  // (or none) exists.
  const earliestStart = Object.values(startsByFleet)
    .map((s) => s.start_time)
    .reduce((min, t) => (t < min ? t : min));
  const positions = await fetchJson(
    sbUrl + '/rest/v1/race_positions?race_key=eq.' + encodeURIComponent(raceKey)
      + '&recorded_at=gte.' + encodeURIComponent(earliestStart)
      + '&order=boat_id.asc,recorded_at.asc&select=boat_id,lat,lng,heading,recorded_at',
    anonHeaders,
  );
  console.log('[' + label + '] positions since earliest fired gun: ' + positions.length + ', alreadyDone boats: ' + doneIds.size);

  const byBoat = {};
  positions.forEach((p) => {
    const ping = offsetToBow({ lat: p.lat, lng: p.lng, heading: p.heading, t: new Date(p.recorded_at).getTime() }, offsetById[p.boat_id]);
    (byBoat[p.boat_id] = byBoat[p.boat_id] || []).push(ping);
  });
  console.log('[' + label + '] boats with pings:', JSON.stringify(Object.fromEntries(Object.entries(byBoat).map(([k, v]) => [k, v.length]))));

  const detected = [];
  for (const [boatId, pings] of Object.entries(byBoat)) {
    if (doneIds.has(boatId)) { console.log('[' + label + '] ' + boatId + ' already has a finish, skipping'); continue; }
    const boatStart = resolveBoatStart(boatId);
    if (!boatStart) { console.log('[' + label + '] ' + boatId + ': no fired start for its fleet, skipping'); continue; }
    const boatStartMs = new Date(boatStart.start_time).getTime();
    let crossed = false;
    for (let i = 0; i < pings.length - 1; i++) {
      if (pings[i + 1].t < boatStartMs) continue; // this ping pair is entirely before THIS boat's own gun
      const crossing = findCrossing(pings[i], pings[i + 1], line);
      if (!crossing) continue;
      crossed = true;
      const row = {
        boat_id: boatId,
        race_key: raceKey,
        finish_time: new Date(crossing.t).toISOString(),
        crossing_lat: crossing.lat,
        crossing_lng: crossing.lng,
      };
      console.log('[' + label + '] ' + boatId + ' crossing detected at pings[' + i + ']->[' + (i+1) + ']:', JSON.stringify(row));
      // ignore-duplicates, not merge — race_finishes is a write-once log;
      // if this boat already has a row (e.g. a previous run beat us to
      // it), leave that row exactly as first recorded.
      const r = await fetch(sbUrl + '/rest/v1/race_finishes', {
        method: 'POST',
        headers: { ...serviceHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
        body: JSON.stringify(row),
      });
      if (r.ok) { detected.push({ boatId, finish_time: row.finish_time }); }
      else { console.error('[' + label + '] race_finishes insert failed for ' + boatId + ': HTTP ' + r.status + ' ' + (await r.text())); }
      break; // only the first crossing after the start counts as the finish
    }
    if (!crossed) console.log('[' + label + '] ' + boatId + ': no crossing found across ' + pings.length + ' pings');
  }

  return { race: label, boatsWithPings: Object.keys(byBoat).length, alreadyDone: doneIds.size, detected, ocs: ocsResult };
}

// OCS = rule 29.1: any part of the boat's hull on the course side of the
// start line at her starting signal. "Course side" isn't a fixed property
// of the line itself — it's whichever side the first mark of the day's
// course is laid on — so this needs the published course's first real
// mark position, not just the line. Laid/schematic courses (course_type
// set — windward_leeward/triangle/trapezoid, drawn by buildLaidCourseSvg
// as a diagram) have no real GPS mark to orient against, so those races
// are skipped entirely: real-mark/course-card races only, for now.
//
// published_courses/start_finish_lines stay club-wide shared, deliberately
// not fleet-scoped — correct for the rolling-start format this was built
// for (multiple fleets starting off the same physical line minutes apart),
// not a gap.
async function processOcsForRace(slug, sbUrl, anonHeaders, serviceHeaders, race, raceKey, label, startsByFleet, resolveBoatStart, offsetById) {
  const GUN_GRACE_MS = 30000; // need at least one ping at/after the gun to bracket it
  const now = Date.now();
  // A fleet's gun only becomes OCS-checkable once GUN_GRACE_MS has passed
  // — filter down to fleets whose fired start is far enough in the past.
  const readyStarts = Object.values(startsByFleet).filter((s) => now >= new Date(s.start_time).getTime() + GUN_GRACE_MS);
  if (!readyStarts.length) {
    console.log('[' + label + '] OCS: skip, no fleet\'s gun is far enough in the past to bracket yet');
    return { skipped: 'gun too recent' };
  }

  const courses = await fetchJson(
    sbUrl + '/rest/v1/published_courses?id=eq.current&select=marks,course_type,start_line_id',
    anonHeaders,
  );
  const course = courses[0];
  if (!course) { console.log('[' + label + '] OCS: skip, no published course'); return { skipped: 'no published course' }; }
  if (course.course_type) {
    console.log('[' + label + '] OCS: skip, laid course (' + course.course_type + ') has no real first-mark position');
    return { skipped: 'laid course, no real marks' };
  }
  const firstMarkId = Array.isArray(course.marks) && course.marks[0] && course.marks[0].id;
  if (!firstMarkId) { console.log('[' + label + '] OCS: skip, no marks on the published course'); return { skipped: 'no marks published' }; }

  const startLineId = course.start_line_id || 'club';
  const [markRows, lineRows] = await Promise.all([
    fetchJson(sbUrl + '/rest/v1/marks?id=eq.' + encodeURIComponent(firstMarkId) + '&select=lat,lng', anonHeaders),
    fetchJson(sbUrl + '/rest/v1/start_finish_lines?id=eq.' + encodeURIComponent(startLineId) + '&select=lat1,lng1,lat2,lng2', anonHeaders),
  ]);
  const firstMark = markRows[0];
  const line = lineRows[0];
  if (!firstMark) { console.log('[' + label + '] OCS: skip, first mark "' + firstMarkId + '" not found'); return { skipped: 'first mark not found' }; }
  if (!line) { console.log('[' + label + '] OCS: skip, start line "' + startLineId + '" not found'); return { skipped: 'start line not found' }; }

  const alreadyDetected = await fetchJson(
    sbUrl + '/rest/v1/race_ocs?start_id=in.(' + readyStarts.map((s) => s.id).join(',') + ')&select=boat_id,start_id',
    anonHeaders,
  );
  const doneKeys = new Set(alreadyDetected.map((r) => r.boat_id + '|' + r.start_id));

  // Positions bracketing the gun — no lower bound (whichever ping came
  // right before a boat's own start_time, however long ago, still
  // brackets it fine), upper-bounded just past the LATEST gun-ready fleet's
  // gun, a safe superset — each boat's own bracket search below still uses
  // its own resolved start_time. Collapses to the old single-gun cutoff
  // when only one fleet (or none) exists.
  const latestReadyGun = Math.max(...readyStarts.map((s) => new Date(s.start_time).getTime()));
  const gunCutoff = new Date(latestReadyGun + GUN_GRACE_MS).toISOString();
  const positions = await fetchJson(
    sbUrl + '/rest/v1/race_positions?race_key=eq.' + encodeURIComponent(raceKey)
      + '&recorded_at=lte.' + encodeURIComponent(gunCutoff)
      + '&order=boat_id.asc,recorded_at.asc&select=boat_id,lat,lng,heading,recorded_at',
    anonHeaders,
  );
  const byBoat = {};
  positions.forEach((p) => {
    const ping = offsetToBow({ lat: p.lat, lng: p.lng, heading: p.heading, t: new Date(p.recorded_at).getTime() }, offsetById[p.boat_id]);
    (byBoat[p.boat_id] = byBoat[p.boat_id] || []).push(ping);
  });
  console.log('[' + label + '] OCS: boats with pre-gun pings:', JSON.stringify(Object.fromEntries(Object.entries(byBoat).map(([k, v]) => [k, v.length]))));

  const detected = [];
  let degenerateGeometry = false;
  for (const [boatId, pings] of Object.entries(byBoat)) {
    if (degenerateGeometry) break;
    const boatStart = resolveBoatStart(boatId);
    if (!boatStart) continue; // this boat's fleet has no fired start at all
    if (!readyStarts.find((s) => s.id === boatStart.id)) continue; // fired, but not gun-ready yet
    if (doneKeys.has(boatId + '|' + boatStart.id)) continue;

    const startTime = new Date(boatStart.start_time).getTime();
    let bracket = null;
    for (let i = 0; i < pings.length - 1; i++) {
      if (pings[i].t <= startTime && pings[i + 1].t >= startTime) { bracket = [pings[i], pings[i + 1]]; break; }
    }
    if (!bracket) { console.log('[' + label + '] OCS: ' + boatId + ' has no pings bracketing its gun (' + pings.length + ' pings)'); continue; }

    const atGun = interpolateAtTime(bracket[0], bracket[1], startTime);
    const onCourseSide = isOnCourseSide(atGun, line, firstMark);
    if (onCourseSide === null) {
      console.warn('[' + label + '] OCS: first mark is degenerate relative to the start line — skipping this race entirely');
      degenerateGeometry = true;
      break;
    }
    if (!onCourseSide) continue;

    const row = {
      boat_id: boatId,
      race_key: raceKey,
      start_id: boatStart.id,
      start_time: boatStart.start_time,
      ocs_lat: atGun.lat,
      ocs_lng: atGun.lng,
    };
    console.log('[' + label + '] OCS detected:', JSON.stringify(row));
    const r = await fetch(sbUrl + '/rest/v1/race_ocs', {
      method: 'POST',
      headers: { ...serviceHeaders, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(row),
    });
    if (r.ok) {
      detected.push(boatId);
      try { await notifyOcsPush(slug, sbUrl, anonHeaders, boatId); }
      catch (e) { console.error('[' + label + '] OCS push failed for ' + boatId + ':', e); }
    } else {
      console.error('[' + label + '] race_ocs insert failed for ' + boatId + ': HTTP ' + r.status + ' ' + (await r.text()));
    }
  }

  return { boatsChecked: Object.keys(byBoat).length, alreadyDetected: doneKeys.size, detected };
}

// Fire-and-forget from the caller's point of view (wrapped in try/catch at
// the call site) but awaited here, not left dangling — a scheduled
// function's execution environment can be torn down right after handler()
// resolves, which would risk cutting off a truly-unawaited push send.
async function notifyOcsPush(slug, sbUrl, anonHeaders, boatId) {
  let boatName = '';
  try {
    const boats = await fetchJson(sbUrl + '/rest/v1/boats?id=eq.' + encodeURIComponent(boatId) + '&select=name', anonHeaders);
    boatName = (boats[0] && boats[0].name) || '';
  } catch (e) { /* best-effort — push still fires with a generic fallback name */ }

  const base = process.env.URL || process.env.DEPLOY_PRIME_URL;
  if (!base) { console.warn('OCS push skipped for ' + boatId + ': no process.env.URL/DEPLOY_PRIME_URL to call send-push through'); return; }
  const r = await fetch(base + '/.netlify/functions/send-push?club=' + encodeURIComponent(slug), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'ocs_detected', boatIds: [boatId], boatName }),
  });
  if (!r.ok) console.warn('OCS push HTTP ' + r.status + ' for ' + boatId + ': ' + (await r.text()).slice(0, 200));
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

  console.log('clubs configured:', clubs.map(([slug]) => slug).join(', '));
  const results = [];
  for (const [slug, config] of clubs) {
    try {
      results.push(await processClub(slug, config));
    } catch (e) {
      console.error('[' + slug + '] processClub error:', e);
      results.push({ slug, error: String(e.message || e) });
    }
  }

  console.log('detect-finishes run complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ ranAt: new Date().toISOString(), results }) };
};
