/**
 * Edge Function: /club-config.js
 *
 * Serves club config as window.CLUB = {...} so app.js can read it at startup.
 *
 * Netlify env vars required:
 *
 *   HOSTNAME_MAP  (JSON)
 *     {"gbsc-hub.netlify.app":"gbsc","yourdomain.com":"gbsc","default":"gbsc"}
 *
 *   HUB_CONFIG_GBSC  (JSON string — one per club, slug uppercased)
 *     {
 *       "name":      "Galway Bay Sailing Club",
 *       "short":     "GBSC",
 *       "slug":      "gbsc",
 *       "sbUrl":     "https://your-project.supabase.co",
 *       "sbKey":     "eyJ...",       <- anon/public key
 *       "adminPin":  "1234",         <- 4-digit admin PIN
 *       "logoUrl":   "https://..."   <- optional logo image URL
 *     }
 */
export default async function handler(request) {
  const host = (request.headers.get('host') || '').split(':')[0];
  const url  = new URL(request.url);

  let hostnameMap = {};
  try { hostnameMap = JSON.parse(Deno.env.get('HOSTNAME_MAP') || '{}'); } catch {}

  const overrideSlug = url.searchParams.get('club');
  const allowOverride = Deno.env.get('ALLOW_CLUB_OVERRIDE') !== 'false';
  const slug = (allowOverride && overrideSlug)
    ? overrideSlug.toLowerCase().replace(/[^a-z0-9]/g, '')
    : hostnameMap[host] || hostnameMap['default'] || 'gbsc';

  const envKey = 'HUB_CONFIG_' + slug.toUpperCase();
  const configJson = Deno.env.get(envKey);

  if (!configJson) {
    console.warn(`club-config: no ${envKey} for host "${host}"`);
    return new Response('window.CLUB=null;', {
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
    });
  }

  let config;
  try { config = JSON.parse(configJson); } catch (e) {
    console.error(`club-config: invalid JSON in ${envKey}`, e);
    return new Response('window.CLUB=null;', {
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
    });
  }

  return new Response(`window.CLUB=${JSON.stringify(config)};`, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

export const config = { path: '/club-config.js' };
