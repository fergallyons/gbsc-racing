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

  const manifest = {
    name:             `${club.short} Racing — ${club.name}`,
    short_name:       `${club.short} Racing`,
    description:      `${club.name} — Race Management`,
    start_url:        '/',
    display:          'standalone',
    orientation:      'portrait',
    background_color: '#081529',
    theme_color:      '#0f1f3d',
    icons: [
      {
        src:     '/favicon.svg',
        sizes:   'any',
        type:    'image/svg+xml',
        purpose: 'any',
      },
    ],
  };

  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type':  'application/manifest+json',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

export const config = { path: '/manifest.json' };
