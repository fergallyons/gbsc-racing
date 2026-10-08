// Shared helper for Netlify Functions (not edge functions) that need to know
// which club a request belongs to. Mirrors the hostname → slug resolution in
// netlify/edge-functions/club-config.js so both layers agree on the same club
// for the same request.

function resolveClubSlug(event) {
  const host = ((event.headers && (event.headers.host || event.headers.Host)) || '').split(':')[0];

  const allowOverride = process.env.ALLOW_CLUB_OVERRIDE !== 'false';
  const overrideSlug = allowOverride && event.queryStringParameters && event.queryStringParameters.club;

  let hostnameMap = {};
  try { hostnameMap = JSON.parse(process.env.HOSTNAME_MAP || '{}'); }
  catch (e) { console.error('_club: bad HOSTNAME_MAP JSON', e); }

  return (overrideSlug
    ? overrideSlug.toLowerCase().replace(/[^a-z0-9]/g, '')
    : hostnameMap[host] || hostnameMap['default'] || 'gbsc');
}

// The club a bare (unsuffixed) env var belongs to — HOSTNAME_MAP's default
// entry, else GBSC. Bare vars predate multi-club support and are GBSC's own
// values, so only this club may fall back to them.
function defaultClubSlug() {
  let hostnameMap = {};
  try { hostnameMap = JSON.parse(process.env.HOSTNAME_MAP || '{}'); }
  catch (e) { /* logged by resolveClubSlug */ }
  return hostnameMap['default'] || 'gbsc';
}

// Reads env var `${prefix}_<SLUG>`, falling back to the bare `prefix` var for
// the DEFAULT club only (existing GBSC-only setups keep working unchanged).
// Any other club without its own var gets '' — never GBSC's Stripe account,
// service key or push keys — and the caller reports the feature as not
// configured for that club.
function envForSlug(slug, prefix) {
  slug = String(slug || '').toLowerCase();
  const own = process.env[prefix + '_' + slug.toUpperCase()];
  if (own) return own;
  return slug === defaultClubSlug().toLowerCase() ? (process.env[prefix] || '') : '';
}

// envForSlug() for the club this request resolves to (hostname or ?club=).
// Honouring ?club= is safe here: it can only select a club's OWN complete
// set of values (its CLUB_CONFIG_<SLUG> plus its own _<SLUG> secrets), never
// mix one club's secret with another club's database or account.
function clubEnv(event, prefix) {
  return envForSlug(resolveClubSlug(event), prefix);
}

module.exports = { resolveClubSlug, clubEnv, envForSlug, defaultClubSlug };
