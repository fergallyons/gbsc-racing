// Proxy the IMI ERDDAP tide prediction request to bypass browser CORS restrictions.
// The Irish Marine Institute ERDDAP server does not send permissive CORS headers,
// so direct browser fetches are blocked. This function runs server-side.
exports.handler = async (event) => {
  const from = event.queryStringParameters?.from || '';
  const to   = event.queryStringParameters?.to   || '';
  if (!from || !to) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing from/to params' }) };
  }
  const url =
    'https://erddap.marine.ie/erddap/tabledap/IMI_TidePrediction_HighLow.json' +
    '?stationID,time,tide_time_category,Water_Level_ODMalin' +
    '&stationID=%22Galway%22' +
    '&time%3E=' + encodeURIComponent(from) +
    '&time%3C='  + encodeURIComponent(to) +
    '&orderBy(%22time%22)';
  try {
    const r = await fetch(url);
    const body = await r.text();
    return {
      statusCode: r.status,
      headers: { 'Content-Type': 'application/json' },
      body,
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: String(e) }) };
  }
};
