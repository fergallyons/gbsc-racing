// Netlify serverless function: keyed, read-only access to Sail Scoring's API.
//
// Deliberately NOT a general proxy — only the fixed operations below exist,
// all GETs, and responses are trimmed to what the app needs (the workspace
// identity call also returns the key owner's email, which never leaves here).
// The club's key is added server-side by _sailscoring.js.
//
//   ?op=status        { configured, ok, status, workspace, role }
//                     — checks the saved key without revealing it
//   ?op=series-files  { configured, ok, status, series: [{ seriesId, title,
//                     year, publishedAt, archived, pageUrl, dataUrl }] }
//                     — every published, non-orphaned series in the workspace
//                     with its public .sailscoring.json address, newest first
//
// `configured: false` means no key is saved: the app then falls back to the
// public-file path (workspace index / pasted addresses) exactly as before.

const { apiGet, hostSlug } = require('./_sailscoring');

const LIST_TTL_MS = 5 * 60 * 1000; // spare Sail Scoring's rate limit: one listing per club per 5 min per instance
const MAX_SERIES = 30;
const CONCURRENCY = 4;
const listCache = {}; // slug -> { at, payload }

function reply(statusCode, payload) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(payload),
  };
}

function apiError(r) {
  if (r.status === 401 || r.status === 403) return 'Sail Scoring rejected the API key';
  if (r.status === 429) return 'Sail Scoring is rate-limiting requests — try again shortly';
  const msg = r.body && (r.body.error && (r.body.error.message || r.body.error)) || r.body && r.body.message;
  return 'Sail Scoring API error ' + r.status + (typeof msg === 'string' ? ' — ' + msg.slice(0, 120) : '');
}

async function opStatus(event) {
  const r = await apiGet(event, '/workspace');
  if (r.status === 0) return reply(200, { configured: false, ok: false });
  if (r.status < 200 || r.status >= 300) return reply(200, { configured: true, ok: false, status: r.status, error: apiError(r) });
  const b = r.body || {};
  return reply(200, {
    configured: true, ok: true, status: r.status,
    workspace: typeof b.workspaceSlug === 'string' ? b.workspaceSlug : '',
    role: typeof b.role === 'string' ? b.role : '',
  });
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i], i); }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function opSeriesFiles(event) {
  const slug = hostSlug(event);
  const hit = listCache[slug];
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return reply(200, hit.payload);

  const r = await apiGet(event, '/published');
  if (r.status === 0) return reply(200, { configured: false, ok: false, series: [] });
  if (r.status < 200 || r.status >= 300) return reply(200, { configured: true, ok: false, status: r.status, error: apiError(r), series: [] });

  const pubs = (Array.isArray(r.body) ? r.body : [])
    .filter(p => p && typeof p.seriesId === 'string' && p.seriesId && !p.orphaned)
    .sort((a, b) => (b.publishedAt || 0) - (a.publishedAt || 0))
    .slice(0, MAX_SERIES);

  // The listing has no data-file address; each series' publish status does
  const series = (await mapLimit(pubs, CONCURRENCY, async p => {
    let dataUrl = null;
    try {
      const s = await apiGet(event, '/series/' + encodeURIComponent(p.seriesId) + '/publish');
      const pub = s.status >= 200 && s.status < 300 && s.body && s.body.published;
      if (pub && typeof pub.dataUrl === 'string') dataUrl = pub.dataUrl;
    } catch (e) { /* leave this one without a data file */ }
    return {
      seriesId: p.seriesId,
      title: typeof p.title === 'string' ? p.title : '',
      year: typeof p.year === 'number' ? p.year : null,
      publishedAt: typeof p.publishedAt === 'number' ? p.publishedAt : null,
      archived: !!p.archived,
      pageUrl: typeof p.url === 'string' ? p.url : '',
      dataUrl,
    };
  })).filter(s => s.dataUrl);

  const payload = { configured: true, ok: true, status: r.status, series };
  listCache[slug] = { at: Date.now(), payload };
  return reply(200, payload);
}

exports.handler = async (event) => {
  if (event.httpMethod && event.httpMethod !== 'GET') return reply(405, { error: 'GET only' });
  const op = (event.queryStringParameters || {}).op || '';
  try {
    if (op === 'status') return await opStatus(event);
    if (op === 'series-files') return await opSeriesFiles(event);
    return reply(400, { error: 'Unknown op' });
  } catch (e) {
    return reply(502, { error: 'Could not reach Sail Scoring: ' + e.message });
  }
};
