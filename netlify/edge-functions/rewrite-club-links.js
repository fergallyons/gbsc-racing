/**
 * Netlify Edge Function: rewrite club-specific <head> links in HTML
 *
 * Three tags need the resolved club's branding baked in server-side, before
 * any JS runs:
 *   - <link rel="manifest">      — Chrome/Android read this immediately to
 *                                  decide PWA installability
 *   - <link rel="icon">          — some browsers capture the favicon very
 *                                  early, before an async script can update it
 *   - <link rel="apple-touch-icon"> — iOS Safari's "Add to Home Screen" reads
 *                                  THIS tag for the home-screen icon, not the
 *                                  web manifest, and (like the others) reads
 *                                  it before JS runs
 *
 * index.html ships all three hardcoded to GBSC's defaults (favicon.svg).
 * A client-side JS update (see index.html's early inline script, and
 * _reapplyBranding() in app.js) runs afterwards, but by then it's too late
 * for the moments above — confirmed as the reason the favicon and PWA home-
 * screen icon didn't reflect a club's branding even though the in-app logo
 * (which only needs to be right by the time a human looks at the page) did.
 *
 * Runs on every request to "/" (not just ?club= overrides) since even
 * hostname-routed clubs are served the same static index.html with GBSC's
 * defaults baked in — this needs to run for all of them, not just the
 * override case used for testing.
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

export default async function handler(request, context) {
  const response = await context.next();
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return response;

  const url = new URL(request.url);
  const host = (request.headers.get('host') || '').split(':')[0];
  const overrideSlug = url.searchParams.get('club');
  const allowOverride = Deno.env.get('ALLOW_CLUB_OVERRIDE') !== 'false';

  let hostnameMap = {};
  try {
    hostnameMap = JSON.parse(Deno.env.get('HOSTNAME_MAP') || '{}');
  } catch (e) {
    console.error('rewrite-club-links: bad HOSTNAME_MAP JSON', e);
  }
  const slug = (allowOverride && overrideSlug)
    ? overrideSlug.toLowerCase().replace(/[^a-z0-9]/g, '')
    : hostnameMap[host] || hostnameMap['default'] || 'gbsc';

  const configJson = Deno.env.get('CLUB_CONFIG_' + slug.toUpperCase());
  let club = {};
  if (configJson) {
    try { club = JSON.parse(configJson); } catch (e) {}
  }

  let faviconUrl = club.faviconUrl || club.faviconurl || club.logoUrl || club.logourl || club.logo_url || club.logo || '';
  if (!faviconUrl) faviconUrl = await dbFaviconFallback(club);

  let html = await response.text();

  // Manifest link — always carry the resolved slug, so the browser's
  // manifest fetch (which happens before JS runs) hits the right per-club
  // config regardless of how the club was resolved (hostname or override).
  html = html.replace(
    /(<link[^>]+rel=["']manifest["'][^>]*href=["'])([^"']+)(["'])/i,
    (_, pre, href, quote) => {
      const manifestUrl = new URL(href, url);
      manifestUrl.searchParams.set('club', slug);
      return pre + manifestUrl.pathname + manifestUrl.search + quote;
    }
  );

  // Favicon + apple-touch-icon — only rewrite if this club has a custom
  // one configured; otherwise leave the default favicon.svg reference as-is.
  if (faviconUrl) {
    const ext = faviconUrl.split('.').pop().toLowerCase();
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/svg+xml';
    // <link rel="icon"> hardcodes type="image/svg+xml" in index.html — fix
    // that too, since a mismatched declared type can make browsers reject
    // a non-SVG favicon (e.g. GBSC's is a .jpg).
    html = html.replace(
      /<link([^>]+rel=["']icon["'][^>]*)>/i,
      (full, attrs) => {
        const withoutTypeHref = attrs.replace(/\s+type=["'][^"']*["']/i, '').replace(/\s+href=["'][^"']*["']/i, '');
        return `<link${withoutTypeHref} type="${mime}" href="${faviconUrl}">`;
      }
    );
    html = html.replace(
      /(<link[^>]+rel=["']apple-touch-icon["'][^>]*href=["'])([^"']+)(["'])/i,
      (_, pre, href, quote) => pre + faviconUrl + quote
    );
  }

  return new Response(html, { status: response.status, headers: response.headers });
}

export const config = { path: '/' };
