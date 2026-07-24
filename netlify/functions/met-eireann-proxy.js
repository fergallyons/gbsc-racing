// Netlify serverless function: Met Éireann API proxy (forecast + warnings)
// Browsers can't call openaccess.pf.api.met.ie directly — it sends no
// Access-Control-Allow-Origin header, so a client-side fetch() is blocked
// by CORS. This runs server-side and forwards the request, returning the
// raw XML with CORS headers added. Same pattern as halsail-proxy.js.
//
// warnings.rss.xml (www.met.ie) DOES send its own CORS headers, so a direct
// browser fetch could work in principle — but proxying it too, through the
// exact same path as the forecast, means the client only ever depends on
// this app's own domain rather than a third party's CDN/CORS configuration
// staying consistent. More robust, and one less thing that can silently
// break the licence-required warnings display (see fetchMetWarnings() in
// app.js — publishing Met Éireann forecast data without also publishing
// their current Weather Warnings is a breach of their Custom Open Data
// Licence, not just missing attribution).
//
// Forecast upstream is HTTP-only (no HTTPS listener) — fine here since this
// fetch happens server-side, not in the browser, so there's no mixed-
// content concern; only this function's own response to the browser needs
// to be HTTPS, which Netlify already guarantees.
//
// Data source: Met Éireann (Ireland's national meteorological service),
// via their Custom Open Data Licence — https://www.met.ie/about-us/
// specialised-services/open-data

exports.handler = async (event) => {
  const { lat, lon, type } = event.queryStringParameters || {};

  let url;
  if (type === 'warnings') {
    url = 'https://www.met.ie/warningsxml/rss.xml';
  } else {
    const latNum = parseFloat(lat), lonNum = parseFloat(lon);
    if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) {
      return { statusCode: 400, body: JSON.stringify({ error: 'lat/lon required' }) };
    }
    url = 'http://openaccess.pf.api.met.ie/metno-wdb2ts/locationforecast'
      + '?lat=' + latNum + ';long=' + lonNum;
  }

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
