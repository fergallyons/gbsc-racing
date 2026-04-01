# GBSC Racing App

Race management app for Galway Bay Sailing Club — built for dockside use on mobile.

## What it does

- **Boat login** with per-boat PIN (default `0000`)
- **Race registration** — skippers declare intent to race before the start
- **Crew roster** with membership type tracking (Full Member, Crew Member, Visitor)
- **Race fee collection** — Revolut deep links, cash, bar tap, and Stripe (when configured)
- **Course display** — published by Race Officer, shows mark sequence with port/starboard rounding, bearings, distances and total course length
- **Race Officer tools** — course builder, wind direction, registered boats list, PIN management
- **Halsail results** — live IRC and ECHO series standings pulled from halsail.com

## Tech stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML / CSS / JS — no build step |
| Database | Supabase (PostgreSQL) |
| Hosting | Netlify |
| Results | Halsail public API |
| Payments | Revolut personal links · Stripe (configurable) |

## Files

```
index.html   — App shell and all HTML markup
style.css    — All styles and CSS variables
app.js       — All application logic (~1,700 lines)
```

## Database (Supabase)

Project: `esqjcmwfnzkolwxfbcro.supabase.co`

Tables: `boats`, `crew`, `race_records`, `registrations`, `published_courses`

To set up the database from scratch, run the SQL files in order:
1. `gbsc-schema.sql` — core tables
2. `gbsc-migrate-boat-config.sql` — adds pin, revolut_user, stripe_link to boats
3. `gbsc-fix-registrations.sql` — registrations table with named unique constraint
4. `gbsc-fix-courses-table.sql` — published_courses with jsonb marks column

## Deployment

Connected to Netlify via GitHub. Every push to `main` deploys automatically.

The CI workflow checks JavaScript syntax and HTML integrity on every push.

## Adding features

The best way to make changes safely:
1. Edit `app.js` for logic changes
2. Edit `style.css` for visual changes  
3. Edit `index.html` only for structural HTML changes
4. Run `node --check app.js` locally before pushing
5. Push to `main` — CI checks then Netlify deploys

## Halsail integration

Club ID: `3725`  
Matches classes containing `irc` (IRC) or `echo`/`cru-e` pattern (ECHO).  
Results are fetched live and cached per session. Use the ↺ button to force refresh.

If Halsail blocks browser CORS, deploy the edge function proxy:
```bash
supabase functions deploy halsail-proxy --no-verify-jwt
```

## Race fees

- Full Member: €4
- Crew Member: €4  
- Visitor: €10 (max 6 outings before must join as crew)

Reports submitted by email to `rccruisers@gbsc.ie` and saved to Supabase.
