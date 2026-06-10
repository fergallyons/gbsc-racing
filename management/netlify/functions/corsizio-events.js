// Proxy for Corsizio REST API — keeps the API key server-side
// Fetches all events (handles pagination) and maps to hub_events shape.
//
// Set CORSIZIO_API_KEY in Netlify → Site settings → Environment variables.
//
// Response is CDN-cached for 5 min with stale-while-revalidate for 1 hour,
// so after the first hit it's served instantly from the edge.

const CORSIZIO_BASE = 'https://api.corsizio.com/v1';

exports.handler = async () => {
  const key = process.env.CORSIZIO_API_KEY;
  if (!key) {
    return json(500, { error: 'CORSIZIO_API_KEY environment variable is not set' });
  }

  try {
    const raw = await fetchAllEvents(key);
    const events = raw.map(mapEvent);
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // CDN caches for 5 min; serves stale up to 1 h while revalidating
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
      body: JSON.stringify({ events }),
    };
  } catch (e) {
    console.error('Corsizio fetch error:', e.message);
    return json(502, { error: 'Failed to fetch from Corsizio: ' + e.message });
  }
};

async function fetchAllEvents(key) {
  const all = [];
  let page = 1;
  let more = true;

  while (more) {
    const url = `${CORSIZIO_BASE}/events?limit=100&page=${page}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} — ${body.slice(0, 120)}`);
    }
    const payload = await r.json();
    const items = Array.isArray(payload.data) ? payload.data : [];
    all.push(...items);
    more = payload.paging?.more === true;
    page++;
    if (page > 20) break; // safety valve
  }

  return all;
}

function mapEvent(ev) {
  const loc = ev.location;
  const locationStr = typeof loc === 'string'
    ? loc
    : loc?.name || loc?.address || null;

  return {
    id:            ev._id,
    title:         ev.name || '(no title)',
    description:   stripHtml(ev.description || ''),
    location:      locationStr,
    start_date:    ev.startDate,
    end_date:      ev.endDate || null,
    all_day:       false,
    event_type:    'other',
    calendar_type: 'training',
    session_half:  'full',
    _source:       'corsizio',
    _corsizio_url: ev.registrationUrl || null,
  };
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null;
}

function json(status, body) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
