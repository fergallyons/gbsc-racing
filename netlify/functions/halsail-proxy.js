// Netlify serverless function: Halsail API proxy
// Browsers can't call halsail.com directly (no CORS headers), and the JSON API
// now needs an API key that must never reach the browser — this function runs
// server-side, adds the key (see _halsail.js), forwards the request and returns
// Halsail's response with its status code unchanged.

const { apiBase, apiHeaders } = require('./_halsail');

exports.handler = async (event) => {
  const path = (event.queryStringParameters || {}).path || '';

  if (!path.startsWith('/')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid path' }) };
  }

  // Paths under /Result/ are Halsail's public HTML report pages (e.g. the ECHO race
  // analysis page), served from the site root — not the /HalApi JSON API, and they
  // take no key. Everything else is the keyed /HalApi-prefixed JSON API.
  const isHtmlReport = path.startsWith('/Result/');
  const base = apiBase(event);

  try {
    const res = await fetch(base + (isHtmlReport ? '' : '/HalApi') + path, {
      headers: isHtmlReport ? { Accept: 'text/html' } : apiHeaders(event, 'application/json'),
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
