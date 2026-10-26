// Connect RaceOps to the club's Sail Scoring workspace (OAuth — migration
// 076, helpers in _sailscoring.js). Called from Sail Scoring Setup:
//
//   POST { action: 'status', pin, check? }    connected? to which workspace?
//                                             check: also make a live call
//   POST { action: 'start', pin, returnTo }   → { url } to send the browser to
//                                             Sail Scoring's sign-in
//   POST { action: 'disconnect', pin }        forget the club's tokens
//   POST { action: 'register', pin, clientId, clientSecret?, redirectUri,
//          scopes? }                          save the club's registration
//                                             (ss_client); a blank secret
//                                             keeps the saved one
//
// The registration is per club, issued by Sail Scoring for the club's own
// redirect URI. Status reports the client id and redirect URI (neither is
// secret) and whether a secret is saved — never the secret itself.
//
// Every action needs the club's RO or Club Admin PIN, checked by the club's
// own database (verify_ro_pin 040 / verify_admin_pin 042) — the tokens act
// for the club in Sail Scoring, so nobody else may start, read or end that.
// The club comes from the hostname or ?club= (resolveClubSlug): the PIN is
// checked against that same club, so ?club= can't reach another club's
// connection without its PIN.
//
// Sign-in: the PKCE code_verifier is kept in the club's ss_oauth_pending
// table; only `state` = "<club>.<nonce>" goes through the browser, and
// ss-oauth-callback.js finds the verifier (and where to send the RO back)
// by it.

const crypto = require('crypto');
const { resolveClubSlug } = require('./_club');
const {
  oauthBase, oauthClient, writeClient, pkcePair, clubDb, readConnection, revokeToken, wsApi, hasRefreshLock,
} = require('./_sailscoring');

const CALLBACK_PATH = '/.netlify/functions/ss-oauth-callback';

const PENDING_TTL_MS = 15 * 60 * 1000;

const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body),
});

async function rpcTrue(cfg, fn, pin) {
  try {
    const res = await fetch(cfg.sbUrl + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: { apikey: cfg.sbKey, Authorization: 'Bearer ' + cfg.sbKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_pin: pin }),
    });
    return res.ok && (await res.json()) === true;
  } catch (e) { return false; }
}
async function pinOk(cfg, pin) {
  if (typeof pin !== 'string' || !/^\d{4,8}$/.test(pin) || !cfg.sbKey) return false;
  return (await rpcTrue(cfg, 'verify_ro_pin', pin)) || (await rpcTrue(cfg, 'verify_admin_pin', pin));
}

