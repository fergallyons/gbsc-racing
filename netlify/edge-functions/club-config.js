/**
 * Netlify Edge Function: /club-config.js
 *
 * Serves a tiny JS snippet that sets window.CLUB with all club-specific
 * configuration. The app loads this before app.js so every constant is
 * available at startup — no fetch needed.
 *
 * ── How it works ────────────────────────────────────────────────────────
 * 1. Reads the request hostname (e.g. "gbsc.racing" or "localhost").
 * 2. Looks up the club slug from the HOSTNAME_MAP env var (JSON object).
 * 3. Reads the club's full config from CLUB_CONFIG_<SLUG> (JSON string).
 * 4. Returns:  window.CLUB = { ... };
 *
 * ── Netlify env vars to set ─────────────────────────────────────────────
 *
 *  HOSTNAME_MAP  (JSON)
 *    Maps every hostname that serves this app to its club slug.
 *    Also support "default" key as fallback.
 *    Example:
 *      {"gbscracing.netlify.app":"gbsc","gbsc.racing":"gbsc","localhost":"gbsc","default":"gbsc"}
 *
 *  CLUB_CONFIG_GBSC  (JSON string — one var per club, slug uppercased)
 *    {
 *      "name":          "Galway Bay Sailing Club",
 *      "short":         "GBSC",
 *      "slug":          "gbsc",
 *      "sbUrl":         "https://esqjcmwfnzkolwxfbcro.supabase.co",
 *      "sbKey":         "eyJ...",
 *      "roPin":         "2026",
 *      "startLat":      53.242814,
 *      "startLng":      -8.976913,
 *      "halClub":       3725,
 *      "vapidPublicKey":"BAk...",
 *      "fees":          {"full":4,"crew":4,"visitor":10,"student":5,"kid":0},
 *      "visitorMax":    6,
 *      "crewMaxYrs":    2,
 *      "sponsors": [
 *        {"match":"galway.?maritime","name":"Galway Maritime","tagline":"Marine Chandlery",
 *         "logo":"https://...","url":"https://galwaymaritime.com"},
 *        {"match":"mcswiggans","name":"McSwiggans","tagline":"Steak & Seafood Restaurant",
 *         "logo":"https://...","url":"https://mcswiggans.ie"}
 *      ],
 *      "features": {
 *        "feeModel":    "per-race",   // "per-race" (default/GBSC) | "per-series" (RCYC)
 *        "declaration": false,        // true = skipper must sign safety declaration each season
 *        "courseCard":  false,        // true = RO picks from predefined course card (RCYC)
 *        "hide": [                    // tiles/features to suppress from the UI (omit = show all)
 *          "startTimer",             //   RO: voice sail start timer (GBSC-specific)
 *          "halsail",                //   RO: Halsail finisher recording (GBSC-specific)
 *          "paymentReport",          //   RO: per-race PDF payment report
 *          "marksManager",           //   RO: marks toggle & add panel
 *          "publishResults",         //   RO: results embargo / publish toggle
 *          "usageStats",             //   RO: session & login stats
 *          "feeStatements",          //   RO + Skipper: per-boat fee history
 *          "feeHistory",             //   Skipper only: fee history tile
 *          "selfPay",                //   Public: crew self-pay tile
 *          "weather",                //   Public: race weather tile
 *          "calendar",               //   Public: race calendar tile
 *          "documents",              //   Public: sailing instructions tile
 *          "results"                 //   Public: results / standings tile
 *        ]
 *      },
 *      "declarationDocs": {           // only used when features.declaration = true
 *        "sis":    "https://www.royalcork.com/notice-board/",
 *        "rrs":    "https://www.racingrulesofsailing.org/",
 *        "safety": "https://www.royalcork.com/notice-board/"
 *      }
 *    }
 *    Note: "match" strings are compiled to RegExp(/match/i) in app.js.
 *    Note: "features" is optional — omit for default GBSC behaviour.
 *
 * ── Adding a new club ────────────────────────────────────────────────────
 *  1. Add entries to HOSTNAME_MAP for the new club's domain(s).
 *  2. Add a CLUB_CONFIG_<SLUG> env var with the club's config JSON.
 *  3. Redeploy (env var changes trigger a new deploy on Netlify).
 */

export default async function handler(request) {
  const host = (request.headers.get('host') || '').split(':')[0]; // strip port

  // ── 1. Resolve club slug ───────────────────────────────────────────
  // ?club=<slug> query param overrides hostname lookup — for testing only.
  // Remove this override in production by unsetting ALLOW_CLUB_OVERRIDE.
  const url = new URL(request.url);
  const overrideSlug = url.searchParams.get('club');
  const allowOverride = Deno.env.get('ALLOW_CLUB_OVERRIDE') !== 'false';

  let hostnameMap = {};
  try {
    hostnameMap = JSON.parse(Deno.env.get('HOSTNAME_MAP') || '{}');
  } catch (e) {
    console.error('club-config: bad HOSTNAME_MAP JSON', e);
  }
  const slug = (allowOverride && overrideSlug)
    ? overrideSlug.toLowerCase().replace(/[^a-z0-9]/g, '')
    : hostnameMap[host] || hostnameMap['default'] || 'gbsc';

  // ── 2. Load club config ────────────────────────────────────────────
  const envKey = 'CLUB_CONFIG_' + slug.toUpperCase();
  const configJson = Deno.env.get(envKey);

  if (!configJson) {
    // Config not found — return an empty CLUB so app.js can show a
    // "misconfigured" state rather than crashing silently.
    console.warn(`club-config: no env var ${envKey} for host "${host}" (slug "${slug}")`);
    return new Response('window.CLUB=null;', {
      headers: {
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-store',
      },
    });
  }

  let config;
  try {
    config = JSON.parse(configJson);
  } catch (e) {
    console.error(`club-config: invalid JSON in ${envKey}`, e);
    return new Response('window.CLUB=null;', {
      headers: { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' },
    });
  }

  // ── 3. Serve as JS ─────────────────────────────────────────────────
  return new Response(`window.CLUB=${JSON.stringify(config)};`, {
    headers: {
      'Content-Type': 'application/javascript',
      // Never CDN-cache — config can change on redeploy
      'Cache-Control': 'public, max-age=0, must-revalidate',
    },
  });
}

export const config = { path: '/club-config.js' };
