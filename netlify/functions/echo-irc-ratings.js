// Netlify function: current ECHO/IRC ratings, filtered to one club.
//
// Source: https://www.sailing.ie/Racing/Racing-Services/Echo-IRC-Ratings
// There's no public API for this. The page renders a hidden table
// (id="exceltable", class="d-none") holding every currently-rated boat
// nationally, unpaginated — it's the source the page's own "Copy Excel
// CSV" button reads from. We fetch the HTML server-side and parse that
// table directly. Each <td> carries a data-title attribute naming its
// column, so parsing is keyed off that rather than column position.
//
// Request:  GET ?club=<name as it appears in Irish Sailing's "Main Club"
//                column, e.g. "Galway Bay Sailing Club">
// Response: 200 { boats: [{sailNo, boatName, model, owner, club, echo,
//                  echoType, echoCertDate, ircCertNo, ircTCC,
//                  ircCertDate, ircNonSpinTCC}], sourceUrl, fetchedAt }
//           502 { error } — source site unreachable or page shape changed

const SOURCE_URL = 'https://www.sailing.ie/Racing/Racing-Services/Echo-IRC-Ratings';

function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function parseRatingsTable(html) {
  const tableMatch = html.match(/<table[^>]*id="exceltable"[^>]*>([\s\S]*?)<\/table>/);
  if (!tableMatch) return [];
  const rowsHtml = tableMatch[1].match(/<tr>[\s\S]*?<\/tr>/g) || [];
  return rowsHtml.map((rowHtml) => {
    const row = {};
    const cellRe = /<td\s+data-title="([^"]*)"[^>]*>([\s\S]*?)<\/td>/g;
    let m;
    while ((m = cellRe.exec(rowHtml))) {
      row[decodeEntities(m[1])] = decodeEntities(m[2].replace(/<[^>]+>/g, ''));
    }
    return row;
  }).filter((r) => r['Boat Name']);
}

exports.handler = async (event) => {
  const club = ((event.queryStringParameters || {}).club || '').trim();

  try {
    const res = await fetch(SOURCE_URL);
    if (!res.ok) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Irish Sailing site returned ' + res.status }) };
    }
    const html = await res.text();
    const rows = parseRatingsTable(html);
    if (!rows.length) {
      return { statusCode: 502, body: JSON.stringify({ error: 'Ratings table not found — page layout may have changed' }) };
    }

    const filtered = club
      ? rows.filter((r) => (r['Main Club'] || '').trim().toLowerCase() === club.toLowerCase())
      : rows;

    // The ECHO column header is year-specific, e.g. "2026 ECHO" — match by pattern.
    const echoKey = Object.keys(rows[0]).find((k) => /^\d{4}\s*ECHO$/i.test(k)) || '';

    const boats = filtered.map((r) => ({
      sailNo: r['Sail Number'] || '',
      boatName: r['Boat Name'] || '',
      model: r['Model'] || '',
      owner: r['Owner'] || '',
      club: r['Main Club'] || '',
      echo: r[echoKey] || '',
      echoType: r['Spinnaker/Non-Spinnaker'] || '',
      echoCertDate: r['ECHO Cert Date'] || '',
      ircCertNo: r['IRC Cert Number'] || '',
      ircTCC: r['IRC TCC'] || '',
      ircCertDate: r['Certificate Date'] || '',
      ircNonSpinTCC: r['IRC Non Spinnaker TCC'] || '',
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        // Source updates infrequently (Irish Sailing shows a "last updated" date, not live)
        'Cache-Control': 'public, max-age=21600',
      },
      body: JSON.stringify({ boats, sourceUrl: SOURCE_URL, fetchedAt: new Date().toISOString() }),
    };
  } catch (e) {
    return { statusCode: 502, body: JSON.stringify({ error: e.message }) };
  }
};
