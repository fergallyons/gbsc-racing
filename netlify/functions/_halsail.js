// Shared helper for the Halsail Netlify Functions.
//
// Halsail's JSON API (/HalApi/...) now requires an API key, sent as the
// request header `halsailapikey` — other forms (Bearer, X-Api-Key, ?key=) are
// ignored by Halsail. The key lives only in Netlify environment variables,
// never in the repo, the database or the browser, so every Halsail API call
// has to go through a function that adds it.
//
//   HALSAIL_API_KEY            the key (HALSAIL_API_KEY_<SLUG> overrides it for one club)
//   HALSAIL_API_BASE           optional host override, e.g. https://raceops.halsail.com
//                              (Halsail's test/enhancement host); defaults to https://halsail.com
//
// The public HTML report pages (/Result/...) need no key and don't get one.

const { clubEnv } = require('./_club');

function apiBase(event) {
  return (clubEnv(event, 'HALSAIL_API_BASE') || 'https://halsail.com').replace(/\/+$/, '');
}

function apiHeaders(event, accept) {
  const headers = { Accept: accept || 'application/json' };
  const key = clubEnv(event, 'HALSAIL_API_KEY');
  if (key) headers.halsailapikey = key;
  return headers;
}

module.exports = { apiBase, apiHeaders };
