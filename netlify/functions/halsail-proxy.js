// Netlify serverless function: Halsail API proxy
// Browsers can't call halsail.com directly (no CORS headers).
// This function runs server-side and forwards the request, then returns the JSON.

export default async (req) => {
  const url = new URL(req.url);
  const path = url.searchParams.get('path') || '';

  if (!path.startsWith('/')) {
    return new Response(JSON.stringify({ error: 'Invalid path' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const res = await fetch('https://halsail.com/HalApi' + path, {
      headers: { 'Accept': 'application/json' },
    });
    const body = await res.text();
    return new Response(body, {
      status: res.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502, headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const config = { path: '/api/halsail' };
