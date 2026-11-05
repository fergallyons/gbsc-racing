// Stripe webhook — records race-fee and RNLI payments server-side, so a
// payment is saved even when the payer's browser never makes it back to the
// app (a payment link opened in a new tab, Revolut Pay handing back to a
// different browser, the payer closing the tab on Stripe's success page…).
//
// The in-app return handler (handleStripeReturn() in app.js) still records
// the payment as a fast path when the browser does come back; every write
// here is idempotent against it (unique constraints / payment_ref checks), so
// whichever lands second is a no-op.
//
// Setup (per club):
//   Stripe dashboard → Developers → Webhooks → Add endpoint
//     URL:    https://<club host>/.netlify/functions/stripe-webhook?club=<slug>
//     Events: checkout.session.completed
//             checkout.session.async_payment_succeeded
//   The endpoint's "Signing secret" (whsec_…) goes in Club Settings →
//     🔑 Stripe Webhook Signing Secret — stored write-only in the club's own
//     settings.stripe_webhook_secret (migration 081, PIN-gated RPC).
//     A STRIPE_WEBHOOK_SECRET[_<SLUG>] env var still works as a fallback.
//   Needs SUPABASE_SERVICE_KEY[_<SLUG>] (already set for send-push) — only
//     the service role can read the secret column. Writes fall back to the
//     club's anon key (CLUB_CONFIG_<SLUG>.sbKey) if it's missing.
//   Club is resolved like every other function (_club.js): ?club= or hostname.
//
// What gets recorded (anything else on the Stripe account — memberships,
// other products — carries none of these markers and is ignored):
//   • Payment Link with client_reference_id "sp1_<base64url JSON>" (set by
//     stripeLinkWithRef() in app.js) → one self_payments row.
//       JSON: { b: boat_id, c: crew_id, k: race_key, n: race_name }
//       race_date is the race_key's YYYY-MM-DD prefix (raceKey() in app.js).
//   • Checkout Session from create-bulk-checkout with metadata.kind:
//       'bulk' → one race_payments row per crew member (shared payment_ref)
//       'rnli' → one rnli_contributions row
// All Stripe payments are recorded with method 'Card' — the app's "paid to
// the club through Stripe" category (card, Apple/Google Pay, Revolut Pay
// alike); the Stripe dashboard has the per-method breakdown.

const crypto = require('crypto');
const { resolveClubSlug, clubEnv } = require('./_club');

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_RE = /^\d{4}-\d{2}-\d{2}[A-Za-z0-9_]{0,60}$/;
const SIG_TOLERANCE_S = 300;

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const db = dbFor(event);
  if (!db) return json(503, { error: 'club database not configured' });
  let secret = '';
  try { secret = await webhookSecret(event, db); }
  catch (e) { console.error('stripe-webhook secret lookup failed', e); return json(503, { error: 'could not read webhook secret' }); }
  if (!secret) return json(503, { error: 'Stripe webhook signing secret not configured' });

  // Signature is over the exact raw bytes Stripe sent.
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : (event.body || '');
  const sigHeader = (event.headers && (event.headers['stripe-signature'] || event.headers['Stripe-Signature'])) || '';
  if (!verifySignature(raw, sigHeader, secret)) {
    return json(400, { error: 'bad signature' });
  }

  let evt;
  try { evt = JSON.parse(raw); } catch { return json(400, { error: 'bad JSON' }); }

  const type = evt.type;
  if (type !== 'checkout.session.completed' && type !== 'checkout.session.async_payment_succeeded') {
    return json(200, { ignored: type });
  }
  const session = evt.data && evt.data.object;
  if (!session) return json(400, { error: 'no session' });
  // A delayed-notification method completes the session unpaid, then sends
  // async_payment_succeeded once the money is actually in — record then.
  if (session.payment_status !== 'paid') return json(200, { ignored: 'not paid yet' });

  try {
    const kind = session.metadata && session.metadata.kind;
    let result;
    if (kind === 'bulk') result = await recordBulk(db, session);
    else if (kind === 'rnli') result = await recordRnli(db, session);
    else if (typeof session.client_reference_id === 'string' && session.client_reference_id.startsWith('sp1_')) {
      result = await recordSelfPay(db, session);
    } else {
      return json(200, { ignored: 'not a race-fee or RNLI payment' });
    }
    console.log('stripe-webhook', resolveClubSlug(event), session.id, JSON.stringify(result));
    return json(200, result);
  } catch (e) {
    // Non-2xx makes Stripe retry (with backoff, for up to 3 days).
    console.error('stripe-webhook write failed', session.id, e);
    return json(500, { error: String(e.message || e) });
  }
};

// ── Recorders ───────────────────────────────────────────────────────────────

async function recordSelfPay(db, session) {
  let ref;
  try {
    ref = JSON.parse(Buffer.from(session.client_reference_id.slice(4), 'base64url').toString('utf8'));
  } catch {
    return { skipped: 'unreadable client_reference_id' };
  }
  if (!ref || !ID_RE.test(ref.b || '') || !ID_RE.test(ref.c || '') || !KEY_RE.test(ref.k || '')) {
    return { skipped: 'invalid client_reference_id fields' };
  }
  const row = {
    boat_id: ref.b,
    crew_id: ref.c,
    race_key: ref.k,
    race_name: String(ref.n || ref.k).slice(0, 120),
    race_date: ref.k.slice(0, 10),
    method: 'Card',
    amount: Math.round((session.amount_total || 0) / 100),
  };
  const r = await db.insert('self_payments', row);
  return { self_payment: r };
}

