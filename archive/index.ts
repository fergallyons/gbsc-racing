// Supabase Edge Function: halsail-proxy
// Proxies requests to the Halsail public API to avoid CORS issues in the browser.
//
// Deploy with:
//   supabase functions deploy halsail-proxy --no-verify-jwt
//
// Usage from app:
//   GET /functions/v1/halsail-proxy?path=/GetSchedule/3725

const HAL_BASE = 'https://halsail.com/HalApi';

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
      },
    });
  }

  const url = new URL(req.url);
  const path = url.searchParams.get('path');

  if (!path) {
    return new Response(JSON.stringify({ error: 'Missing ?path= parameter' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Only allow GET requests to the Halsail API
  const halUrl = HAL_BASE + path;

  try {
    const halRes = await fetch(halUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    const body = await halRes.text();

    return new Response(body, {
      status: halRes.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=60', // cache for 60s
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
});
