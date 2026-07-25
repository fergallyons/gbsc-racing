#!/usr/bin/env node
// Applies supabase/migrations/*.sql to every club's database in a controlled,
// repeatable way — replacing the old workflow of hand-pasting SQL into each
// club's Supabase SQL editor (which is how clubs drifted out of sync and
// caused a live production error on GBSC — see git log around 032_laid_course).
//
// Discovers clubs from env vars named SUPABASE_DB_URL_<SLUG> (plus a bare
// SUPABASE_DB_URL as the GBSC/default connection), mirroring the existing
// SUPABASE_SERVICE_KEY_<SLUG> convention used in netlify/functions/send-push.js.
// Each DB URL is the Postgres *connection string* (Supabase dashboard →
// Project Settings → Database → Connection string → URI), not the anon or
// service_role API key — those can't run DDL.
//
// Usage:
//   node scripts/run-migrations.mjs --dry-run           # show what WOULD run, no writes
//   node scripts/run-migrations.mjs                      # apply to every configured club
//   node scripts/run-migrations.mjs --club=gbsc           # apply to one club only
//
// Every migration file already ends with an idempotent
//   INSERT INTO schema_migrations (filename) VALUES (...) ON CONFLICT DO NOTHING
// — this script uses that same table as the source of truth for what's
// already applied, so it's safe to re-run at any time.

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const clubArg = args.find(a => a.startsWith('--club='));
const onlyClub = clubArg ? clubArg.split('=')[1].toLowerCase() : null;

function discoverClubs() {
  const clubs = {};
  if (process.env.SUPABASE_DB_URL) clubs.gbsc = process.env.SUPABASE_DB_URL;
  for (const key of Object.keys(process.env)) {
    const m = key.match(/^SUPABASE_DB_URL_([A-Z0-9]+)$/);
    if (m) clubs[m[1].toLowerCase()] = process.env[key];
  }
  return clubs;
}

function loadMigrationFiles() {
  return readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort() // filenames are zero-padded / date-prefixed, so lexical sort == apply order
    .map(f => ({ filename: f, sql: readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8') }));
}

async function applyToClub(slug, connectionString, migrations) {
  const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));
    const pending = migrations.filter(m => !applied.has(m.filename));

    if (pending.length === 0) {
      console.log(`[${slug}] up to date (${applied.size} migrations already applied)`);
      return;
    }

    console.log(`[${slug}] ${pending.length} pending: ${pending.map(m => m.filename).join(', ')}`);
    if (dryRun) return;

    for (const m of pending) {
      console.log(`[${slug}]   applying ${m.filename} ...`);
      await client.query('BEGIN');
      try {
        await client.query(m.sql);
        await client.query('COMMIT');
        console.log(`[${slug}]   ✓ ${m.filename}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`[${slug}] FAILED on ${m.filename}: ${e.message}`);
      }
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const clubs = discoverClubs();
  const slugs = onlyClub ? [onlyClub] : Object.keys(clubs);
  if (slugs.length === 0) {
    console.error('No clubs configured. Set SUPABASE_DB_URL (GBSC/default) and/or SUPABASE_DB_URL_<SLUG> env vars.');
    process.exit(1);
  }
  const migrations = loadMigrationFiles();
  console.log(`${migrations.length} migration files found. Targeting: ${slugs.join(', ')}${dryRun ? ' (dry run)' : ''}\n`);

  let hadError = false;
  for (const slug of slugs) {
    const url = clubs[slug];
    if (!url) {
      console.error(`[${slug}] no SUPABASE_DB_URL_${slug.toUpperCase()} configured — skipping`);
      hadError = true;
      continue;
    }
    try {
      await applyToClub(slug, url, migrations);
    } catch (e) {
      console.error(e.message);
      hadError = true;
      // Deliberately do NOT continue to other clubs' pending migrations after
      // a failure on this one file — stop and surface it rather than silently
      // leaving clubs in inconsistent states relative to each other.
      break;
    }
  }
  process.exit(hadError ? 1 : 0);
}

main();
