// Shared helper for the Sail Scoring Netlify Functions.
//
// Sail Scoring's REST API (app.sailscoring.ie/api/v1 — the same API its
// `sailscoring` CLI uses, see github.com/sailscoring/sailscoring docs/cli.md
// and docs/design/decisions/009-api-and-cli.md) authenticates with a per-club
// key sent as `Authorization: Bearer <key>`, plus an optional
// `x-sailscoring-workspace` header (slug or id) choosing the workspace when
// the key isn't pinned to one.
//
// Same storage rules as _halsail.js: the key lives in the club's own database
// (settings.ss_api_key, migration 069 — no field in the app yet, set it in SQL),
// write-only for the browser and readable only here with the club's service
// key. The club is decided from the HOSTNAME only, never a query parameter.
//
//   settings.ss_api_key                  the club's key (primary source)
//   settings.features.ssWorkspace        sent as x-sailscoring-workspace if set
//   SAILSCORING_API_KEY[_<SLUG>]         optional env fallback for the key (bare
//                                        var: default club only)
//   SAILSCORING_BASE_URL[_<SLUG>]        optional host override; defaults to
//                                        https://app.sailscoring.ie
//
// /api/v1 is Sail Scoring's internal contract (no stability promise yet), so
// callers should read responses tolerantly.

const { resolveClubSlug, envForSlug } = require('./_club');

const CFG_TTL_MS = 60 * 1000; // a newly saved key is picked up within a minute
const cfgCache = {}; // slug -> { key, workspace, at } (per warm function instance)

function hostSlug(event) {
  return resolveClubSlug({ headers: (event && event.headers) || {}, queryStringParameters: {} });
}

// Club-specific value, falling back to the bare (GBSC) var for the default
// club only — see envForSlug in _club.js
const envFor = envForSlug;

function apiBaseForSlug(slug) {
  return (envFor(slug, 'SAILSCORING_BASE_URL') || 'https://app.sailscoring.ie').replace(/\/+$/, '');
}
function apiBase(event) { return apiBaseForSlug(hostSlug(event)); }

async function readCfgFromClubDb(slug) {
  let cfg = null;
  try { cfg = JSON.parse(process.env['CLUB_CONFIG_' + slug.toUpperCase()] || 'null'); } catch (e) { cfg = null; }
  const serviceKey = envFor(slug, 'SUPABASE_SERVICE_KEY');
  if (!cfg || !cfg.sbUrl || !serviceKey) return {};
  const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey };
  let res = await fetch(cfg.sbUrl + '/rest/v1/settings?id=eq.club&select=ss_api_key,features', { headers });
  // Migration 069 not applied on this club yet — still pick up the workspace
  if (!res.ok) res = await fetch(cfg.sbUrl + '/rest/v1/settings?id=eq.club&select=features', { headers });
  if (!res.ok) return {};
  const row = ((await res.json()) || [])[0] || {};
  const ws = row.features && row.features.ssWorkspace;
  return {
    key: row.ss_api_key || '',
    workspace: typeof ws === 'string' && /^[A-Za-z0-9_-]+$/.test(ws) ? ws : '',
  };
}

async function getCfg(event) { return getCfgForSlug(hostSlug(event)); }
async function getCfgForSlug(slug) {
  const hit = cfgCache[slug];
  if (hit && Date.now() - hit.at < CFG_TTL_MS) return hit;
  let cfg = {};
  try { cfg = await readCfgFromClubDb(slug); }
  catch (e) { console.error('_sailscoring: could not read club settings for ' + slug + ': ' + e.message); }
  const out = {
    key: cfg.key || envFor(slug, 'SAILSCORING_API_KEY'),
    workspace: cfg.workspace || '',
    at: Date.now(),
  };
  cfgCache[slug] = out;
  return out;
}

