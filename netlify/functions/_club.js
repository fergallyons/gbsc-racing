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

// Reads env var `${prefix}_<SLUG>` for the resolved club, falling back to the
// bare `prefix` var (existing GBSC-only setups keep working unchanged).
function clubEnv(event, prefix) {
  const slug = resolveClubSlug(event);
  return process.env[prefix + '_' + slug.toUpperCase()] || process.env[prefix] || '';
}

module.exports = { resolveClubSlug, clubEnv };
