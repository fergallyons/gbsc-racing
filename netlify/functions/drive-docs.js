// Netlify function: lists files from a club's public Google Drive folder.
// Folder preference order: an explicit ?folder= query param (the app sends
// this once it's extracted a folder ID straight out of settings.noticeboard_url
// client-side — see extractDriveFolderId() in app.js, which lets a club just
// paste whatever link Drive's "Get link" button gives them) — then
// DRIVE_FOLDER_ID_<SLUG> (club resolved via _club.js: hostname, or the
// ?club= the app sends) — then, for the DEFAULT club (GBSC) only, the bare
// DRIVE_FOLDER_ID var and the built-in folder. Any other club with no folder
// of its own gets an empty list — never GBSC's documents.
// Caches for 5 minutes at the CDN layer to avoid hammering the Drive API

const { resolveClubSlug, defaultClubSlug } = require('./_club');

const DEFAULT_FOLDER_ID = '1yA-fKQ_FBswOEMXdeOFIiZ7Oys_jRJ5Q'; // GBSC

// Drive IDs are always this charset — validated before interpolating into
// the Drive API query string below, since it's client-suppliable.
const DRIVE_ID_RE = /^[a-zA-Z0-9_-]{10,}$/;

exports.handler = async (event) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GOOGLE_DRIVE_API_KEY not configured' })
    };
  }
  const requestedFolder = event.queryStringParameters && event.queryStringParameters.folder;
  const explicitFolder = requestedFolder && DRIVE_ID_RE.test(requestedFolder) ? requestedFolder : null;
  const slug = resolveClubSlug(event);
  const FOLDER_ID = explicitFolder
    || process.env['DRIVE_FOLDER_ID_' + slug.toUpperCase()]
    || (slug === defaultClubSlug() ? (process.env.DRIVE_FOLDER_ID || DEFAULT_FOLDER_ID) : null);
  if (!FOLDER_ID) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' },
      body: '[]',
    };
  }

  try {
    const url =
      'https://www.googleapis.com/drive/v3/files' +
      `?q=%27${FOLDER_ID}%27+in+parents+and+trashed%3Dfalse` +
      `&key=${apiKey}` +
      '&fields=files(id,name,mimeType,modifiedTime)' +
      '&orderBy=name' +
      '&pageSize=50';

    const res = await fetch(url);
    if (!res.ok) {
      const txt = await res.text();
      return { statusCode: res.status, body: JSON.stringify({ error: txt }) };
    }

    const data = await res.json();
    const files = (data.files || []).filter(f =>
      f.mimeType === 'application/pdf' ||
      f.mimeType === 'application/vnd.google-apps.document'
    );

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'   // cache 5 min at CDN
      },
      body: JSON.stringify(files)
    };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message })
    };
  }
};
