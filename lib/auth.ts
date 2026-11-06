import crypto from "node:crypto";
import { promisify } from "node:util";
import { db } from "./db";
import { HttpError } from "./errors";
import type { SessionUser } from "./types";

const scrypt = promisify(crypto.scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

export const SESSION_COOKIE = "sa_session";
export const SESSION_HOURS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD = 10;

function secret(): Buffer {
  const s = process.env.SESSION_SECRET ?? "";
  if (s.length < 32) throw new HttpError(500, "SESSION_SECRET must be set to a random value of at least 32 characters");
  return Buffer.from(s);
}

// ---------- passwords ----------

export async function hashPassword(pw: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [kind, salt, hash] = stored.split("$");
  if (kind !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64");
  const actual = await scrypt(pw, Buffer.from(salt, "base64"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

function checkNewPassword(pw: string) {
  if (pw.length < MIN_PASSWORD) throw new HttpError(400, `Passwords must be at least ${MIN_PASSWORD} characters`);
}

const cleanEmail = (e: unknown) => (typeof e === "string" ? e.trim().toLowerCase() : "");

// ---------- sessions (signed cookie) ----------

const sign = (payload: string) => crypto.createHmac("sha256", secret()).update(payload).digest("base64url");

export function sessionToken(userId: string, version: number): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, v: version, e: Date.now() + SESSION_HOURS * 3600_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** The signed-in user for a session cookie, or null. Sessions end on expiry, logout-everywhere or removal. */
export async function userFromToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  let data: { u?: string; v?: number; e?: number };
  try {
    data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!data.u || !data.e || data.e < Date.now()) return null;
  const q = await db();
  const [row] = await q("SELECT id, name, email, session_version FROM sa_users WHERE id = $1", [data.u]);
  if (!row || Number(row.session_version) !== data.v) return null;
  return { id: String(row.id), name: String(row.name), email: String(row.email) };
}

// ---------- login ----------

/** Creates the first account from ADMIN_EMAIL / ADMIN_PASSWORD when there are no users yet. */
async function bootstrap() {
  const q = await db();
  const [{ count }] = await q("SELECT count(*)::int AS count FROM sa_users");
  if (Number(count) > 0) return;
  const email = cleanEmail(process.env.ADMIN_EMAIL);
  const pw = process.env.ADMIN_PASSWORD ?? "";
  if (!email || pw.length < MIN_PASSWORD) {
    throw new HttpError(500, `No users yet: set ADMIN_EMAIL and ADMIN_PASSWORD (at least ${MIN_PASSWORD} characters) in the hosting settings`);
  }
  await q("INSERT INTO sa_users (id, email, name, pass_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING", [
    crypto.randomUUID(),
    email,
    process.env.ADMIN_NAME?.trim() || "Administrator",
    await hashPassword(pw),
  ]);
}

const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + Buffer.alloc(64).toString("base64");

/** Checks email + password and returns a session token. Locks the account after repeated failures. */
export async function login(emailIn: unknown, pwIn: unknown): Promise<{ token: string; user: SessionUser }> {
  secret(); // fail early with a clear message if not configured
  await bootstrap();
  const email = cleanEmail(emailIn);
  const pw = typeof pwIn === "string" ? pwIn : "";
  const q = await db();
  const [row] = await q(
    "SELECT id, name, email, pass_hash, session_version, failed_logins, locked_until > now() AS locked FROM sa_users WHERE email = $1",
    [email],
  );
  const wrong = new HttpError(401, "Wrong email or password");
  if (!row) {
    await verifyPassword(pw, DUMMY_HASH); // same delay as a real check
    throw wrong;
  }
  if (row.locked) throw new HttpError(429, `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
  if (!(await verifyPassword(pw, String(row.pass_hash)))) {
    const failed = Number(row.failed_logins) + 1;
    if (failed >= MAX_FAILED) {
      await q(`UPDATE sa_users SET failed_logins = 0, locked_until = now() + interval '${LOCK_MINUTES} minutes' WHERE id = $1`, [row.id]);
      throw new HttpError(429, `Too many wrong passwords. Try again in ${LOCK_MINUTES} minutes.`);
    }
    await q("UPDATE sa_users SET failed_logins = $2 WHERE id = $1", [row.id, failed]);
    throw wrong;
  }
  await q("UPDATE sa_users SET failed_logins = 0, locked_until = NULL WHERE id = $1", [row.id]);
  const user = { id: String(row.id), name: String(row.name), email: String(row.email) };
  return { token: sessionToken(user.id, Number(row.session_version)), user };
}

// ---------- managing users ----------

export async function listUsers() {
  const q = await db();
  const rows = await q("SELECT id, name, email, to_char(created_at, 'YYYY-MM-DD') AS created FROM sa_users ORDER BY name");
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), email: String(r.email), created: String(r.created) }));
}

export async function addUser(nameIn: unknown, emailIn: unknown, pwIn: unknown) {
  const name = typeof nameIn === "string" ? nameIn.trim() : "";
  const email = cleanEmail(emailIn);
  const pw = typeof pwIn === "string" ? pwIn : "";
  if (!name) throw new HttpError(400, "Enter the person's name");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address");
  checkNewPassword(pw);
  const q = await db();
  const added = await q("INSERT INTO sa_users (id, email, name, pass_hash) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO NOTHING RETURNING id", [
    crypto.randomUUID(),
    email,
    name,
    await hashPassword(pw),
  ]);
  if (!added.length) throw new HttpError(400, `${email} already has an account`);
}

/** Sets a new password and signs that person out everywhere. */
export async function setPassword(id: unknown, pwIn: unknown) {
  const pw = typeof pwIn === "string" ? pwIn : "";
  checkNewPassword(pw);
  const q = await db();
  const done = await q(
    "UPDATE sa_users SET pass_hash = $2, session_version = session_version + 1, failed_logins = 0, locked_until = NULL WHERE id = $1 RETURNING id",
    [String(id), await hashPassword(pw)],
  );
  if (!done.length) throw new HttpError(404, "User not found");
}

export async function removeUser(id: unknown, me: SessionUser) {
  if (String(id) === me.id) throw new HttpError(400, "You can't remove your own account");
  const q = await db();
  const done = await q("DELETE FROM sa_users WHERE id = $1 RETURNING id", [String(id)]);
  if (!done.length) throw new HttpError(404, "User not found");
}

/** Signs a user out of every device (used on logout). */
export async function endSessions(id: string) {
  const q = await db();
  await q("UPDATE sa_users SET session_version = session_version + 1 WHERE id = $1", [id]);
}
