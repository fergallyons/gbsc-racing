// Proxies GET /api/v2.0/races from estela.co using the club API key.
// The key is stored as the ESTELA_API_KEY Netlify environment variable —
// it is never exposed to the client.
//
// Setup:
//   Netlify → Site configuration → Environment variables → Add variable:
//   Key:   ESTELA_API_KEY
//   Value: (paste key from https://admin.estela.co/edit/integrations)
//
// Returns:
//   200  { races: [ { id, name, link, start_at, end_at } ] }
//   503  { error: "ESTELA_API_KEY not configured" }   — key not yet added
//   502  { error: "…" }                               — eStela unreachable

exports.handler = async () => {
  const apiKey = process.env.ESTELA_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 503,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'ESTELA_API_KEY not configured' }),
    };
  }

  try {
    const r = await fetch('https://estela.co/api/v2.0/races', {
      headers: { Authorization: 'Bearer ' + apiKey },
    });
    if (!r.ok) {
      const txt = await r.text();
      return {
        statusCode: r.status,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'eStela returned ' + r.status + ': ' + txt.slice(0, 200) }),
      };
    }
    const data = await r.json();
    // Normalise to a minimal shape — insulate the app from schema changes
    const races = (Array.isArray(data) ? data : (data.results || data.races || []))
      .map(r => ({
        id:       r.id,
        name:     r.name || r.title || '',
        link:     r.link || r.url || ('https://estela.co/en/tracking-race/' + r.id + '/' + slug(r.name || '')),
        start_at: r.start_at || r.start || null,
        end_at:   r.end_at   || r.end   || null,
      }))
      .sort((a, b) => (b.start_at || '').localeCompare(a.start_at || ''));
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ races }),
    };
  } catch (e) {
    return {
      statusCode: 502,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: String(e) }),
    };
  }
};

function slug(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
