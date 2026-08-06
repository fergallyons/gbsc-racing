// Netlify function: lists files from a club's public Google Drive folder.
// Folder preference order: an explicit ?folder= query param (the app sends
// this once it's extracted a folder ID straight out of settings.noticeboard_url
// client-side — see extractDriveFolderId() in app.js, which lets a club just
// paste whatever link Drive's "Get link" button gives them) — then
// DRIVE_FOLDER_ID_<SLUG> (club resolved from hostname via HOSTNAME_MAP, see
// _club.js) — then the bare DRIVE_FOLDER_ID var (GBSC's folder, kept as the
// default for backwards compatibility).
// Caches for 5 minutes at the CDN layer to avoid hammering the Drive API

const { clubEnv } = require('./_club');

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
  const FOLDER_ID = explicitFolder || clubEnv(event, 'DRIVE_FOLDER_ID') || DEFAULT_FOLDER_ID;

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
