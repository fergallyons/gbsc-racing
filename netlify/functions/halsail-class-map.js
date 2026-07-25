// Netlify function: discovers every real scored series a HalSail club has,
// beyond what GetSchedule exposes.
//
// GetSchedule only returns scheduling-level groupings (which committee boat/
// night a class starts under) — for a club like GBSC that happens to equal
// the real scoring series (one class, "Cru - E"), but for a club like DBSC
// it does NOT: "Cruisers 0" is one scheduling group that's actually scored
// as three separate real series (Echo Sat / Echo Thu / IRC), none of which
// GetSchedule ever mentions. Those only show up in the results website's
// rendered HTML — this function fetches and parses that page.
//
// Two-step fetch:
//   1. GetSchedule/<club> — reused only to get ONE valid SeryID to bootstrap
//      from (the class list is global to the club, any valid SeryID works
//      as an entry point into /Result/Public/<seryId>).
//   2. /Result/Public/<thatSeryId> — the rendered results page embeds the
//      FULL class catalog: an outer <select id="ddRacingClasses"> (ClassID
//      + name, e.g. "Cruisers 0 IRC" -> 31856), each with a nested hidden
//      <select id="dd<classId>" class="ddsery"> listing that class's SeryID
//      per season. Confirmed live: the outer list's ClassID/name pairs are
//      stable across requests; the nested dropdown's OPTION TEXT is not
//      (the same SeryID showed as "Thursday Overall" fetched directly vs.
//      a proper class name via the browser session) — so only the nested
//      dropdown's numeric SeryID is trusted here, never its label. The
//      authoritative name comes back from GetSeriesResult itself instead.
//
// Request:  GET ?club=<HalSail club ID>
// Response: 200 { classes: [{classId, seryId, name}], fetchedAt }
//           502 { error }

const HAL_API = 'https://halsail.com/HalApi';
const HAL_RESULT = 'https://halsail.com/Result/Public';

function extractOuterClasses(html) {
  const m = html.match(/<select id="ddRacingClasses"[^>]*>([\s\S]*?)<\/select>/);
  if (!m) return [];
  const optRe = /<option value="(\d+)"[^>]*>\s*([^<]+?)\s*<\/option>/g;
  const out = [];
  let om;
  while ((om = optRe.exec(m[1]))) {
    out.push({ classId: om[1], name: om[2].trim() });
  }
  return out;
}

// Nested <select id=dd31856 class="ddsery" ...> — grab the first (current
// season, HalSail lists most-recent-first) numeric option value only.
function extractCurrentSeryId(html, classId) {
  const re = new RegExp('id=dd' + classId + '[^>]*>([\\s\\S]*?)<\\/select>');
  const m = html.match(re);
  if (!m) return null;
  const optM = m[1].match(/<option value="(\d+)"/);
  return optM ? optM[1] : null;
}

exports.handler = async (event) => {
  const club = ((event.queryStringParameters || {}).club || '').trim();
  if (!club) return json(400, { error: 'club query param required' });

  try {
    const scheduleRes = await fetch(HAL_API + '/GetSchedule/' + club);
    if (!scheduleRes.ok) return json(502, { error: 'GetSchedule failed: HTTP ' + scheduleRes.status });
    const schedule = await scheduleRes.json();
    if (!Array.isArray(schedule) || !schedule.length || !schedule[0].SeryID) {
      return json(502, { error: 'GetSchedule returned no usable entries' });
    }
    const bootstrapSeryId = schedule[0].SeryID;

    const pageRes = await fetch(HAL_RESULT + '/' + bootstrapSeryId);
    if (!pageRes.ok) return json(502, { error: 'Result page fetch failed: HTTP ' + pageRes.status });
    const html = await pageRes.text();

    const outerClasses = extractOuterClasses(html);
    if (!outerClasses.length) return json(502, { error: 'Could not find class list in results page' });

    const classes = outerClasses.map((c) => ({
      classId: c.classId,
      name: c.name,
      seryId: extractCurrentSeryId(html, c.classId),
    })).filter((c) => c.seryId);

    return json(200, { classes, fetchedAt: new Date().toISOString() });
  } catch (e) {
    return json(502, { error: e.message });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
