// Sends Web Push notifications to subscribers of a club (RO / crew / skipper).
// Called by app.js after a boat registers, or after the RO publishes a course.
//
// Setup (per club):
//   Netlify → Site configuration → Environment variables → Add:
//     VAPID_PRIVATE_KEY            (default/GBSC ONLY)
//     VAPID_PRIVATE_KEY_<SLUG>     (per-club key, e.g. VAPID_PRIVATE_KEY_RCYC)
//       — the private half of the VAPID keypair (generate with `npx web-push generate-vapid-keys`).
//         The PUBLIC half is stored in the club's own Supabase `settings.vapid_public_key`
//         (set via RO → Club Settings → Registration Notifications) — same value used
//         client-side for pushManager.subscribe(), so it lives in the DB, not here.
//
//     SUPABASE_SERVICE_KEY         (default/GBSC ONLY)
//     SUPABASE_SERVICE_KEY_<SLUG>  (per-club key, e.g. SUPABASE_SERVICE_KEY_RCYC)
//       — the club's Supabase "service_role" key (Supabase dashboard → Project Settings →
//         API). Required because push_subscriptions has no anon SELECT policy — only the
//         service role can read subscriber rows.
//
//   Club is resolved from the request hostname via HOSTNAME_MAP, same as club-config.js —
//   see netlify/functions/_club.js. The club's sbUrl/anon key come from CLUB_CONFIG_<SLUG>
//   (already set for Stripe/branding — reused here read-only, server-side).
//   The bare keys are GBSC's, so only the default club falls back to them
//   (_club.js envForSlug); any other club missing either _<SLUG> key gets 503.
//   ?club= is honoured (detect-finishes.js relies on it for OCS alerts) — it
//   can only pick a club's own config + own keys, never mix clubs.
//
// Request (POST, JSON):
//   { type: "boat_registered", raceLabel: "Sat 25 Jul", boatName: "Silver Fox" }
//   { type: "course_published", raceLabel: "Sat 25 Jul" }
//   { type: "course_updated", raceLabel: "Sat 25 Jul", boatIds: ["silver-fox"] }
//   { type: "protest_filed", boatIds: ["silver-fox"], boatName: "Wanderer" }
//   { type: "protest_hearing_scheduled", boatIds: [...], hearingAt: "...", hearingLocation: "..." }
//   { type: "protest_decision", boatIds: [...], status: "Upheld" }
//   { type: "ocs_detected", boatIds: [...], boatName: "Silver Fox" }
//   { type: "protest_filed_ro", boatName: "Wanderer", protesteeName: "Silver Fox", kind: "Protest", raceLabel: "..." }
//   { type: "test", endpoint: "https://..." }   — to that one device only
//
// boatIds (optional): restricts delivery to those boats' own 'skipper'-role
// subscription instead of broadcasting to every subscriber with a matching
// role — used for protest notifications, which are only relevant to the
// specific boats involved, not the whole fleet.
//
// Response:
//   200 { sent, failed, deleted }
//   400 { error }
//   503 { error }   — push not configured for this club (missing keys)

const webpush = require('web-push');
const { resolveClubSlug, clubEnv } = require('./_club');

