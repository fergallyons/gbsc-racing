// Netlify serverless function: Met Éireann forecast API proxy
// Browsers can't call openaccess.pf.api.met.ie directly — it sends no
// Access-Control-Allow-Origin header, so a client-side fetch() is blocked
// by CORS. This runs server-side and forwards the request, returning the
// raw XML with CORS headers added. Same pattern as halsail-proxy.js.
//
// Upstream is HTTP-only (no HTTPS listener) — fine here since this fetch
// happens server-side, not in the browser, so there's no mixed-content
// concern; only this function's own response to the browser needs to be
// HTTPS, which Netlify already guarantees.
//
// Data source: Met Éireann (Ireland's national meteorological service),
// via their Custom Open Data Licence (CC BY 4.0 + attribution/disclaimer
// requirement) — https://www.met.ie/about-us/specialised-services/open-data

exports.handler = async (event) => {
  const { lat, lon } = event.queryStringParameters || {};
  const latNum = parseFloat(lat), lonNum = parseFloat(lon);
  if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'lat/lon required' }) };
  }

  const url = 'http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast'
    + '?lat=' + latNum + ';long=' + lonNum;

  try {
    const res = await fetch(url);
    const body = await res.text();
    return {
      statusCode: res.status,
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
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