// GET an /api/v1 path. Resolves { status, body } (body parsed JSON or null);
// status 0 means no key is configured, so nothing was sent.
async function apiGet(event, path) { return apiGetForSlug(hostSlug(event), path); }
// Same, for a club named directly — scheduled functions (results-watch)
// have no request hostname to resolve a club from.
async function apiGetForSlug(slug, path) {
  const { key, workspace } = await getCfgForSlug(slug);
  if (!key) return { status: 0, body: null };
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + key };
  if (workspace) headers['x-sailscoring-workspace'] = workspace;
  const res = await fetch(apiBaseForSlug(slug) + '/api/v1' + path, { headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  return { status: res.status, body };
}

// ── Connected-app access (OAuth — migration 076) ───────────────────────────
// Sail Scoring's authenticated API (docs/public-api.md "Acting in a
// workspace", still a preview: read every reply tolerantly). A club's RO or
// Club Admin connects RaceOps from Sail Scoring Setup (ss-connect.js →
// Sail Scoring's sign-in → ss-oauth-callback.js); the tokens act as the
// person who approved, in the one workspace they chose, and live only in
// the club's own ss_connection table (service role only).
//
// Each club's RaceOps is registered with Sail Scoring separately, and its
// registration lives in the club's own database (ss_client, entered in
// Sail Scoring Setup): client id, secret, the redirect URI exactly as
// registered, and optionally the scopes to ask for. Sail Scoring takes the
// id and secret only in an HTTP Basic header at the token endpoint, so a
// club isn't ready to connect until both are saved.
// SAILSCORING_BASE_URL[_<SLUG>] still overrides the host (a test instance).

const crypto = require('crypto');

// submissions = handing recorded finishes to the scorer (Sail Scoring #671)
const DEFAULT_SCOPES = 'read races submissions publish offline_access';
const TOKEN_PATH = '/api/auth/oauth2/token';
const REFRESH_LOCK_MS = 30 * 1000;

function oauthBase(slug) {
  return apiBaseForSlug(slug);
}
// The club's registration: { id, secret, redirectUri, scopes, issuer,
// configured }. Throws like readConnection when the table isn't there.
async function oauthClient(slug) {
  const db = clubDb(slug);
  if (!db) throw new Error('no service key for ' + slug);
  const r = await db.req('ss_client?id=eq.club&select=*');
  if (!r.ok) throw new Error(r.status === 404 ? 'migration 076 not applied' : 'ss_client HTTP ' + r.status);
  const row = (Array.isArray(r.body) && r.body[0]) || {};
  return {
    id: row.client_id || '',
    secret: row.client_secret || '',
    redirectUri: row.redirect_uri || '',
    scopes: row.scopes || DEFAULT_SCOPES,
    issuer: oauthBase(slug) + '/api/auth',
    configured: !!(row.client_id && row.client_secret && row.redirect_uri),
  };
}
async function writeClient(slug, fields) {
  const r = await clubDb(slug).req('ss_client', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { id: 'club', ...fields, updated_at: new Date().toISOString() },
  });
  if (!r.ok) throw new Error('could not save the Sail Scoring registration (HTTP ' + r.status + ')');
}

// PKCE (S256)
function pkcePair() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// The club's database with its service key, or null if it has none
function clubDb(slug) {
  let cfg = null;
  try { cfg = JSON.parse(process.env['CLUB_CONFIG_' + String(slug).toUpperCase()] || 'null'); } catch (e) { cfg = null; }
  const serviceKey = envFor(slug, 'SUPABASE_SERVICE_KEY');
  if (!cfg || !cfg.sbUrl || !serviceKey) return null;
  const headers = { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, Accept: 'application/json' };
  return {
    cfg,
    async req(path, opts) {
      const o = opts || {};
      const res = await fetch(cfg.sbUrl + '/rest/v1/' + path, {
        method: o.method || 'GET',
        headers: { ...headers, ...(o.body ? { 'Content-Type': 'application/json' } : {}), ...(o.headers || {}) },
        body: o.body ? JSON.stringify(o.body) : undefined,
      });
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
      return { status: res.status, ok: res.ok, body };
    },
  };
}

// The club's connection row, null if not connected; throws if the club has
// no service key or hasn't applied migration 076 (message says which)
async function readConnection(slug) {
  const db = clubDb(slug);
  if (!db) throw new Error('no service key for ' + slug);
  const r = await db.req('ss_connection?id=eq.club&select=*');
  if (!r.ok) throw new Error(r.status === 404 ? 'migration 076 not applied' : 'ss_connection HTTP ' + r.status);
  return (Array.isArray(r.body) && r.body[0]) || null;
}
// Whether migration 078 (the renewal lock) is applied — renewing without it
// isn't safe, so connecting waits for it
async function hasRefreshLock(slug) {
  const r = await clubDb(slug).req('ss_connection?select=refresh_lock_until&limit=1');
  return r.ok;
}
async function writeConnection(slug, fields) {
  const r = await clubDb(slug).req('ss_connection', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: { id: 'club', ...fields, updated_at: new Date().toISOString() },
  });
  if (!r.ok) throw new Error('could not save the Sail Scoring connection (HTTP ' + r.status + ')');
}

