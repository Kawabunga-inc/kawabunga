import "dotenv/config";
import { neon } from "@neondatabase/serverless";

const verifyOnly = process.argv.includes("--verify-only");

const requiredColumns = new Map<string, string[]>([
  [
    "users",
    [
      "id",
      "name",
      "email",
      "email_verified",
      "image",
      "password_hash",
      "role",
      "created_at",
      "updated_at",
    ],
  ],
  [
    "accounts",
    [
      "user_id",
      "type",
      "provider",
      "provider_account_id",
      "refresh_token",
      "access_token",
      "expires_at",
      "token_type",
      "scope",
      "id_token",
      "session_state",
    ],
  ],
  ["auth_sessions", ["session_token", "user_id", "expires"]],
  ["verification_tokens", ["identifier", "token", "expires"]],
]);

async function main() {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const sql = neon(url);

  if (!verifyOnly) {
    await sql`create extension if not exists pgcrypto`;

    await sql`
      create table if not exists users (
        id text primary key default gen_random_uuid()::text,
        name text,
        email text not null unique,
        email_verified timestamptz,
        image text,
        password_hash text,
        role text not null default 'user',
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )
    `;

    await sql`
      create table if not exists accounts (
        user_id text not null references users(id) on delete cascade,
        type text not null,
        provider text not null,
        provider_account_id text not null,
        refresh_token text,
        access_token text,
        expires_at integer,
        token_type text,
        scope text,
        id_token text,
        session_state text,
        primary key (provider, provider_account_id)
      )
    `;

    await sql`
      create table if not exists auth_sessions (
        session_token text primary key,
        user_id text not null references users(id) on delete cascade,
        expires timestamptz not null
      )
    `;

    await sql`
      create table if not exists verification_tokens (
        identifier text not null,
        token text not null,
        expires timestamptz not null,
        primary key (identifier, token)
      )
    `;

    await sql`alter table users add column if not exists name text`;
    await sql`alter table users add column if not exists email_verified timestamptz`;
    await sql`alter table users add column if not exists image text`;
    await sql`alter table users add column if not exists password_hash text`;
    await sql`alter table users add column if not exists role text not null default 'user'`;
    await sql`alter table users add column if not exists created_at timestamptz not null default now()`;
    await sql`alter table users add column if not exists updated_at timestamptz not null default now()`;

    await sql`alter table accounts add column if not exists refresh_token text`;
    await sql`alter table accounts add column if not exists access_token text`;
    await sql`alter table accounts add column if not exists expires_at integer`;
    await sql`alter table accounts add column if not exists token_type text`;
    await sql`alter table accounts add column if not exists scope text`;
    await sql`alter table accounts add column if not exists id_token text`;
    await sql`alter table accounts add column if not exists session_state text`;

    await sql`create unique index if not exists users_email_unique on users (email)`;
    await sql`create index if not exists accounts_user_id_idx on accounts (user_id)`;
    await sql`create index if not exists auth_sessions_user_id_idx on auth_sessions (user_id)`;
  }

  const rows = await sql`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('users', 'accounts', 'auth_sessions', 'verification_tokens')
    order by table_name, ordinal_position
  `;

  const found = new Map<string, Set<string>>();
  for (const row of rows as Array<{ table_name: string; column_name: string }>) {
    const columns = found.get(row.table_name) ?? new Set<string>();
    columns.add(row.column_name);
    found.set(row.table_name, columns);
  }

  const missing: string[] = [];
  for (const [table, columns] of requiredColumns) {
    const foundColumns = found.get(table);
    if (!foundColumns) {
      missing.push(`${table}.*`);
      continue;
    }
    for (const column of columns) {
      if (!foundColumns.has(column)) missing.push(`${table}.${column}`);
    }
  }

  if (missing.length > 0) {
    console.error(`Auth schema is incomplete. Missing: ${missing.join(", ")}`);
    process.exit(1);
  }

  const tableNames = Array.from(requiredColumns.keys()).join(", ");
  console.log(`Auth schema ${verifyOnly ? "verified" : "ensured"}: ${tableNames}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
