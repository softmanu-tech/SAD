import { neon } from "@neondatabase/serverless";

/** Runs one parameterised SQL statement and returns its rows. */
export type Query = (text: string, params?: unknown[]) => Promise<Record<string, unknown>[]>;

/** Online mode: records live in Neon Postgres and everyone must log in. Otherwise the local data/ file is used. */
export const hosted = () => !!process.env.DATABASE_URL;

let q: Query | null = null;
let ready: Promise<void> | null = null;

/** Replace the database connection (used by tests). */
export function setQuery(fn: Query | null) {
  q = fn;
  ready = null;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS sa_state (
     id int PRIMARY KEY,
     doc jsonb NOT NULL,
     version int NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sa_backups (
     day date PRIMARY KEY,
     doc jsonb NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sa_uploads (
     id text PRIMARY KEY,
     data text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS sa_users (
     id text PRIMARY KEY,
     email text NOT NULL UNIQUE,
     name text NOT NULL,
     pass_hash text NOT NULL,
     session_version int NOT NULL DEFAULT 1,
     failed_logins int NOT NULL DEFAULT 0,
     locked_until timestamptz,
     created_at timestamptz NOT NULL DEFAULT now())`,
];

/** The database, with its tables created on first use. */
export async function db(): Promise<Query> {
  if (!q) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const sql = neon(url);
    q = (text, params) => sql.query(text, params ?? []) as Promise<Record<string, unknown>[]>;
  }
  const query = q;
  ready ??= (async () => {
    for (const stmt of SCHEMA) await query(stmt);
  })().catch((e) => {
    ready = null; // retry on the next request
    throw e;
  });
  await ready;
  return query;
}
