// Invites a new hub user via Supabase Auth's admin API — creates their auth
// account and emails them a link to set their own password. This is the
// piece that "Add Login" alone can't do: adding a row to hub_members only
// authorises an email, it doesn't create anything a person can sign in
// with. This function does that part.
//
// The service_role key stays server-side only — never sent to the browser.
// The Supabase project URL is read from env too (not trusted from the
// request body), so a tampered client request can't redirect the secret
// key to some other host.
//
// Setup: Netlify → Site configuration → Environment variables → add:
//   SUPABASE_URL                — the hub's Supabase project URL
//                                 (same value as "sbUrl" in HUB_CONFIG_GBSC)
//   SUPABASE_SERVICE_ROLE_KEY   — the hub's Supabase service_role secret
//                                 (Supabase dashboard → Project Settings →
//                                 API → Project API keys → service_role —
//                                 NOT the anon/public key)
//
// Request (POST, JSON):
//   { "email": "person@example.com", "redirectTo": "https://..." }  <- redirectTo optional
//
// Response:
//   200 { ok: true }
//   400 { error: "validation message" }
//   500 { error: "not configured" }
//   502 { error: "Supabase error message" }   (e.g. "User already registered")

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return json(500, { error: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not configured' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const email = String(body.email || '').trim().toLowerCase();
  if (!email || !email.includes('@')) {
    return json(400, { error: 'A valid email is required' });
  }

  const qs = body.redirectTo ? '?redirect_to=' + encodeURIComponent(body.redirectTo) : '';

  try {
    const res = await fetch(`${url}/auth/v1/invite${qs}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': 'Bearer ' + key,
      },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Supabase returns 422 "User already registered" if they already have
      // an account — surfaced as-is, it's clear enough on its own.
      return json(res.status, { error: data.msg || data.error_description || data.error || ('Invite failed (HTTP ' + res.status + ')') });
    }
    return json(200, { ok: true });
  } catch (e) {
    console.error('invite-hub-user fetch failed', e);
    return json(502, { error: String(e.message || e) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
