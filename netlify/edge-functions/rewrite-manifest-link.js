/**
 * Netlify Edge Function: rewrite manifest link in HTML
 *
 * Chrome fetches <link rel="manifest"> before JavaScript runs, so updating
 * the href via JS is too late for the PWA install prompt to see the correct
 * per-club manifest.  This edge function intercepts the HTML page and
 * rewrites the href server-side when a ?club= parameter is present.
 *
 * Only activates when ?club= is in the URL; all other requests pass through
 * unmodified so there is no performance impact for hostname-routed clubs.
 */

export default async function handler(request, context) {
  const url = new URL(request.url);
  const clubParam = url.searchParams.get('club');

  // No override — let Netlify serve the static file as normal
  if (!clubParam) return context.next();

  const slug = clubParam.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return context.next();

  // Fetch the underlying HTML
  const response = await context.next();

  // Only rewrite HTML responses
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return response;

  const html = await response.text();

  // Rewrite the manifest link href to include the club slug
  const rewritten = html.replace(
    /(<link[^>]+rel=["']manifest["'][^>]*href=["'])([^"']+)(["'])/i,
    (_, pre, href, quote) => {
      const manifestUrl = new URL(href, url);
      manifestUrl.searchParams.set('club', slug);
      return pre + manifestUrl.pathname + manifestUrl.search + quote;
    }
  );

  return new Response(rewritten, {
    status: response.status,
    headers: response.headers,
  });
}

export const config = { path: '/' };
