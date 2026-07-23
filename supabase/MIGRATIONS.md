# Migrations across multiple clubs

Each club (GBSC, RCYC, HYC, and more to come) is its own Supabase project.
`supabase/migrations/*.sql` is GBSC's real incremental history — GBSC runs
every file in order as it's added. Other clubs are set up from a
consolidated `<slug>_bootstrap.sql` (a from-scratch equivalent of running
`schema.sql` + every non-GBSC-specific migration) and then previously
needed each new migration applied by hand afterwards, with no automated
runner.

That manual step is exactly how RCYC ended up missing migrations 033 and
035 with no way to tell short of checking columns one by one — hence the
`schema_migrations` table (added in migration 036), and now `scripts/
run-migrations.mjs` (see below), which uses that same table to apply only
what's actually missing, per club, instead of relying on someone to
remember.

## Automated runner (preferred)

`scripts/run-migrations.mjs` connects directly to each club's Postgres
database (not the anon/service REST API — DDL needs a real connection
string) and applies whatever's in `supabase/migrations/` that isn't
already recorded in that club's `schema_migrations` table.

```
npm run migrate:dry-run          # shows what's pending, no writes
npm run migrate                  # applies to every configured club
node scripts/run-migrations.mjs --club=gbsc   # one club only
```

Clubs are discovered from env vars: `SUPABASE_DB_URL` (GBSC/default) and
`SUPABASE_DB_URL_<SLUG>` per club (Supabase dashboard → Project Settings →
Database → Connection string → URI) — same naming convention as the
existing `SUPABASE_SERVICE_KEY_<SLUG>` vars in `netlify/functions/
send-push.js`. These are real database credentials, not the public anon
key — never commit them, never paste them into chat; set them as local
env vars or, for the `.github/workflows/migrate.yml` manual GitHub Action,
as repo secrets of the same names.

If a migration fails partway on one club, the runner stops immediately
rather than moving on to the next club — a DDL failure on GBSC almost
certainly means the same file will fail identically on RCYC/HYC/IS, so
better to surface it once than leave clubs in inconsistent states
relative to each other.

## Manual fallback

If a club's DB URL isn't wired into the runner yet, the old process still
works. Nothing here should be run by an AI assistant directly without
asking first, even once a connection string exists — applying schema
changes to a live club's database is a deliberate, confirmed action, not
a default one.

### Checking whether a club is caught up

Every club's DB has a `schema_migrations` table (`filename`, `applied_at`).
Query it with the anon key (safe — it's SELECT-only, same access the app
itself has) and diff against `ls supabase/migrations/`:

```
GET {sbUrl}/rest/v1/schema_migrations?select=filename&order=filename.desc
```

Any migration in the folder that isn't in that result — excluding per-club
seed scripts (filenames containing "seed", never run outside their own
club) and `034_crew_guest_type.sql` (buggy, superseded by 035, never run
anywhere on purpose) — hasn't been applied yet.

A club's `sbUrl`/`sbKey` can be read from `/club-config.js?club=<slug>` on
the live site (the `?club=` override works from any hostname), same as the
app itself does at load time.

## Writing a new migration

End every new migration file with:

```sql
INSERT INTO schema_migrations (filename) VALUES ('0NN_name.sql')
ON CONFLICT (filename) DO NOTHING;
```

If the change applies to every club (not a GBSC-only seed), also add the
same `INSERT` line — alongside the actual DDL — to:
  - every existing `<slug>_bootstrap.sql` (`rcyc_bootstrap.sql`, `hyc_bootstrap.sql`, ...)
  - `NEW_CLUB_TEMPLATE.sql`, so the next club onboarded (see
    `NEW_CLUB_ONBOARDING.md`) starts fully caught up with no separate
    catch-up step.

`schema.sql` itself is never touched for new migrations — it's the
original baseline only.

### Bringing an existing club up to date

If the check above finds gaps, write a small `<slug>_catchup_0NN.sql` (see
`rcyc_catchup_033_035.sql` for the pattern) with just the missing
migrations' DDL plus a `schema_migrations` backfill, and have the club run
it once in their Supabase SQL Editor. The anon key can't execute DDL —
only the club's own Supabase login, or the automated runner with a real
connection string, can.
