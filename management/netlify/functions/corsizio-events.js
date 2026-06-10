// Proxy for Corsizio REST API — keeps the API key server-side
// Set CORSIZIO_API_KEY in Netlify → Site settings → Environment variables.

const CORSIZIO_BASE = 'https://api.corsizio.com/v1';

exports.handler = async () => {
  const key = process.env.CORSIZIO_API_KEY;
  if (!key) {
    return json(500, { error: 'CORSIZIO_API_KEY environment variable is not set' });
  }

  try {
    const { raw, pages } = await fetchAllEvents(key);
    const events = raw.map(mapEvent);

    // _debug included so the browser console / panel shows exactly what came back
    const _debug = {
      pages,
      rawCount: raw.length,
      firstRawKeys: raw[0] ? Object.keys(raw[0]) : [],
      sampleTitle: raw[0]?.name || raw[0]?.title || null,
    };

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=3600',
      },
      body: JSON.stringify({ events, _debug }),
    };
  } catch (e) {
    console.error('Corsizio fetch error:', e.message);
    return json(502, { error: 'Failed to fetch from Corsizio: ' + e.message });
  }
};

async function fetchAllEvents(key) {
  const all = [];
  const pages = [];
  let page = 1;
  let more = true;

  while (more) {
    const url = `${CORSIZIO_BASE}/events?limit=100&page=${page}`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) {
      const body = await r.text().catch(() => '');
      throw new Error(`HTTP ${r.status} — ${body.slice(0, 200)}`);
    }
    const payload = await r.json();

    // Record ALL top-level keys + paging on first page so we can diagnose shape
    const pageInfo = {
      page,
      topLevelKeys: Object.keys(payload),
      paging: payload.paging || payload.meta || payload.pagination || null,
      // snapshot first element of every array-valued key
      arraySizes: Object.fromEntries(
        Object.entries(payload)
          .filter(([, v]) => Array.isArray(v))
          .map(([k, v]) => [k, v.length])
      ),
    };
    if (page === 1) pageInfo.firstPageSample = JSON.stringify(payload).slice(0, 500);
    pages.push(pageInfo);

    // Try every plausible key for the items array
    const items = Array.isArray(payload.data)   ? payload.data
      : Array.isArray(payload.events)           ? payload.events
      : Array.isArray(payload.items)            ? payload.items
      : Array.isArray(payload.results)          ? payload.results
      : Array.isArray(payload.list)             ? payload.list
      : Array.isArray(payload)                  ? payload
      : [];

    all.push(...items);

    const paging = payload.paging || payload.meta || payload.pagination || {};
    more = paging.more === true || paging.hasMore === true || paging.has_more === true;
    page++;
    if (page > 20) break;
  }

  return { raw: all, pages };
}

function mapEvent(ev) {
  const loc = ev.location;
  const locationStr = typeof loc === 'string'
    ? loc
    : loc?.name || loc?.address || loc?.city || null;

  const desc = ev.summary
    || stripHtml(ev.summaryHtml || ev.description || '');

  return {
    id:            ev.id || ev._id,
    title:         ev.name || ev.title || '(no title)',
    description:   desc || null,
    location:      locationStr,
    start_date:    ev.startDate || ev.start_date || ev.start || null,
    end_date:      ev.endDate   || ev.end_date   || ev.end  || null,
    all_day:       false,
    event_type:    'other',
    calendar_type: 'training',
    session_half:  'full',
    _source:       'corsizio',
    _corsizio_url: ev.pageUrl || ev.formUrl || ev.registrationUrl || null,
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
