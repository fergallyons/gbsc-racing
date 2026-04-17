exports.handler = async (event) => {
  const p = event.queryStringParameters || {};
  const lat = parseFloat(p.lat) || 53.2744; // fallback: Galway Bay
  const lng = parseFloat(p.lng) || -9.0490;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
    '&current=wind_speed_10m,wind_direction_10m,wind_gusts_10m&wind_speed_unit=kn&timezone=auto';
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