// Where to send the RO back after signing in: a page of this app, on a
// hostname that serves this club (HOSTNAME_MAP), or on a shared host with
// ?club=<this club>. Anything else is refused, so the callback can't be
// turned into an open redirect.
function safeReturn(raw, slug) {
  let u;
  try { u = new URL(raw); } catch (e) { return null; }
  let map = {};
  try { map = JSON.parse(process.env.HOSTNAME_MAP || '{}'); } catch (e) { map = {}; }
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol !== 'https:' && !local) return null;
  if (!(u.hostname in map)) return null;
  if (map[u.hostname] !== slug && u.searchParams.get('club') !== slug) return null;
  u.hash = '';
  ['ss_connect', 'ss_connect_msg'].forEach(k => u.searchParams.delete(k));
  return u.toString();
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });
  const slug = resolveClubSlug(event);
  const db = clubDb(slug);
  if (!db) return json(503, { error: 'not-configured', message: 'This club has no server key set up' });

  let req;
  try { req = JSON.parse(event.body || '{}'); } catch (e) { return json(400, { error: 'invalid' }); }
  if (!(await pinOk(db.cfg, req.pin))) return json(403, { error: 'pin', message: 'RO or Club Admin PIN required' });

  let client;
  try { client = await oauthClient(slug); }
  catch (e) { return json(200, { configured: false, migration: /076/.test(e.message) ? false : null, error: e.message }); }

  if (req.action === 'register') {
    const clientId = String(req.clientId || '').trim();
    const redirectUri = String(req.redirectUri || '').trim();
    let u = null;
    try { u = new URL(redirectUri); } catch (e) { u = null; }
    // Sail Scoring takes https, or http on 127.0.0.1 while developing; and
    // it has to land on this app's callback
    const okUri = u && (u.protocol === 'https:' || (u.protocol === 'http:' && u.hostname === '127.0.0.1')) && u.pathname === CALLBACK_PATH;
    if (!clientId || clientId.length > 200) return json(400, { error: 'invalid', message: 'Enter the client id Sail Scoring issued' });
    if (!okUri) return json(400, { error: 'invalid', message: 'Redirect URI must be https://<this app>' + CALLBACK_PATH });
    const fields = { client_id: clientId, redirect_uri: redirectUri, scopes: String(req.scopes || '').trim() || null };
    const secret = String(req.clientSecret || '').trim();
    // Sail Scoring only accepts the id and secret together (HTTP Basic)
    if (!secret && !client.secret) return json(400, { error: 'invalid', message: 'Enter the client secret Sail Scoring issued with the client id' });
    if (secret) fields.client_secret = secret;
    try { await writeClient(slug, fields); } catch (e) { return json(500, { error: 'internal', message: e.message }); }
    return json(200, { ok: true });
  }

  if (req.action === 'status') {
    let conn;
    try { conn = await readConnection(slug); }
    catch (e) { return json(200, { configured: client.configured, migration: /076/.test(e.message) ? false : null, error: e.message }); }
    const out = {
      configured: client.configured, migration: true,
      // 078: one token renewal at a time — connecting waits for it
      refreshLock: await hasRefreshLock(slug),
      registration: { clientId: client.id, redirectUri: client.redirectUri, hasSecret: !!client.secret, scopes: client.scopes },
      connected: !!conn && conn.status === 'connected',
      lapsed: !!conn && conn.status === 'lapsed',
      workspace: conn && conn.workspace_slug ? { slug: conn.workspace_slug, name: conn.workspace_name || conn.workspace_slug } : null,
      scope: conn ? conn.scope : null,
      connectedAt: conn ? conn.connected_at : null,
      lastError: conn ? conn.last_error : null,
    };
    if (req.check && out.connected) {
      const r = await wsApi(slug, 'GET', '/workspaces');
      out.check = r.status === 200 ? 'ok' : (r.error || ('HTTP ' + r.status));
      if (r.error === 'lapsed') { out.connected = false; out.lapsed = true; }
    }
    return json(200, out);
  }

  if (req.action === 'start') {
    if (!client.configured) return json(503, { error: 'not-configured', message: "Enter the club's Sail Scoring client id and secret first" });
    if (!(await hasRefreshLock(slug))) return json(503, { error: 'not-configured', message: 'Needs database migration 078 first' });
    const returnTo = safeReturn(req.returnTo, slug);
    if (!returnTo) return json(400, { error: 'invalid', message: 'Unrecognised return address' });
    const { verifier, challenge } = pkcePair();
    const nonce = crypto.randomBytes(24).toString('base64url');
    // Clear abandoned sign-ins, then record this one
    await db.req('ss_oauth_pending?created_at=lt.' + encodeURIComponent(new Date(Date.now() - PENDING_TTL_MS).toISOString()), { method: 'DELETE' });
    const ins = await db.req('ss_oauth_pending', {
      method: 'POST', headers: { Prefer: 'return=minimal' },
      body: { nonce, code_verifier: verifier, return_to: returnTo },
    });
    if (!ins.ok) return json(500, { error: 'internal', message: ins.status === 404 ? 'Migration 076 not applied' : 'Could not start sign-in' });
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: client.id,
      redirect_uri: client.redirectUri,
      scope: client.scopes,
      state: slug + '.' + nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    });
    return json(200, { url: oauthBase(slug) + '/api/auth/oauth2/authorize?' + q.toString() });
  }

  if (req.action === 'disconnect') {
    let conn = null;
    try { conn = await readConnection(slug); } catch (e) { return json(500, { error: 'internal', message: e.message }); }
    if (conn) {
      await revokeToken(slug, conn.refresh_token, 'refresh_token');
      await revokeToken(slug, conn.access_token, 'access_token');
      const del = await db.req('ss_connection?id=eq.club', { method: 'DELETE' });
      if (!del.ok) return json(500, { error: 'internal', message: 'Could not remove the connection' });
    }
    return json(200, { ok: true });
  }

  return json(400, { error: 'invalid', message: 'Unknown action' });
};
