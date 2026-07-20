# Migrations across multiple clubs

Each club (GBSC, RCYC, HYC, and more to come) is its own Supabase project.
`supabase/migrations/*.sql` is GBSC's real incremental history — GBSC runs
every file in order as it's added. Other clubs are set up from a
consolidated `<slug>_bootstrap.sql` (a from-scratch equivalent of running
`schema.sql` + every non-GBSC-specific migration) and then need each new
migration applied by hand afterwards, since there's no automated runner.

That manual step is exactly how RCYC ended up missing migrations 033 and
035 with no way to tell short of checking columns one by one — hence the
`schema_migrations` table (added in migration 036).

## Checking whether a club is caught up

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
same `INSERT` line to `rcyc_bootstrap.sql` and `hyc_bootstrap.sql` (and any
future `<slug>_bootstrap.sql`) alongside the actual DDL, so a brand-new
club set up from bootstrap starts fully caught up with no separate catch-up
step. `schema.sql` itself is never touched for new migrations — it's the
original baseline only.

## Bringing an existing club up to date

If the check above finds gaps, write a small `<slug>_catchup_0NN.sql` (see
`rcyc_catchup_033_035.sql` for the pattern) with just the missing
migrations' DDL plus a `schema_migrations` backfill, and have the club run
it once in their Supabase SQL Editor. Nothing here can be run by an AI
assistant directly — the anon key can't execute DDL, only the club's own
Supabase login can.