// POST to the token or revocation endpoint (form-encoded), the client id
// and secret in an HTTP Basic header — the only way Sail Scoring accepts
// them (each form-encoded first, as RFC 6749 2.3.1 says).
async function oauthPost(slug, path, params) {
  const c = await oauthClient(slug);
  if (!c.configured) return { status: 0, ok: false, body: { error: 'not-configured' } };
  const enc = v => encodeURIComponent(v).replace(/%20/g, '+');
  const res = await fetch(oauthBase(slug) + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: 'Basic ' + Buffer.from(enc(c.id) + ':' + enc(c.secret)).toString('base64'),
    },
    body: new URLSearchParams(params).toString(),
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  return { status: res.status, ok: res.ok, body };
}
function tokenFields(body, prev) {
  return {
    access_token: body.access_token,
    access_expires_at: new Date(Date.now() + (Number(body.expires_in) || 3600) * 1000).toISOString(),
    // Every renewal hands back a new refresh token; keep the old one only if it didn't
    refresh_token: body.refresh_token || (prev && prev.refresh_token) || null,
    refreshed_at: body.refresh_token ? new Date().toISOString() : ((prev && prev.refreshed_at) || null),
    scope: body.scope || (prev && prev.scope) || null,
  };
}

// Code from the sign-in redirect → tokens
async function exchangeCode(slug, code, verifier) {
  const c = await oauthClient(slug);
  return oauthPost(slug, TOKEN_PATH, {
    grant_type: 'authorization_code', code, redirect_uri: c.redirectUri, code_verifier: verifier,
  });
}
// Best effort: Sail Scoring forgets the grant (the user can also remove it
// from their account page)
async function revokeToken(slug, token, hint) {
  if (!token) return;
  try { await oauthPost(slug, '/api/auth/oauth2/revoke', { token, token_type_hint: hint || 'refresh_token' }); }
  catch (e) { console.warn('_sailscoring: revoke failed: ' + e.message); }
}

// ── Renewal, one at a time per club ──
// Each renewal returns a new refresh token and retires the old one, and Sail
// Scoring treats a retired refresh token presented again as stolen: it ends
// every grant that account gave RaceOps. So:
//   - a renewal first claims the club's lock (migration 078), a conditional
//     update only one function can win; the rest wait for its result and
//     never send the refresh token they read;
//   - the new refresh token is stored before the new access token is used,
//     with retries, since losing it would leave only the retired one.
const sleep = ms => new Promise(r => setTimeout(r, ms));
const accessFresh = c => !!(c && c.access_token && Date.parse(c.access_expires_at) - Date.now() > 60 * 1000);

// The claimed row (current as of the claim), or null if someone holds it
async function claimRefresh(slug) {
  const now = new Date();
  const r = await clubDb(slug).req(
    'ss_connection?id=eq.club&status=eq.connected&or=(refresh_lock_until.is.null,refresh_lock_until.lt.' + encodeURIComponent(now.toISOString()) + ')',
    { method: 'PATCH', headers: { Prefer: 'return=representation' },
      body: { refresh_lock_until: new Date(now.getTime() + REFRESH_LOCK_MS).toISOString() } });
  return r.ok && Array.isArray(r.body) && r.body[0] ? r.body[0] : null;
}
async function releaseRefresh(slug, extra) {
  try { await writeConnection(slug, { refresh_lock_until: null, ...(extra || {}) }); }
  catch (e) { console.warn('[' + slug + '] could not release the Sail Scoring renewal lock: ' + e.message); }
}
async function renew(slug, row) {
  let r;
  try { r = await oauthPost(slug, TOKEN_PATH, { grant_type: 'refresh_token', refresh_token: row.refresh_token }); }
  catch (e) {
    console.warn('[' + slug + '] Sail Scoring token renewal failed: ' + e.message);
    await releaseRefresh(slug);
    return { error: 'unavailable', conn: row };
  }
  if (r.ok && r.body && r.body.access_token) {
    const fields = { ...tokenFields(r.body, row), status: 'connected', last_error: null, refresh_lock_until: null };
    for (let i = 0; ; i++) {
      try { await writeConnection(slug, fields); break; }
      catch (e) {
        if (i >= 4) {
          // The new refresh token is lost: the stored one is retired, and
          // presenting it would end the grant. Mark it lapsed instead.
          console.error('[' + slug + '] could not store the renewed Sail Scoring token: ' + e.message);
          await releaseRefresh(slug, { status: 'lapsed', last_error: 'A renewed token could not be saved — reconnect in Sail Scoring Setup' });
          return { error: 'lapsed', conn: row };
        }
        await sleep(500 * (i + 1));
      }
    }
    return { token: fields.access_token, conn: { ...row, ...fields } };
  }
  if (r.status === 400 || r.status === 401) {
    // Sail Scoring has ended the grant (180 days without a renewal,
    // disconnected, or a retired token seen): the club reconnects
    await releaseRefresh(slug, { status: 'lapsed', last_error: 'Sail Scoring ended the connection (' + ((r.body && r.body.error) || r.status) + ') — reconnect in Sail Scoring Setup' });
    return { error: 'lapsed', conn: row };
  }
  console.warn('[' + slug + '] Sail Scoring token renewal HTTP ' + r.status);
  await releaseRefresh(slug);
  return { error: 'unavailable', conn: row };
}

