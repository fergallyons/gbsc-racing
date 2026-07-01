// Netlify function: lists files from a club's public Google Drive folder.
// Club is resolved from the request hostname via HOSTNAME_MAP (see _club.js),
// then its folder is read from DRIVE_FOLDER_ID_<SLUG>, falling back to the
// bare DRIVE_FOLDER_ID var (GBSC's folder, kept as the default for
// backwards compatibility).
// Caches for 5 minutes at the CDN layer to avoid hammering the Drive API

const { clubEnv } = require('./_club');

const DEFAULT_FOLDER_ID = '1yA-fKQ_FBswOEMXdeOFIiZ7Oys_jRJ5Q'; // GBSC

exports.handler = async (event) => {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'GOOGLE_DRIVE_API_KEY not configured' })
    };
  }
  const FOLDER_ID = clubEnv(event, 'DRIVE_FOLDER_ID') || DEFAULT_FOLDER_ID;

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
