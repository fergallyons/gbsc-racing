// Netlify serverless function: Halsail API proxy
// Browsers can't call halsail.com directly (no CORS headers).
// This function runs server-side and forwards the request, then returns the JSON.

exports.handler = async (event) => {
  const path = (event.queryStringParameters || {}).path || '';

  if (!path.startsWith('/')) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid path' }) };
  }

  try {
    const res = await fetch('https://halsail.com/HalApi' + path, {
      headers: { 'Accept': 'application/json' },
    });
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/json',
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