const TARGET_ROLES = {
  boat_registered:           ['ro'],
  course_published:          ['crew', 'skipper'],
  // Mid-race course edits (per-race courses, migration 057) — skipper-only
  // and normally boatIds-scoped to just the affected race's boats, unlike
  // course_published's club-wide crew+skipper broadcast. Deliberately not
  // in BOAT_SCOPED_TYPES below: a race with no registrations yet should
  // fall through to an unscoped broadcast, not fail the request outright.
  course_updated:             ['skipper'],
  protest_filed:              ['skipper'],
  protest_hearing_scheduled:  ['skipper'],
  protest_decision:           ['skipper'],
  ocs_detected:               ['skipper'],
  // The RO hears about every protest / redress request / scoring enquiry a
  // boat files (protest_filed only ever went to the protested boat).
  protest_filed_ro:           ['ro'],
  // "Send a test notification" — delivered only to the endpoint in the
  // request (any role), so it can't page anyone else.
  test:                       ['skipper', 'crew', 'ro'],
};

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const roles = TARGET_ROLES[body.type];
  if (!roles) {
    return json(400, { error: 'type must be one of: ' + Object.keys(TARGET_ROLES).join(', ') });
  }
  const raceLabel = typeof body.raceLabel === 'string' ? body.raceLabel.slice(0, 80) : '';
  const boatName  = typeof body.boatName  === 'string' ? body.boatName.slice(0, 80)  : '';
  const hearingLocation = typeof body.hearingLocation === 'string' ? body.hearingLocation.slice(0, 80) : '';
  const hearingAt = typeof body.hearingAt === 'string' ? body.hearingAt : '';
  const status = typeof body.status === 'string' ? body.status.slice(0, 40) : '';
  const protesteeName = typeof body.protesteeName === 'string' ? body.protesteeName.slice(0, 80) : '';
  const kind = typeof body.kind === 'string' ? body.kind.slice(0, 40) : 'Protest';
  const endpoint = typeof body.endpoint === 'string' && /^https:\/\/[^\s]{10,1000}$/.test(body.endpoint) ? body.endpoint : '';
  if (body.type === 'test' && !endpoint) return json(400, { error: 'test requires the endpoint of this device' });
  // Same charset boats_insert's RLS policy already requires of a boat id —
  // reused here just to keep this safe to interpolate into a REST filter.
  const boatIds = Array.isArray(body.boatIds)
    ? body.boatIds.filter(id => typeof id === 'string' && /^[a-z0-9_-]{1,60}$/.test(id))
    : [];

  const slug = resolveClubSlug(event);
  let clubConfig;
  try {
    clubConfig = JSON.parse(process.env['CLUB_CONFIG_' + slug.toUpperCase()] || '{}');
  } catch (e) {
    return json(500, { error: 'bad CLUB_CONFIG for ' + slug });
  }
  const sbUrl = clubConfig.sbUrl;
  const anonKey = clubConfig.sbKey;
  const serviceKey = clubEnv(event, 'SUPABASE_SERVICE_KEY');
  const vapidPrivateKey = clubEnv(event, 'VAPID_PRIVATE_KEY');
  if (!sbUrl || !anonKey || !serviceKey || !vapidPrivateKey) {
    return json(503, { error: 'push not configured for this club' });
  }

  // Public VAPID key lives in the DB (same value the client used to subscribe).
  let vapidPublicKey;
  try {
    const r = await fetch(sbUrl + '/rest/v1/settings?id=eq.club&select=vapid_public_key', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey },
    });
    const rows = await r.json();
    vapidPublicKey = rows && rows[0] && rows[0].vapid_public_key;
  } catch (e) {
    return json(502, { error: 'could not load vapid_public_key' });
  }
  if (!vapidPublicKey) {
    return json(503, { error: 'vapid_public_key not set for this club' });
  }

  webpush.setVapidDetails('mailto:noreply@example.com', vapidPublicKey, vapidPrivateKey);

  const BOAT_SCOPED_TYPES = ['protest_filed', 'protest_hearing_scheduled', 'protest_decision', 'ocs_detected'];
  if (boatIds.length > 0 && !roles.includes('skipper')) {
    // boatIds only makes sense for skipper-role notifications — nothing else
    // is boat-scoped. Guard so a bad request can't silently broadcast wider
    // than intended.
    return json(400, { error: 'boatIds is only valid for skipper-role notification types' });
  }
  if (BOAT_SCOPED_TYPES.includes(body.type) && boatIds.length === 0) {
    // These types are only ever meant for the specific boat(s) involved in a
    // protest — never a club-wide broadcast. A missing/empty boatIds here is
    // a caller bug, not "notify everyone", so fail loudly instead of paging
    // the whole fleet about someone else's protest.
    return json(400, { error: body.type + ' requires a non-empty boatIds array' });
  }

  const roleFilter = roles.length === 1 ? 'eq.' + roles[0] : 'in.(' + roles.join(',') + ')';
  const boatFilter = boatIds.length > 0 ? '&boat_id=in.(' + boatIds.join(',') + ')'
    : body.type === 'test' ? '&endpoint=eq.' + encodeURIComponent(endpoint) : '';
  let subs;
  try {
    const r = await fetch(sbUrl + '/rest/v1/push_subscriptions?role=' + roleFilter + boatFilter + '&select=id,endpoint,p256dh,auth', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
    });
    if (!r.ok) return json(502, { error: 'could not load subscribers: ' + r.status });
    subs = await r.json();
  } catch (e) {
    return json(502, { error: 'could not load subscribers' });
  }

  const hearingWhen = hearingAt ? new Date(hearingAt).toLocaleString('en-IE', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const PAYLOADS = {
    boat_registered: { title: '⛵ New Registration', body: (boatName || 'A boat') + ' registered' + (raceLabel ? ' for ' + raceLabel : ''), tag: 'reg' },
    course_published: { title: '📋 Course Published', body: 'Today\'s course is up' + (raceLabel ? ' for ' + raceLabel : ''), tag: 'course' },
    // Same tag as course_published on purpose — a second edit's OS
    // notification replaces an unread "published" one rather than
    // stacking two near-identical alerts.
    course_updated: { title: '🔄 Course Updated', body: 'The course has changed' + (raceLabel ? ' for ' + raceLabel : '') + ' — check the app', tag: 'course' },
    protest_filed: { title: '🚩 Protest Filed', body: (boatName || 'A boat') + ' has filed a protest against you' + (raceLabel ? ' — ' + raceLabel : ''), tag: 'protest' },
    protest_hearing_scheduled: { title: '⚖ Hearing Scheduled', body: 'Protest hearing' + (hearingWhen ? ' ' + hearingWhen : '') + (hearingLocation ? ' at ' + hearingLocation : ''), tag: 'protest' },
    protest_decision: { title: '⚖ Protest Decision', body: 'Decision reached: ' + (status || 'see the app for details'), tag: 'protest' },
    // Informational only, never a final ruling — worded as an alert to
    // check the app, not a verdict. A boat can clear this by returning and
    // restarting correctly (rule 30.1) before the RO ever gets involved.
    ocs_detected: { title: '🚩 Individual Recall', body: (boatName || 'Your boat') + ' looked to be over the line at the start — check the app', tag: 'ocs' },
    protest_filed_ro: { title: '🚩 ' + kind + ' filed', body: (boatName || 'A boat') + (protesteeName ? ' v ' + protesteeName : '') + (raceLabel ? ' — ' + raceLabel : ''), tag: 'protest-ro' },
    test: { title: '🔔 Test notification', body: 'Notifications are working on this device.', tag: 'test' },
  };
  const payload = PAYLOADS[body.type];

  // One notification per device: since 072 a phone can hold a row per role
  // (skipper + RO, say), and course_published targets crew AND skipper.
  const seen = new Set();
  subs = (subs || []).filter(row => !seen.has(row.endpoint) && seen.add(row.endpoint));

  let sent = 0, failed = 0;
  const staleIds = [];
  await Promise.all(subs.map(async (row) => {
    const sub = { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } };
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
      sent++;
    } catch (e) {
      failed++;
      if (e.statusCode === 404 || e.statusCode === 410) staleIds.push(row.id);
    }
  }));

  if (staleIds.length) {
    fetch(sbUrl + '/rest/v1/push_subscriptions?id=in.(' + staleIds.join(',') + ')', {
      method: 'DELETE',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
    }).catch(() => {});
  }

  return json(200, { sent, failed, deleted: staleIds.length });
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
