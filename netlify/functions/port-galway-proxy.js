// Netlify serverless function: Port of Galway weather-station API proxy.
// A direct browser fetch() to weather.theportofgalway.ie from this app's
// real origin returns HTTP 503 with an empty body, consistently — an
// origin/referer-based block, since the identical request succeeds
// server-side (no Origin header) or from the dashboard's own origin
// (confirmed directly, 2026-08-14). Same reasoning as
// met-eireann-proxy.js/halsail-proxy.js: relay server-side, add CORS.
//
// Only type=weather is implemented — tide is already covered by this
// app's own fetchTideData() (IMI ERDDAP); buoy/wave data reports too
// unreliably (observed empty for a full hour-window) to treat as live.
// Shaped so adding either later is one more branch, matching
// met-eireann-proxy.js's type=warnings/type=cap switch.

exports.handler = async (event) => {
  const { type, hours } = event.queryStringParameters || {};
  if (type && type !== 'weather') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported type — only "weather" is implemented' }) };
  }
  const hrs = Math.max(1, Math.min(parseInt(hours, 10) || 1, 24));
  const url = 'https://weather.theportofgalway.ie/api/dashboard/weather?hours=' + hrs;

  try {
    const res = await fetch(url);
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
