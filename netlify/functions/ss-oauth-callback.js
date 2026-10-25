// Sail Scoring sends the RO back here after they sign in and approve
// RaceOps (ss-connect.js 'start' sent them there), at the redirect URI in
// the club's registration (ss_client). Clubs can share a host
// (racing.gbsc.ie?club=…), so the club comes from `state`
// ("<club>.<nonce>"), not the hostname. The nonce is looked up — and used
// up — in that club's own ss_oauth_pending table, which also holds the PKCE
// code_verifier and the page to send the RO back to. A forged or replayed
// state finds no row and goes nowhere.
//
// On success the club's ss_connection row (migration 076) is replaced with
// the new tokens and the workspace the grant names, and the RO lands back
// on the app with ?ss_connect=ok; otherwise ?ss_connect=denied|error.

const {
  oauthClient, clubDb, exchangeCode, tokenFields, writeConnection, wsApi,
} = require('./_sailscoring');

const PENDING_TTL_MS = 15 * 60 * 1000;

const page = (statusCode, msg) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Sail Scoring</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">' +
    '<h1 style="font-size:1.2rem">Couldn\'t connect to Sail Scoring</h1><p>' + msg + '</p>' +
    '<p>Go back to the app and try <b>Connect</b> again from Sail Scoring Setup.</p></body>',
});
const back = (returnTo, outcome, msg) => {
  const u = new URL(returnTo);
  u.searchParams.set('ss_connect', outcome);
  if (msg) u.searchParams.set('ss_connect_msg', String(msg).slice(0, 120));
  return { statusCode: 302, headers: { Location: u.toString(), 'Cache-Control': 'no-store' }, body: '' };
};

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const m = /^([a-z0-9]{1,40})\.([A-Za-z0-9_-]{16,64})$/.exec(q.state || '');
  if (!m) return page(400, 'The sign-in link was incomplete.');
  const [, slug, nonce] = m;
  const db = clubDb(slug);
  if (!db) return page(400, 'Unknown club.');

  // Take the pending sign-in (one use only)
  const got = await db.req('ss_oauth_pending?nonce=eq.' + encodeURIComponent(nonce) + '&select=*');
  const pending = got.ok && Array.isArray(got.body) && got.body[0];
  if (!pending) return page(400, 'This sign-in has already been used or has expired.');
  await db.req('ss_oauth_pending?nonce=eq.' + encodeURIComponent(nonce), { method: 'DELETE' });
  if (Date.now() - Date.parse(pending.created_at) > PENDING_TTL_MS) return back(pending.return_to, 'error', 'The sign-in took too long — try again');

  if (q.error) return back(pending.return_to, q.error === 'access_denied' ? 'denied' : 'error', q.error_description || q.error);
  let client;
  try { client = await oauthClient(slug); } catch (e) { return back(pending.return_to, 'error', e.message); }
  // RFC 9207: Sail Scoring names itself in the response; refuse any other issuer
  if (q.iss && q.iss !== client.issuer) return back(pending.return_to, 'error', 'Unexpected issuer');
  if (!q.code) return back(pending.return_to, 'error', 'No authorisation code');

  const tok = await exchangeCode(slug, q.code, pending.code_verifier);
  if (!tok.ok || !tok.body || !tok.body.access_token) {
    console.warn('[' + slug + '] Sail Scoring code exchange HTTP ' + tok.status + ' ' + JSON.stringify(tok.body || {}).slice(0, 200));
    return back(pending.return_to, 'error', (tok.body && (tok.body.error_description || tok.body.error)) || 'Token exchange failed');
  }

  try {
    const fields = tokenFields(tok.body, null);
    await writeConnection(slug, {
      ...fields, status: 'connected', last_error: null, connected_at: new Date().toISOString(),
      workspace_id: null, workspace_slug: null, workspace_name: null,
    });
    // The workspace the grant names (one per grant)
    const ws = await wsApi(slug, 'GET', '/workspaces');
    const w = ws.status === 200 && ws.body && Array.isArray(ws.body.workspaces) && ws.body.workspaces[0];
    if (w) await writeConnection(slug, { workspace_id: w.id || null, workspace_slug: w.slug || null, workspace_name: w.name || null });
    else console.warn('[' + slug + '] Sail Scoring /workspaces HTTP ' + ws.status + ' after connecting');
  } catch (e) {
    console.error('[' + slug + '] saving Sail Scoring connection: ' + e.message);
    return back(pending.return_to, 'error', 'Could not save the connection');
  }
  return back(pending.return_to, 'ok');
};
