// Scheduled function (see netlify.toml) — keeps each club's Sail Scoring
// connection alive through quiet spells. A grant ends if RaceOps goes 180
// days without renewing its refresh token (docs/public-api.md, "Getting
// access"), and over an off-season nothing else would renew it. So once a
// week, for every club that's connected, renew if the refresh token is more
// than 30 days old.
//
// Renewal goes through getAccessToken() in _sailscoring.js, the same
// one-at-a-time path every other function uses (migration 078's lock), so
// this can't race a renewal triggered by the app.
//
// Like results-watch.js this walks every CLUB_CONFIG_<SLUG> env var itself;
// a club without a service key, migration 076/078 or a connection is
// skipped with a reason in the log.

const { readConnection, hasRefreshLock, getAccessToken } = require('./_sailscoring');

const RENEW_AFTER_MS = 30 * 24 * 3600 * 1000;

async function processClub(slug) {
  let conn;
  try { conn = await readConnection(slug); }
  catch (e) { return { slug, skipped: e.message }; }
  if (!conn) return { slug, skipped: 'not connected' };
  if (conn.status !== 'connected') return { slug, skipped: 'connection ' + conn.status };
  if (!(await hasRefreshLock(slug))) return { slug, skipped: 'migration 078 not applied' };
  const last = Date.parse(conn.refreshed_at || conn.connected_at || 0) || 0;
  if (Date.now() - last < RENEW_AFTER_MS) return { slug, fresh: conn.refreshed_at || conn.connected_at };
  const t = await getAccessToken(slug, { force: true, staleToken: conn.access_token });
  return t.token ? { slug, renewed: true } : { slug, error: t.error };
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
      console.error('[' + slug + '] ss-keepalive error:', e);
      results.push({ slug, error: String(e.message || e) });
    }
  }
  console.log('ss-keepalive run complete:', JSON.stringify(results));
  return { statusCode: 200, body: JSON.stringify({ ranAt: new Date().toISOString(), results }) };
};
