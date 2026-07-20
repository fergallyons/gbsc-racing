// Netlify serverless function: Halsail API proxy
// Browsers can't call halsail.com directly (no CORS headers).
// This function runs server-side and forwards the request, then returns the JSON.

exports.handler = async (event) => {
  const path = (event.queryStringParameters || {}).path || '';

  if (!path.startsWith('/')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid path' }) };
  }

  // Paths under /Result/ are Halsail's public HTML report pages (e.g. the ECHO race
  // analysis page), served from the site root — not the /HalApi JSON API. Everything
  // else keeps the original /HalApi-prefixed behaviour.
  const isHtmlReport = path.startsWith('/Result/');
  const base = isHtmlReport ? 'https://halsail.com' : 'https://halsail.com/HalApi';

  try {
    const res = await fetch(base + path, {
      headers: { 'Accept': isHtmlReport ? 'text/html' : 'application/json' },
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': isHtmlReport ? 'text/html; charset=utf-8' : 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body,
    };
  } catch (e) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: e.message }),
    };
  }
};
