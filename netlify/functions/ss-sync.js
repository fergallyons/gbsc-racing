// Scheduled function (see netlify.toml) — keeps each Sail Scoring club's
// race list in step with Sail Scoring (_sssync.js, migration 079), so races
// the scorer adds, moves or deletes there reach the app's calendar without
// anyone pressing anything. The RO can also run it at once from the Results
// tile (ss-ro.js 'sync'), and every RO change made there runs it too.
//
// Like results-watch.js this walks every CLUB_CONFIG_<SLUG> env var; a club
// whose results source isn't Sail Scoring, or that isn't connected or
// hasn't applied 079, is skipped with a reason in the log.

const { envForSlug } = require('./_club');
const { clubDb } = require('./_sailscoring');
const { syncClub } = require('./_sssync');

async function processClub(slug) {
  const db = clubDb(slug);
  if (!db || !envForSlug(slug, 'SUPABASE_SERVICE_KEY')) return { slug, skipped: 'no service key' };
  const s = await db.req('settings?id=eq.club&select=features');
  const f = (s.ok && Array.isArray(s.body) && s.body[0] && s.body[0].features) || {};
  const src = f.resultsSource || (f.sailScoring ? 'sailscoring' : 'halsail');
  if (src !== 'sailscoring') return { slug, skipped: 'results source is ' + src };
  return { slug, ...(await syncClub(slug)) };
}

exports.handler = async () => {
  const slugs = Object.keys(process.env)
    .map(k => (k.match(/^CLUB_CONFIG_([A-Z0-9]+)$/) || [])[1])
    .filter(Boolean)
    .map(s => s.toLowerCase());
  const results = [];
  for (const slug of slugs) {
    try { results.push(await processClub(slug)); }
    catch (e) {
      console.error('[' + slug + '] ss-sync error:', e);
      results.push({ slug, error: String(e.message || e) });
    }
  }
  console.log('ss-sync run complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ ranAt: new Date().toISOString(), results }) };
};
