# Pending Supabase Changes

## 1. Apply tightened RLS policies to live database

The schema in `schema.sql` contains improved RLS policies (least-privilege,
immutable audit tables, coordinate bounds checks, etc.) but they have NOT
yet been applied to the live Supabase project.

**To apply:** open the Supabase SQL Editor and for each table, drop the
existing policies and re-run the `CREATE POLICY` statements from `schema.sql`.

Or run this to drop all existing policies first, then re-run the full schema:

```sql
-- Drop all existing policies (run before re-applying schema.sql)
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public'
  LOOP
    EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname)
            || ' ON ' || quote_ident(r.tablename);
  END LOOP;
END $$;
```

Then paste and run the full `schema.sql`.

---

## 2. Future: Supabase Auth for RO login

Currently the RO authenticates with a shared PIN (`2026`) stored in app.js.
A future improvement would be to use Supabase Auth (email/password) for the
RO role, which would allow RLS policies to restrict destructive writes
(marks, boats, settings, courses) to authenticated users only.

Skipper logins can remain PIN-based.
