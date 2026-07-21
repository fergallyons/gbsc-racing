# RaceOps Crest

A multi-club sailing race-day and club-management platform — one codebase, one Netlify site, serving multiple sailing clubs each with their own branding, database and feature configuration.

Currently live for Galway Bay Sailing Club (GBSC), Royal Cork Yacht Club (RCYC), and Howth Yacht Club (HYC).

See [docs/FEATURE_SPEC.md](docs/FEATURE_SPEC.md) for the full feature catalog (written for clubs evaluating the platform).

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS — no build step, no framework |
| Database | Supabase (PostgreSQL) — one project per club |
| Hosting | Netlify (static site + Edge Functions + Functions) |
| Results/handicaps | HalSail, Irish Sailing national ratings register |
| Payments | Stripe (Payment Links + bulk checkout) · Revolut deep links · cash |
| Push notifications | Web Push (VAPID), per-club key pair |

## Repo layout

```
index.html                 — App shell and all HTML markup
app.js                     — All application logic
style.css                  — Styles and CSS variables
sw.js                      — Service worker (offline/PWA support)
manifest.json              — PWA manifest (per-club values injected server-side)

netlify/edge-functions/    — Deno runtime: club-config.js (branding injection),
                              manifest.js, rewrite-club-links.js
netlify/functions/         — Node runtime: Stripe checkout, push notifications,
                              HalSail/tide/weather/eStela/Drive proxies, _club.js
                              (shared hostname → club-slug resolution helper)

supabase/
  schema.sql                — Original baseline schema
  migrations/*.sql           — GBSC's real incremental migration history, in order
  <slug>_bootstrap.sql        — From-scratch setup for a new club (schema.sql +
                                every non-GBSC-specific migration, consolidated)
  NEW_CLUB_TEMPLATE.sql       — Template used to onboard the next club
  MIGRATIONS.md               — How migrations work across multiple independent
                                 Supabase projects, and how to check/catch up a club
```

## Multi-club architecture

Each club is fully isolated: its own Supabase project, its own `CLUB_CONFIG_<SLUG>` Netlify env var (branding, fees, coordinates, feature flags baked in at deploy time), and its own live-editable settings row in its own database. The request hostname resolves to a club slug (`HOSTNAME_MAP` env var), and that slug drives which config a given request gets — see `netlify/edge-functions/club-config.js` and `netlify/functions/_club.js`.

## Deployment

Connected to Netlify via GitHub. Every push to `main` deploys automatically — no build step beyond stamping `version.json` with the commit and build time.

## Local development

There's no dev server required for the frontend — open `index.html` directly, or serve the folder statically. `node --check app.js` catches syntax errors before pushing. Netlify Functions need `npm install` (see `package.json`) for their one dependency (`web-push`).

## Adding a new club

Follow `supabase/NEW_CLUB_TEMPLATE.sql` and `supabase/MIGRATIONS.md`.
