// Sail Scoring sends the RO back here after they sign in and approve
// RaceOps (ss-connect.js 'start' sent them there), at the redirect URI in
// the club's registration (ss_client). Clubs can share a host
// (racing.gbsc.ie?club=…), so the club comes from `state`
// ("<club>.<nonce>"), not the hostname. The nonce is looked up in that
// club's own ss_oauth_pending table, which also holds the PKCE
// code_verifier and the page to send the RO back to. A forged state finds
// no row and goes nowhere.
//
// The code is exchanged exactly once, however many times this URL is hit (a
// reload, a browser repeating the request): Sail Scoring refuses a second
// exchange of the same code ("invalid code"), and two hits racing used to
// turn a good sign-in into a failure. Claiming is one atomic update that
// backdates the row's created_at to USED_AT; the row is kept, and its
// return_to is rewritten with the outcome, so a repeat hit sends the RO
// back with the same answer. ss-connect's cleanup removes old rows.
//
// On success the club's ss_connection row (migration 076) is replaced with
// the new tokens and the workspace the grant names, and the RO lands back
// on the app with ?ss_connect=ok; otherwise ?ss_connect=denied|error and
// ss_connect_msg says why (Sail Scoring's own error and description when
// it refused the code).

const {
  oauthClient, clubDb, exchangeCode, tokenFields, writeConnection, wsApi,
} = require('./_sailscoring');

const PENDING_TTL_MS = 15 * 60 * 1000;
// created_at of a claimed (used) sign-in — long past, so never claimable again
const USED_AT = '2000-01-01T00:00:00+00:00';

const page = (statusCode, msg) => ({
  statusCode,
  headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  body: '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>Sail Scoring</title><body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;line-height:1.5">' +
    '<h1 style="font-size:1.2rem">Couldn\'t connect to Sail Scoring</h1><p>' + msg + '</p>' +
    '<p>Go back to the app and try <b>Connect</b> again from Sail Scoring Setup.</p></body>',
});
const withOutcome = (returnTo, outcome, msg) => {
  const u = new URL(returnTo);
  u.searchParams.set('ss_connect', outcome);
  if (msg) u.searchParams.set('ss_connect_msg', String(msg).slice(0, 300));
  return u.toString();
};
const redirect = url => ({ statusCode: 302, headers: { Location: url, 'Cache-Control': 'no-store' }, body: '' });

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const m = /^([a-z0-9]{1,40})\.([A-Za-z0-9_-]{16,64})$/.exec(q.state || '');
  if (!m) return page(400, 'The sign-in link was incomplete.');
  const [, slug, nonce] = m;
  const db = clubDb(slug);
  if (!db) return page(400, 'Unknown club.');
  const nq = 'ss_oauth_pending?nonce=eq.' + encodeURIComponent(nonce);

  const minCreated = new Date(Date.now() - PENDING_TTL_MS).toISOString();
  const claim = await db.req(nq + '&created_at=gt.' + encodeURIComponent(minCreated), {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: { created_at: USED_AT },
  });
  const pending = claim.ok && Array.isArray(claim.body) && claim.body[0];

  if (!pending) {
    const got = await db.req(nq + '&select=return_to,created_at');
    const row = got.ok && Array.isArray(got.body) && got.body[0];
    if (!row) return page(400, 'This sign-in link is no longer valid.');
    if (Date.parse(row.created_at) !== Date.parse(USED_AT)) {
      return redirect(withOutcome(row.return_to, 'error', 'The sign-in took more than 15 minutes — try Connect again'));
    }
    // A repeat hit: the first records its outcome in return_to when it's
    // done — wait for it (the browser may show this response, not the first's)
    let ret = row.return_to;
    for (let i = 0; i < 24 && !/[?&]ss_connect=/.test(ret); i++) {
      await new Promise(r => setTimeout(r, 500));
      const again = await db.req(nq + '&select=return_to');
      ret = (again.ok && Array.isArray(again.body) && again.body[0] && again.body[0].return_to) || ret;
    }
    if (/[?&]ss_connect=/.test(ret)) return redirect(ret);
    return redirect(withOutcome(ret, 'error', 'Still connecting — reopen Sail Scoring Setup in a moment to check'));
  }

  // Send the RO back, and record where to so a repeat hit gets the same
  const finish = async (outcome, msg) => {
    const url = withOutcome(pending.return_to, outcome, msg);
    await db.req(nq, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: { return_to: url } });
    return redirect(url);
  };

  if (q.error) return finish(q.error === 'access_denied' ? 'denied' : 'error', [q.error, q.error_description].filter(Boolean).join(': '));
  let client;
  try { client = await oauthClient(slug); } catch (e) { return finish('error', e.message); }
  // RFC 9207: Sail Scoring names itself in the response; refuse any other issuer
  if (q.iss && q.iss !== client.issuer) return finish('error', 'Unexpected issuer ' + q.iss);
  if (!q.code) return finish('error', 'No authorisation code came back from Sail Scoring');

  let tok;
  try { tok = await exchangeCode(slug, q.code, pending.code_verifier); }
  catch (e) { return finish('error', 'Could not reach Sail Scoring to finish signing in (' + e.message + ')'); }
  if (!tok.ok || !tok.body || !tok.body.access_token) {
    const b = tok.body || {};
    // Sail Scoring's error_description names the cause: invalid code,
    // invalid client_id, redirect_uri mismatch, code verification failed…
    console.warn('[' + slug + '] Sail Scoring code exchange HTTP ' + tok.status + ': ' + JSON.stringify(b));
    const why = [b.error, b.error_description].filter(Boolean).join(': ') || ('HTTP ' + tok.status);
    return finish('error', 'Sail Scoring refused the sign-in — ' + why);
  }

  try {
    const fields = tokenFields(tok.body, null);
    await writeConnection(slug, {
      ...fields, status: 'connected', last_error: null, connected_at: new Date().toISOString(), refresh_lock_until: null,
      workspace_id: null, workspace_slug: null, workspace_name: null,
    });
    // The workspace the grant names (one per grant)
    const ws = await wsApi(slug, 'GET', '/workspaces');
    const w = ws.status === 200 && ws.body && Array.isArray(ws.body.workspaces) && ws.body.workspaces[0];
    if (w) await writeConnection(slug, { workspace_id: w.id || null, workspace_slug: w.slug || null, workspace_name: w.name || null });
    else console.warn('[' + slug + '] Sail Scoring /workspaces HTTP ' + ws.status + ' after connecting: ' + JSON.stringify(ws.body || {}).slice(0, 300));
  } catch (e) {
    console.error('[' + slug + '] saving Sail Scoring connection: ' + e.message);
    return finish('error', 'Signed in, but the connection could not be saved (' + e.message + ')');
  }
  return finish('ok');
};
