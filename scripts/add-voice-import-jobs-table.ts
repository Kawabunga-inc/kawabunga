/**
 * One-off additive migration for durable Voice Library import jobs.
 *
 * Usage:
 *   npx tsx scripts/add-voice-import-jobs-table.ts
 *
 * Required env: DATABASE_URL. Safe to re-run.
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const sql = neon(url);
  process.stdout.write("  CREATE TABLE voice_import_jobs … ");
  await sql.query(`
    CREATE TABLE IF NOT EXISTS voice_import_jobs (
      id text PRIMARY KEY,
      provider text NOT NULL,
      external_id text NOT NULL,
      voice_id text REFERENCES voices(id) ON DELETE SET NULL,
      voice_slug text,
      status text NOT NULL DEFAULT 'queued',
      phase text NOT NULL DEFAULT 'fetching_source',
      completed_phases text[] NOT NULL DEFAULT '{}',
      error_code text,
      error_message text,
      config jsonb NOT NULL DEFAULT '{}',
      created_by text REFERENCES users(id) ON DELETE SET NULL,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  console.log("ok");
  for (const [name, columns] of [
    ["voice_import_jobs_provider_external_idx", "provider, external_id"],
    ["voice_import_jobs_status_idx", "status"],
    ["voice_import_jobs_voice_idx", "voice_id"],
  ] as const) {
    await sql.query(`CREATE INDEX IF NOT EXISTS ${name} ON voice_import_jobs (${columns})`);
  }
  console.log("  indexes … ok\nDone.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
