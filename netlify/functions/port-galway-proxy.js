// Netlify serverless function: Port of Galway weather-station API proxy.
// A direct browser fetch() to weather.theportofgalway.ie from this app's
// real origin returns HTTP 503 with an empty body, consistently — an
// origin/referer-based block, since the identical request succeeds
// server-side (no Origin header) or from the dashboard's own origin
// (confirmed directly, 2026-08-14). Same reasoning as
// met-eireann-proxy.js/halsail-proxy.js: relay server-side, add CORS.
//
// type=weather, type=tide and type=buoy are implemented. type=tide is a
// live sensor reading (water_level_lad/_id, updates ~every 5min), a
// different thing from this app's own fetchTideData() (IMI ERDDAP predicted
// High/Low extremes) — complementary, not a replacement. type=buoy (wave
// height) was originally left out as too unreliable (observed empty for a
// full hour-window at the time) — re-checked live 2026-09-16 and it's now
// reporting on a normal ~30min cadence with only the occasional multi-hour
// overnight gap, the same kind of gap the weather feed already tolerates —
// so fetchLivePortWeather() (app.js) applies it the same staleness
// tolerance rather than trusting it unconditionally.

exports.handler = async (event) => {
  const { type, hours } = event.queryStringParameters || {};
  const upstreamType = type || 'weather';
  if (upstreamType !== 'weather' && upstreamType !== 'tide' && upstreamType !== 'buoy') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Unsupported type — only "weather", "tide" or "buoy" is implemented' }) };
  }
  const hrs = Math.max(1, Math.min(parseInt(hours, 10) || 1, 24));
  const url = 'https://weather.theportofgalway.ie/api/dashboard/' + upstreamType + '?hours=' + hrs;

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
