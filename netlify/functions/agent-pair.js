// Location Agent pilot — mints/revokes the per-boat pairing credential a
// native GPS-logger app (currently: Traccar Client, see agent-ingest.js)
// uses to authenticate. Called directly from the skipper's own browser
// session — same trust model as the rest of this app: anyone who can
// already flip registrations.tracking_enabled for their own boat can mint
// a tracking credential for it too, nothing new is being exposed.
//
// agent_tokens has zero anon grants (060_agent_tracking.sql) — this
// function, using the service_role key, is the ONLY thing that ever reads
// or writes it. Unlike almost every other table in this app, device
// credentials are deliberately not part of the "race data is public"
// trust model, so the frontend can't just sbFetch() this one directly.
//
// Token shape: "<club_slug>_<32 hex chars>" — see agent-ingest.js's file
// header for why the club has to ride inside the token itself rather than
// a query param (Traccar Client only has one identity field to put it in).

const { resolveClubSlug, clubEnv } = require('./_club');
const crypto = require('crypto');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'POST only' };

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch (e) { return { statusCode: 400, body: 'bad JSON' }; }

  const slug = resolveClubSlug(event);
  let clubConfig;
  try { clubConfig = JSON.parse(process.env['CLUB_CONFIG_' + slug.toUpperCase()] || 'null'); }
  catch (e) { clubConfig = null; }
  const serviceKey = clubEnv(event, 'SUPABASE_SERVICE_KEY');
  if (!clubConfig || !clubConfig.sbUrl || !serviceKey) {
    console.error('agent-pair: club ' + slug + ' not configured (CLUB_CONFIG_' + slug.toUpperCase() + '/service key missing)');
    return { statusCode: 500, body: 'server not configured for this club' };
  }
  const sbUrl = clubConfig.sbUrl;
  const serviceHeaders = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' };

  // Revoke path — used by the skipper's own "revoke this pairing" button.
  if (body.action === 'revoke') {
    if (!body.token) return { statusCode: 400, body: 'missing token' };
    const r = await fetch(sbUrl + '/rest/v1/agent_tokens?token=eq.' + encodeURIComponent(body.token), {
      method: 'PATCH',
      headers: { ...serviceHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
    if (!r.ok) { console.error('agent-pair: revoke failed HTTP ' + r.status); return { statusCode: 502, body: 'revoke failed' }; }
    return { statusCode: 200, body: JSON.stringify({ revoked: true }) };
  }

  // Issue path.
  const boatId = (body.boatId || '').trim();
  const raceKeyVal = (body.raceKey || '').trim();
  if (!boatId || !raceKeyVal) return { statusCode: 400, body: 'missing boatId/raceKey' };

  // A boat only ever needs one *active* pairing — auto-retire any earlier
  // ones (from a previous race, or a re-pair after losing a phone) rather
  // than letting valid-forever tokens accumulate silently. Best-effort:
  // a failure here shouldn't block issuing the new pairing.
  try {
    await fetch(sbUrl + '/rest/v1/agent_tokens?boat_id=eq.' + encodeURIComponent(boatId) + '&revoked_at=is.null', {
      method: 'PATCH',
      headers: { ...serviceHeaders, Prefer: 'return=minimal' },
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
  } catch (e) { console.warn('agent-pair: retiring old tokens for ' + boatId + ' failed (non-fatal):', e.message || e); }

  const token = slug + '_' + crypto.randomBytes(16).toString('hex');
  const insert = await fetch(sbUrl + '/rest/v1/agent_tokens', {
    method: 'POST',
    headers: { ...serviceHeaders, Prefer: 'return=minimal' },
    body: JSON.stringify({ token, boat_id: boatId, race_key: raceKeyVal, label: body.label || null }),
  });
  if (!insert.ok) {
    const bodyText = await insert.text();
    console.error('agent-pair: insert failed HTTP ' + insert.status + ' for boat ' + boatId + ': ' + bodyText.slice(0, 300));
    return { statusCode: 502, body: 'could not create pairing — is "' + boatId + '" a real boat id?' };
  }

  const base = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  return { statusCode: 200, body: JSON.stringify({ token, serverUrl: base + '/.netlify/functions/agent-ingest' }) };
};
