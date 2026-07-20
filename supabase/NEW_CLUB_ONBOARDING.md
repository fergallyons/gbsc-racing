# Onboarding a new club

Everything needed to bring a new club (e.g. Mayo Yacht Club) online, in
order. Steps marked **(manual)** happen outside this repo — in the
Supabase dashboard or Netlify dashboard — and can't be scripted from here.

## 1. Supabase project **(manual)**

Create a new Supabase project for the club (supabase.com → New Project).
Note the region — pick something close to Ireland (e.g. eu-west-1) for
latency. Once created, go to **Project Settings → API** and note:
- Project URL (`sbUrl`)
- `anon` `public` key (`sbKey`)

## 2. Run the bootstrap SQL

Copy `supabase/NEW_CLUB_TEMPLATE.sql` and find-and-replace every
`{{PLACEHOLDER}}`:

| Placeholder | Example (Mayo YC) |
|---|---|
| `{{CLUB_NAME}}` | Mayo Yacht Club |
| `{{CLUB_SHORT}}` | MYC |
| `{{CLUB_SLUG}}` | myc |
| `{{CLUB_SLUG_UPPER}}` | MYC |
| `{{CLUB_LOCATION}}` | Rosmoney, Westport, Co. Mayo (Clew Bay) |

Paste the result into the new Supabase project's **SQL Editor** and run
it in full. It's idempotent — safe to re-run if something fails partway
through.

Save the finished file as `supabase/<slug>_bootstrap.sql` in this repo
(e.g. `supabase/myc_bootstrap.sql`) and commit it, matching the existing
`rcyc_bootstrap.sql` / `hyc_bootstrap.sql` — it's the record of exactly
what that club's DB looks like, and the base to diff against for future
per-club catch-up scripts.

## 3. Netlify env vars **(manual)**

In the Netlify site's **Environment variables**, add:

- **`CLUB_CONFIG_<SLUG_UPPER>`** (e.g. `CLUB_CONFIG_MYC`) — a JSON string:
  ```json
  {
    "name": "Mayo Yacht Club",
    "short": "MYC",
    "slug": "myc",
    "sbUrl": "https://xxxxx.supabase.co",
    "sbKey": "eyJ..."
  }
  ```
  See the full field list (branding, sponsors, feature flags) documented
  at the top of `netlify/edge-functions/club-config.js` — everything
  beyond `name`/`short`/`slug`/`sbUrl`/`sbKey` is optional and can be
  added later, or set via the in-app Club Settings sheet instead (fees,
  HalSail ID, membership limits, location/tides, RO PIN — all self-service
  now, no redeploy needed).

- **`HOSTNAME_MAP`** — add an entry mapping the club's domain(s) to its
  slug, e.g.:
  ```json
  {"...existing entries...", "racing.mayoyachtclub.ie": "myc"}
  ```

Changing env vars triggers a Netlify redeploy automatically.

## 4. DNS **(manual)**

Point the club's domain (or subdomain) at the Netlify site per Netlify's
custom domain instructions, and confirm it appears in `HOSTNAME_MAP`
above. For testing before DNS is live, use `https://<your-netlify-site>/?club=<slug>`
— the `?club=` override works from any hostname.

## 5. First login and self-service setup

Log in as RO (default PIN `0000`, per the template — **change this
first**) and open **Club Settings** to fill in the rest:
- RO PIN
- Fee schedule (Full/Crew/Visitor/Student/Junior)
- Membership limits (visitor max outings, crew max years)
- HalSail Club ID (if the club uses Halsail for scoring)
- Start line / wind station coordinates, tide station + datum offset
- Stripe payment links, Results URL, noticeboard URL, RO Revolut username

Branding (logo, favicon, accent colors) isn't in the Club Settings UI —
set `logo_url`/`favicon_url`/`primary_color`/`ro_color` directly on the
`settings` row, or via the `CLUB_CONFIG_<SLUG>` env var, since it's a
one-time setup step rather than something an RO adjusts day-to-day.

## 6. Verify

Confirm the new club's schema is fully caught up (it will be — the
template already includes every current migration) using the check in
`supabase/MIGRATIONS.md`. Then walk through the golden path once for
real: RO logs in, adds a boat, boat's skipper logs in with its PIN, adds
crew, registers for a race.
