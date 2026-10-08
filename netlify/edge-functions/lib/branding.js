// Shared by the edge functions (club-config.js, manifest.js,
// rewrite-club-links.js): a club's branding as set in Club Settings →
// Branding (settings.logo_url / favicon_url / primary_color / ro_color,
// writable since migration 070) takes precedence over the CLUB_CONFIG_<SLUG>
// env var, which is now only the starting value for a club that hasn't set
// its own. Resolving it here — before any page script runs — means the
// splash veil, header logo, favicon, PWA icon and colours all show the
// club's own choice on first paint, with no env-then-DB flash.
//
// Not a function itself: Netlify only treats top-level files (or
// name/index.js) in netlify/edge-functions as edge functions.

const TTL_MS = 60 * 1000;       // a change saved in Club Settings shows within a minute
const TIMEOUT_MS = 1500;        // never hold a page load on a slow database — env values win instead
const cache = new Map();        // sbUrl -> { at, branding } (per warm isolate)
const HEX = /^#[0-9a-f]{6}$/i;

/** The club's DB branding as { logoUrl, faviconUrl, primaryColor, roColor },
 *  each present only when set. {} when unreachable or unset. */
export async function dbBranding(club) {
  if (!club || !club.sbUrl || !club.sbKey) return {};
  const hit = cache.get(club.sbUrl);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.branding;
  let branding = {};
  try {
    const r = await fetch(
      club.sbUrl + '/rest/v1/settings?id=eq.club&select=logo_url,favicon_url,primary_color,ro_color',
      { headers: { apikey: club.sbKey, Authorization: 'Bearer ' + club.sbKey }, signal: AbortSignal.timeout(TIMEOUT_MS) },
    );
    if (r.ok) {
      const row = (await r.json())[0] || {};
      // Full URLs (uploads) or site paths — GBSC's row holds '/logos/gbsc.jpg'
      // and 'logos/gbsc.jpg' (no leading slash), both meaning the repo's logos/
      const url = (v) => {
        v = typeof v === 'string' ? v.trim() : '';
        if (/^https?:\/\//i.test(v) || v.startsWith('/')) return v;
        return /^[\w.-]+\//.test(v) ? '/' + v : '';
      };
      if (url(row.logo_url)) branding.logoUrl = url(row.logo_url);
      if (url(row.favicon_url)) branding.faviconUrl = url(row.favicon_url);
      if (HEX.test(row.primary_color || '')) branding.primaryColor = row.primary_color;
      if (HEX.test(row.ro_color || '')) branding.roColor = row.ro_color;
    }
  } catch (e) {
    return hit ? hit.branding : {}; // timeout/network: keep the last known value rather than flapping
  }
  cache.set(club.sbUrl, { at: Date.now(), branding });
  return branding;
}

const LOGO_ALIASES = ['logoUrl', 'logoURL', 'logourl', 'logo_url', 'logo'];
const FAVICON_ALIASES = ['faviconUrl', 'faviconurl'];

/** A copy of the env club config with DB branding laid over it. A logo set
 *  in the app without its own favicon also replaces the env favicon — an old
 *  env favicon beside a newly uploaded logo would be the wrong club mark. */
export function withBranding(club, b) {
  const out = { ...club };
  // What the env var alone says — Club Settings' "Use default" restores these
  out.envBranding = {
    logoUrl: LOGO_ALIASES.map((k) => club[k]).find(Boolean) || '',
    faviconUrl: FAVICON_ALIASES.map((k) => club[k]).find(Boolean) || '',
    primaryColor: club.primaryColor || '',
    roColor: club.roColor || '',
  };
  if (b.logoUrl) {
    LOGO_ALIASES.forEach((k) => delete out[k]);
    out.logoUrl = b.logoUrl;
    if (!b.faviconUrl) FAVICON_ALIASES.forEach((k) => delete out[k]);
  }
  if (b.faviconUrl) {
    FAVICON_ALIASES.forEach((k) => delete out[k]);
    out.faviconUrl = b.faviconUrl;
  }
  if (b.primaryColor) out.primaryColor = b.primaryColor;
  if (b.roColor) out.roColor = b.roColor;
  return out;
}

/** The icon to use for favicon / PWA manifest: favicon, else logo. */
export function iconUrl(club) {
  return club.faviconUrl || club.faviconurl || club.logoUrl || club.logoURL || club.logourl || club.logo_url || club.logo || '';
}
