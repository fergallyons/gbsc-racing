/**
 * Netlify Edge Function: /manifest.json
 *
 * Serves a per-club PWA manifest so the installed app name, short_name,
 * and description reflect the actual club rather than defaulting to GBSC.
 *
 * Uses the same hostname → slug → CLUB_CONFIG_<SLUG> resolution as club-config.js.
 * The static manifest.json in the repo root is kept as a local-dev fallback only;
 * this edge function intercepts the path in all Netlify deployments.
 */

// Fallback for clubs (e.g. GBSC) whose logo/favicon is set on the DB
// settings row rather than the CLUB_CONFIG_<SLUG> env var — the env var
// config already carries sbUrl/sbKey, so this is a cheap direct REST call,
// not a general DB integration. Only called when the env var has no
// favicon/logo, so already-configured clubs pay no extra latency.
async function dbFaviconFallback(club) {
  if (!club.sbUrl || !club.sbKey) return '';
  try {
    const r = await fetch(
      club.sbUrl + '/rest/v1/settings?id=eq.club&select=logo_url,favicon_url',
      { headers: { apikey: club.sbKey, Authorization: 'Bearer ' + club.sbKey } }
    );
    if (!r.ok) return '';
    const rows = await r.json();
    const row = rows[0] || {};
    return row.favicon_url || row.logo_url || '';
  } catch (e) {
    return '';
  }
}

export default async function handler(request) {
  const host = (request.headers.get('host') || '').split(':')[0];

  // Resolve club slug (same logic as club-config.js)
  const url = new URL(request.url);
  const overrideSlug = url.searchParams.get('club');
  const allowOverride = Deno.env.get('ALLOW_CLUB_OVERRIDE') !== 'false';

  let hostnameMap = {};
  try {
    hostnameMap = JSON.parse(Deno.env.get('HOSTNAME_MAP') || '{}');
  } catch (e) {
    console.error('manifest: bad HOSTNAME_MAP JSON', e);
  }
  const slug = (allowOverride && overrideSlug)
    ? overrideSlug.toLowerCase().replace(/[^a-z0-9]/g, '')
    : hostnameMap[host] || hostnameMap['default'] || 'gbsc';

  // Load club config
  const configJson = Deno.env.get('CLUB_CONFIG_' + slug.toUpperCase());
  let club = { name: 'GBSC Racing', short: 'GBSC', slug: 'gbsc' };
  if (configJson) {
    try { club = JSON.parse(configJson); } catch (e) {}
  }

  let faviconUrl = club.faviconUrl || club.faviconurl || club.logoUrl || club.logourl || club.logo_url || club.logo || '';
  if (!faviconUrl) faviconUrl = await dbFaviconFallback(club);
  const ext = faviconUrl ? faviconUrl.split('.').pop().toLowerCase() : '';
  const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/svg+xml';

  const icons = faviconUrl
    ? [{ src: faviconUrl, sizes: 'any', type: mime, purpose: 'any' }]
    : [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }];

  // Use club slug as unique app identifier so each club installs as a separate PWA.
  // start_url carries ?club= so launching from home screen loads the correct club.
  const isDefault = slug === (hostnameMap['default'] || 'gbsc');
  const startUrl  = isDefault ? '/' : `/?club=${encodeURIComponent(slug)}`;

  const manifest = {
    id:               startUrl,
    name:             `${club.short} Racing — ${club.name}`,
    short_name:       `${club.short} Racing`,
    description:      `${club.name} — Race Management`,
    start_url:        startUrl,
    scope:            '/',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#081529',
    theme_color:      '#0f1f3d',
    icons,
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type':  'application/manifest+json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

export const config = { path: '/manifest.json' };
