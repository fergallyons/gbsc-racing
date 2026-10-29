// Netlify function: ORC certificates for one country, in their simplest
// form — the single-number ratings a club can score with by hand.
//
// Source: ORC's public certificate download (DownRMS), the feed Sail
// Scoring imports from too. data.orc.org/public/WPub.dll is retired on
// 31 January 2027; after that ORC serves the same feed only to registered
// applications at sas.orc.org with a personal API key (ORC_API_KEY, set
// on Netlify — app-wide, issued to the application by ORC, never sent to
// the browser or logged). Without a key the old address is used.
//
// Request:  GET ?country=IRL   (ORC national authority code; default IRL)
// Response: 200 { certs: [{ sailNo, yachtName, class, club, certType,
//                 division, issueDate, gph, totInshore, totOffshore,
//                 refNo }], vppYear, fetchedAt }
//           502 { error } — ORC unreachable or the feed changed shape
//
//   gph          General Purpose Handicap, seconds per mile (time on distance)
//   totInshore   time-on-time single number for inshore/windward-leeward racing
//   totOffshore  time-on-time single number for offshore/coastal racing
//
// ORC asks clients to cache — once a day is plenty — so replies are cached
// at the CDN for a day, and per warm function instance too.

const TTL_MS = 24 * 3600 * 1000;
const cache = {}; // country -> { at, body }

function feedUrl(country, year) {
  const key = process.env.ORC_API_KEY;
  const q = 'CountryId=' + encodeURIComponent(country) + '&Family=ORC&VPPYear=' + year + '&ext=json';
  return key
    ? 'https://sas.orc.org/api/' + encodeURIComponent(key) + '/DownRMS?' + q
    : 'https://data.orc.org/public/WPub.dll?action=DownRMS&' + q;
}

async function fetchYear(country, year) {
  const r = await fetch(feedUrl(country, year), { headers: { Accept: 'application/json' } });
  if (!r.ok) throw new Error('ORC answered HTTP ' + r.status); // never echo the URL: it can hold the key
  const text = (await r.text()).replace(/^﻿/, '');
  let d;
  try { d = JSON.parse(text); } catch (e) { throw new Error('ORC sent something that isn\'t JSON'); }
  if (!d || !Array.isArray(d.rms)) throw new Error('ORC\'s certificate list has changed shape');
  return d.rms;
}

const num = v => (typeof v === 'number' && isFinite(v) ? v : null);

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const country = /^[A-Z]{3}$/.test(q.country || '') ? q.country : 'IRL';
  const hit = cache[country];
  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600, s-maxage=86400' };
  if (hit && Date.now() - hit.at < TTL_MS) return { statusCode: 200, headers, body: hit.body };
  try {
    // This year's VPP; early in a year, before any are issued, last year's
    let year = new Date().getUTCFullYear();
    let rows = await fetchYear(country, year);
    if (!rows.length) { year -= 1; rows = await fetchYear(country, year); }
    const certs = rows.filter(c => c && c.SailNo).map(c => ({
      sailNo: c.SailNo, yachtName: c.YachtName || '', class: c.Class || '', club: c.Club || '',
      certType: c.C_Type || '', division: c.Division || '', issueDate: c.IssueDate || null,
      gph: num(c.GPH), totInshore: num(c.TMF_Inshore), totOffshore: num(c.TMF_Offshore),
      refNo: c.RefNo || null,
    }));
    const body = JSON.stringify({ certs, vppYear: year, fetchedAt: new Date().toISOString() });
    cache[country] = { at: Date.now(), body };
    return { statusCode: 200, headers, body };
  } catch (e) {
    console.warn('orc-ratings ' + country + ': ' + e.message);
    return { statusCode: 502, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ error: 'Could not load ORC certificates — ' + e.message }) };
  }
};
