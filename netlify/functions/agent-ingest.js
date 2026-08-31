// Phase 0 of the Location Agent pilot (see the "Crest Locate" exploration
// doc) — a translation layer, not a passthrough. A native GPS-logger app
// (piloting with Traccar Client, free/open-source, already on both app
// stores) can't speak Supabase's REST dialect or hold a Supabase credential,
// but it CAN speak the OsmAnd HTTP protocol: a GET or POST with plain query
// params (id, lat, lon, timestamp, ...). This function is that translator —
// it's the only thing in this whole feature that ever touches Supabase, and
// it does so with a service_role key, so the distributed agent app never
// carries any Supabase credential of its own. See 060_agent_tracking.sql.
//
// Auth model: the OsmAnd protocol has exactly one identity field ("Device
// Identifier" in Traccar Client's settings, sent as `id`). Rather than a
// separate id+secret pair we don't have a field for, the token itself IS
// that field — long, random, and prefixed with the club slug so this
// function can find the right club's database *before* it can look anything
// up in it (each club is its own separate Supabase project — see
// CLUB_CONFIG_<SLUG> in netlify/functions/_club.js and detect-finishes.js —
// so there's no single shared table to query the club out of). Token shape:
// "<slug>_<32 random hex chars>", e.g. "gbsc_3f9a1c...". Deliberately NOT
// carried as a `?club=` query param — Traccar Client's own docs don't
// promise it preserves an existing query string on the configured Server
// URL when it appends its own, so club identity rides in the one field
// guaranteed to survive: `id`.
//
// race_key is resolved once, at pairing time (a human, inside the web app,
// picking the race they're tracking for — exactly how the web tracker's own
// selectedRace already works, app.js's onTrackPosition()) and stored on the
// agent_tokens row. This function never guesses which race is "current" —
// deliberately simpler than detect-finishes.js's fleet-aware gun resolution,
// which exists to answer a different question (which start fired) that
// doesn't apply here.

function parseParams(event) {
  const q = event.queryStringParameters || {};
  if (Object.keys(q).length) return q;
  // Some OsmAnd-protocol implementations POST form-encoded params instead
  // of a query string — accept that shape too rather than assuming GET.
  const ct = (event.headers && (event.headers['content-type'] || event.headers['Content-Type'])) || '';
  if (event.body && ct.includes('x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(event.body));
  }
  return {};
}

// Real-world timestamp unit from Traccar Client hasn't been confirmed
// against a live device yet — defend against both. Same magnitude-detection
// trick already used elsewhere in this app for Expedition log timestamps
// (Windows FILETIME vs Excel serial date): today's Unix seconds is ~1.8e9,
// today's Unix milliseconds is ~1.8e12 — three orders of magnitude apart,
// nowhere near ambiguous.
function parseTimestamp(raw) {
  const n = Number(raw);
  if (!raw || isNaN(n) || n <= 0) return new Date();
  return new Date(n > 1e12 ? n : n * 1000);
}

function num(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return isNaN(n) ? null : n;
}

exports.handler = async (event) => {
  const p = parseParams(event);
  const token = p.id;
  const lat = num(p.lat);
  const lng = num(p.lon != null ? p.lon : p.lng);

  console.log('agent-ingest: received', JSON.stringify({ id: token, lat: p.lat, lon: p.lon, timestamp: p.timestamp, speed: p.speed, bearing: p.bearing, raw: p }));

  if (!token || !token.includes('_')) {
    console.warn('agent-ingest: rejected, missing/malformed id param');
    return { statusCode: 400, body: 'missing or malformed id' };
  }
  if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    console.warn('agent-ingest: rejected, missing/out-of-range lat/lon for token ' + token);
    return { statusCode: 400, body: 'missing or invalid lat/lon' };
  }

  const slug = token.slice(0, token.indexOf('_')).toLowerCase();
  let clubConfig;
  try { clubConfig = JSON.parse(process.env['CLUB_CONFIG_' + slug.toUpperCase()] || 'null'); }
  catch (e) { clubConfig = null; }
  const serviceKey = process.env['SUPABASE_SERVICE_KEY_' + slug.toUpperCase()] || process.env.SUPABASE_SERVICE_KEY;
  if (!clubConfig || !clubConfig.sbUrl) {
    console.error('agent-ingest: no CLUB_CONFIG_' + slug.toUpperCase() + ' — token claims a club this deploy doesn\'t know about');
    return { statusCode: 400, body: 'unknown club' };
  }
  if (!serviceKey) {
    console.error('agent-ingest: no SUPABASE_SERVICE_KEY_' + slug.toUpperCase() + '/SUPABASE_SERVICE_KEY configured for ' + slug);
    return { statusCode: 500, body: 'server not configured for this club' };
  }

  const sbUrl = clubConfig.sbUrl;
  const serviceHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };

  const tokenRows = await fetch(sbUrl + '/rest/v1/agent_tokens?token=eq.' + encodeURIComponent(token) + '&select=boat_id,race_key,revoked_at', { headers: serviceHeaders })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('token lookup HTTP ' + r.status))));
  const tokenRow = tokenRows[0];
  if (!tokenRow) {
    console.warn('agent-ingest: unrecognized token for club ' + slug + ' (not necessarily an attack — could be a stale/typo\'d device id)');
    return { statusCode: 403, body: 'unrecognized token' };
  }
  if (tokenRow.revoked_at) {
    console.warn('agent-ingest: token revoked at ' + tokenRow.revoked_at + ', boat ' + tokenRow.boat_id);
    return { statusCode: 403, body: 'token revoked' };
  }

  const row = {
    boat_id: tokenRow.boat_id,
    race_key: tokenRow.race_key,
    lat, lng,
    heading: num(p.bearing != null ? p.bearing : p.heading),
    // Unit not yet confirmed against a real device — see file header. Left
    // in place since the column is nullable and unused by finish/OCS
    // detection either way; worth a deliberate look once real pings land.
    speed_kn: num(p.speed),
    recorded_at: parseTimestamp(p.timestamp).toISOString(),
    source: 'agent',
  };

  const insert = await fetch(sbUrl + '/rest/v1/race_positions', {
    method: 'POST',
    headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify(row),
  });
  if (!insert.ok) {
    const bodyText = await insert.text();
    console.error('agent-ingest: race_positions insert failed HTTP ' + insert.status + ': ' + bodyText.slice(0, 300));
    return { statusCode: 502, body: 'insert failed' };
  }

  // Best-effort — a failed last_seen_at touch shouldn't fail the ping itself.
  fetch(sbUrl + '/rest/v1/agent_tokens?token=eq.' + encodeURIComponent(token), {
    method: 'PATCH',
    headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ last_seen_at: new Date().toISOString() }),
  }).catch((e) => console.warn('agent-ingest: last_seen_at touch failed (non-fatal):', e.message || e));

  console.log('agent-ingest: OK boat=' + row.boat_id + ' race_key=' + row.race_key + ' lat=' + lat + ' lng=' + lng);
  return { statusCode: 200, body: '' };
};
