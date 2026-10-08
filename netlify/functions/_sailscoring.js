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

function apiBase(event) {
  return (envFor(hostSlug(event), 'SAILSCORING_BASE_URL') || 'https://app.sailscoring.ie').replace(/\/+$/, '');
}

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

async function getCfg(event) {
  const slug = hostSlug(event);
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
async function apiGet(event, path) {
  const { key, workspace } = await getCfg(event);
  if (!key) return { status: 0, body: null };
  const headers = { Accept: 'application/json', Authorization: 'Bearer ' + key };
  if (workspace) headers['x-sailscoring-workspace'] = workspace;
  const res = await fetch(apiBase(event) + '/api/v1' + path, { headers });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch (e) { body = null; }
  return { status: res.status, body };
}

module.exports = { apiBase, apiGet, hostSlug };