// A usable access token for the club: { token, conn } or { error } where
// error is 'not-connected' | 'lapsed' | 'unavailable'. Renews an expiring
// token, or — with force — one Sail Scoring has just refused (staleToken:
// the refused one; if another function has already replaced it, that newer
// token is used instead of renewing again).
async function getAccessToken(slug, opts) {
  const o = { ...(opts || {}) };
  let conn = await readConnection(slug);
  for (let round = 0; round < 3; round++) {
    if (!conn || (!conn.access_token && !conn.refresh_token)) return { error: 'not-connected' };
    if (conn.status === 'lapsed') return { error: 'lapsed', conn };
    const refused = o.force && (!o.staleToken || o.staleToken === conn.access_token);
    if (accessFresh(conn) && !refused) return { token: conn.access_token, conn };
    if (!conn.refresh_token) {
      await writeConnection(slug, { status: 'lapsed', last_error: 'Access expired and there is no refresh token — reconnect' });
      return { error: 'lapsed', conn };
    }
    const claimed = await claimRefresh(slug);
    if (claimed) {
      // Renewed by someone else between our read and the claim: use theirs
      if (claimed.refresh_token !== conn.refresh_token && accessFresh(claimed)) {
        await releaseRefresh(slug);
        return { token: claimed.access_token, conn: claimed };
      }
      return renew(slug, claimed);
    }
    // Another function is renewing: wait for its token (never send ours)
    const before = conn.refresh_token;
    const until = Date.now() + REFRESH_LOCK_MS + 2000;
    while (Date.now() < until) {
      await sleep(750);
      conn = await readConnection(slug);
      if (!conn || conn.status === 'lapsed') break;
      if (conn.refresh_token !== before && accessFresh(conn)) return { token: conn.access_token, conn };
      if (!conn.refresh_lock_until || Date.parse(conn.refresh_lock_until) < Date.now()) break; // its lock lapsed: try to claim
    }
    o.force = false; // a newer token from the other renewal will do
  }
  return { error: 'unavailable', conn };
}

// Call the authenticated API as the connected user: { status, body } with
// status 0 and `error` when there's no usable connection. One retry with a
// fresh token on 401. opts: { body, headers } — e.g. Idempotency-Key,
// If-Match.
async function wsApi(slug, method, path, opts) {
  const o = opts || {};
  const call = async (token, conn) => {
    const headers = { Accept: 'application/json', Authorization: 'Bearer ' + token, ...(o.headers || {}) };
    if (conn && conn.workspace_id) headers['x-sailscoring-workspace'] = conn.workspace_id;
    if (o.body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(oauthBase(slug) + '/api/public/v1' + path, {
      method, headers, body: o.body !== undefined ? JSON.stringify(o.body) : undefined,
    });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
    return { status: res.status, body, headers: res.headers };
  };
  let t = await getAccessToken(slug);
  if (!t.token) return { status: 0, body: null, error: t.error };
  let r = await call(t.token, t.conn);
  if (r.status === 401) {
    t = await getAccessToken(slug, { force: true, staleToken: t.token });
    if (!t.token) return { status: 0, body: null, error: t.error };
    r = await call(t.token, t.conn);
  }
  return r;
}

module.exports = {
  apiBase, apiGet, apiGetForSlug, hostSlug,
  oauthBase, oauthClient, writeClient, pkcePair, clubDb, readConnection, writeConnection, hasRefreshLock,
  exchangeCode, revokeToken, tokenFields, getAccessToken, wsApi,
};
