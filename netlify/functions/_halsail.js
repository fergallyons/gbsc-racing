// Shared helper for the Halsail Netlify Functions.
//
// Halsail's JSON API requires an API key, sent as the request header
// `halsailapikey` (Bearer, X-Api-Key, ?key= etc. are ignored by Halsail).
// The key is CLUB-SPECIFIC, so it lives in that club's own database
// (settings.hal_api_key, migration 068, entered in Club Settings) — write-only
// for the browser, readable only here with the club's service key, so it never
// reaches the browser. Every Halsail API call therefore has to go through a
// function that adds it.
//
// Which club a request belongs to is decided from the HOSTNAME only (same
// HOSTNAME_MAP resolution as the other functions) — deliberately NOT from a
// ?club= query parameter, so a request can't make one club's host use another
// club's key (and so halsail-class-map's own ?club=<Halsail id> can't be
// mistaken for a club slug).
//
//   settings.hal_api_key           the club's key (primary source)
//   HALSAIL_API_KEY[_<SLUG>]       optional env fallback if the database has none
//   HALSAIL_API_BASE[_<SLUG>]      optional host override, e.g. https://raceops.halsail.com
//                                  (Halsail's test host); defaults to https://halsail.com
//   CLUB_CONFIG_<SLUG> + SUPABASE_SERVICE_KEY[_<SLUG>]   existing per-club settings
//                                  used to reach the club's database
//
// The bare (unsuffixed) env vars are GBSC's own values, so only the default
// club falls back to them (_club.js envForSlug) — another club with no
// _<SLUG> var of its own gets no env key and the live host, never GBSC's.
//
// The public HTML report pages (/Result/...) need no key and don't get one.

const { resolveClubSlug, envForSlug: envFor } = require('./_club');

const KEY_TTL_MS = 60 * 1000; // short, so a key just saved in Club Settings is picked up within a minute
const keyCache = {}; // slug -> { key, at } (per warm function instance)

function hostSlug(event) {
  return resolveClubSlug({ headers: (event && event.headers) || {}, queryStringParameters: {} });
}

function apiBase(event) {
  return (envFor(hostSlug(event), 'HALSAIL_API_BASE') || 'https://halsail.com').replace(/\/+$/, '');
}

async function readKeyFromClubDb(slug) {
  let cfg = null;
  try { cfg = JSON.parse(process.env['CLUB_CONFIG_' + slug.toUpperCase()] || 'null'); } catch (e) { cfg = null; }
  const serviceKey = envFor(slug, 'SUPABASE_SERVICE_KEY');
  if (!cfg || !cfg.sbUrl || !serviceKey) return '';
  const res = await fetch(cfg.sbUrl + '/rest/v1/settings?id=eq.club&select=hal_api_key', {
    headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey },
  });
  if (!res.ok) return ''; // e.g. migration 068 not applied on this club yet
  const rows = await res.json();
  return (rows && rows[0] && rows[0].hal_api_key) || '';
}

async function getApiKey(event) {
  const slug = hostSlug(event);
  const hit = keyCache[slug];
  if (hit && Date.now() - hit.at < KEY_TTL_MS) return hit.key;
  let key = '';
  try { key = await readKeyFromClubDb(slug); }
  catch (e) { console.error('_halsail: could not read club key for ' + slug + ': ' + e.message); }
  if (!key) key = envFor(slug, 'HALSAIL_API_KEY');
  keyCache[slug] = { key, at: Date.now() };
  return key;
}

async function apiHeaders(event, accept) {
  const headers = { Accept: accept || 'application/json' };
  const key = await getApiKey(event);
  if (key) headers.halsailapikey = key;
  return headers;
}

module.exports = { apiBase, apiHeaders };
