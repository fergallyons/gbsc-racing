// Creates a Stripe Checkout Session for a bulk race-fee payment.
// One card transaction → multiple crew members marked paid in the app.
//
// Setup:
//   Netlify → Site configuration → Environment variables → Add variable:
//   Key:   STRIPE_SECRET_KEY               (default/GBSC)
//          STRIPE_SECRET_KEY_<SLUG>         (per-club override, e.g. STRIPE_SECRET_KEY_RCYC)
//   Value: sk_live_…  (grab from https://dashboard.stripe.com/apikeys)
//   Club is resolved from the request hostname via HOSTNAME_MAP, same as club-config.js —
//   see netlify/functions/_club.js.
//
// Request (POST, JSON):
//   {
//     items:    [{ name: "Full Member race fee", amount_cents: 400, quantity: 2 }, ...],
//     returnUrl: "https://gbsc.racing/?stripe_success=1&bulk_ref=<uuid>",
//     cancelUrl: "https://gbsc.racing/",
//     paymentRef: "<uuid>",            // echoed back via session metadata
//     boatId:     "silver_fox",
//     raceKey:    "2026-06-04",
//     description:"GBSC race fees — Silver Fox · 4 crew"
//   }
//
// Response:
//   200 { url: "https://checkout.stripe.com/c/pay/cs_..." }
//   400 { error: "validation message" }
//   500 { error: "stripe error" }
//   503 { error: "STRIPE_SECRET_KEY not configured" }

const { clubEnv } = require('./_club');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'POST only' });
  }
  const key = clubEnv(event, 'STRIPE_SECRET_KEY');
  if (!key) {
    return json(503, { error: 'STRIPE_SECRET_KEY not configured' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); }
  catch { return json(400, { error: 'Invalid JSON' }); }

  const { items, returnUrl, cancelUrl, paymentRef, boatId, raceKey, description } = body;

  // ── Validate inputs ──────────────────────────────────────────
  if (!Array.isArray(items) || items.length === 0) {
    return json(400, { error: 'items must be a non-empty array' });
  }
  for (const it of items) {
    if (!it || typeof it.name !== 'string' || !it.name ||
        !Number.isInteger(it.amount_cents) || it.amount_cents < 0 ||
        !Number.isInteger(it.quantity) || it.quantity <= 0) {
      return json(400, { error: 'each item needs name, amount_cents (int>=0), quantity (int>0)' });
    }
  }
  if (typeof returnUrl !== 'string' || !/^https?:\/\//.test(returnUrl)) {
    return json(400, { error: 'returnUrl must be a full URL' });
  }
  if (typeof cancelUrl !== 'string' || !/^https?:\/\//.test(cancelUrl)) {
    return json(400, { error: 'cancelUrl must be a full URL' });
  }
  if (typeof paymentRef !== 'string' || paymentRef.length < 8 || paymentRef.length > 64) {
    return json(400, { error: 'paymentRef must be 8-64 chars' });
  }
  // Hard cap to avoid runaway charges from a bad client
  const total = items.reduce((a, it) => a + it.amount_cents * it.quantity, 0);
  if (total > 100000) { // €1000
    return json(400, { error: 'total exceeds €1000 cap' });
  }

  // ── Build Stripe form body ────────────────────────────────────
  // Stripe uses application/x-www-form-urlencoded with array indices.
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', returnUrl);
  form.set('cancel_url',  cancelUrl);
  form.set('metadata[payment_ref]', paymentRef);
  if (boatId)  form.set('metadata[boat_id]',  String(boatId));
  if (raceKey) form.set('metadata[race_key]', String(raceKey));
  if (description) form.set('payment_intent_data[description]', description.slice(0, 200));

  items.forEach((it, i) => {
    form.set(`line_items[${i}][price_data][currency]`,                 'eur');
    form.set(`line_items[${i}][price_data][product_data][name]`,       it.name.slice(0, 100));
    form.set(`line_items[${i}][price_data][unit_amount]`,              String(it.amount_cents));
    form.set(`line_items[${i}][quantity]`,                             String(it.quantity));
  });

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + key,
        'Content-Type':  'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    });
    const data = await res.json();
    if (!res.ok) {
      console.error('Stripe error', res.status, data);
      return json(res.status, { error: (data.error && data.error.message) || 'Stripe error' });
    }
    return json(200, { url: data.url });
  } catch (e) {
    console.error('create-bulk-checkout fetch failed', e);
    return json(502, { error: String(e) });
  }
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