async function recordBulk(db, session) {
  const m = session.metadata || {};
  const ref = m.payment_ref;
  if (!ID_RE.test(m.boat_id || '') || !KEY_RE.test(m.race_key || '') || !ref) {
    return { skipped: 'bulk metadata incomplete' };
  }
  // crew_0, crew_1, … each "crewId:amount;crewId:amount" (Stripe caps a
  // metadata value at 500 chars, so create-bulk-checkout chunks the list).
  const crew = [];
  Object.keys(m).filter(k => /^crew_\d+$/.test(k)).sort((a, b) => +a.slice(5) - +b.slice(5)).forEach(k => {
    String(m[k]).split(';').filter(Boolean).forEach(pair => {
      const [id, amt] = pair.split(':');
      if (ID_RE.test(id || '') && /^\d{1,4}$/.test(amt || '')) crew.push({ id, amount: +amt });
    });
  });
  if (!crew.length) return { skipped: 'no crew in metadata' };
  const sumCents = crew.reduce((a, c) => a + c.amount * 100, 0);
  if (sumCents !== session.amount_total) {
    // Never invent payments that don't match what was actually charged.
    return { skipped: `crew total ${sumCents} != charged ${session.amount_total}` };
  }
  const raceDate = /^\d{4}-\d{2}-\d{2}$/.test(m.race_date || '') ? m.race_date : m.race_key.slice(0, 10);
  const results = [];
  for (const c of crew) {
    results.push(await db.insert('race_payments', {
      boat_id: m.boat_id, crew_id: c.id,
      race_key: m.race_key, race_name: String(m.race_name || m.race_key).slice(0, 120),
      race_date: raceDate, method: 'Card', amount: c.amount, payment_ref: ref,
    }));
  }
  return { race_payments: results };
}

async function recordRnli(db, session) {
  const m = session.metadata || {};
  const ref = m.payment_ref;
  if (!ref) return { skipped: 'rnli metadata incomplete' };
  // Unique on payment_ref once migration 080 is in; until then, check first.
  const existing = await db.select('rnli_contributions', 'payment_ref=eq.' + encodeURIComponent(ref) + '&select=id');
  if (existing.length) return { rnli: 'already recorded' };
  const r = await db.insert('rnli_contributions', {
    amount: Math.round((session.amount_total || 0) / 100),
    method: 'Card',
    boat_id: ID_RE.test(m.boat_id || '') ? m.boat_id : null,
    payment_ref: ref,
  });
  return { rnli: r };
}

// ── Signing secret: club DB first (081), env var fallback; cached briefly ──

const secretCache = {};
const SECRET_TTL_MS = 5 * 60 * 1000;
async function webhookSecret(event, db) {
  const slug = resolveClubSlug(event);
  const hit = secretCache[slug];
  if (hit && Date.now() - hit.at < SECRET_TTL_MS) return hit.secret;
  let secret = '';
  if (db.isService) {
    // Errors (e.g. 400 before migration 081 is applied) fall through to env.
    const rows = await db.select('settings', 'id=eq.club&select=stripe_webhook_secret').catch(() => []);
    secret = (rows && rows[0] && rows[0].stripe_webhook_secret) || '';
  }
  if (!secret) secret = clubEnv(event, 'STRIPE_WEBHOOK_SECRET');
  if (secret) secretCache[slug] = { secret, at: Date.now() };
  return secret;
}

// ── Supabase (PostgREST) ────────────────────────────────────────────────────

function dbFor(event) {
  const slug = resolveClubSlug(event);
  let cfg;
  try { cfg = JSON.parse(process.env['CLUB_CONFIG_' + slug.toUpperCase()] || '{}'); }
  catch { return null; }
  const url = cfg.sbUrl;
  const serviceKey = clubEnv(event, 'SUPABASE_SERVICE_KEY');
  const key = serviceKey || cfg.sbKey;
  if (!url || !key) return null;
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  return {
    isService: !!serviceKey,
    // 'inserted' | 'already recorded' (unique-constraint 409); throws otherwise
    async insert(table, row) {
      const r = await fetch(`${url}/rest/v1/${table}`, {
        method: 'POST',
        headers: { ...headers, Prefer: 'return=minimal' },
        body: JSON.stringify(row),
      });
      if (r.ok) return 'inserted';
      if (r.status === 409) return 'already recorded';
      throw new Error(`${table} insert ${r.status}: ${(await r.text()).slice(0, 300)}`);
    },
    async select(table, query) {
      const r = await fetch(`${url}/rest/v1/${table}?${query}`, { headers });
      if (!r.ok) throw new Error(`${table} select ${r.status}: ${(await r.text()).slice(0, 300)}`);
      return r.json();
    },
  };
}

// ── Stripe signature (https://docs.stripe.com/webhooks#verify-manually) ─────

function verifySignature(payload, header, secret) {
  const parts = {};
  String(header).split(',').forEach(kv => {
    const i = kv.indexOf('=');
    if (i < 0) return;
    const k = kv.slice(0, i).trim(), v = kv.slice(i + 1).trim();
    (parts[k] = parts[k] || []).push(v);
  });
  const t = parts.t && parts.t[0];
  const sigs = parts.v1 || [];
  if (!t || !sigs.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > SIG_TOLERANCE_S) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${payload}`, 'utf8').digest('hex');
  const exp = Buffer.from(expected, 'hex');
  return sigs.some(s => {
    const got = Buffer.from(s, 'hex');
    return got.length === exp.length && crypto.timingSafeEqual(got, exp);
  });
}

function json(statusCode, body) {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
