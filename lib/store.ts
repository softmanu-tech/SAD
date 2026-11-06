import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AdvanceRequest, Db, Employee, Purpose } from "./types";
import { PURPOSES } from "./types";
import { r2, ymd } from "./calc";
import { db as database, hosted } from "./db";
import { HttpError } from "./errors";

// Laptop mode keeps everything in data/ (gitignored). Online mode keeps the same document in Postgres.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "salary-advance.json");
/** Data file written by the original server.js app. Read-only here: never modified or deleted. */
const LEGACY_FILE = path.join(DATA_DIR, "db.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
/** Uploaded loan application PDFs: tmp-<token>.pdf until saved, then <requestId>.pdf. Never deleted. */
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const emptyDb = (): Db => ({
  version: 2,
  settings: { companyName: "", currency: "KSH", facilitySize: 0 },
  employees: [],
  requests: [],
});

// ---------- laptop: data/ file ----------

function writeAtomic(db: Db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // a crash never leaves a half-written data file
}

/** One copy of the data file per day, taken before the first change of the day. Never pruned. */
function dailyFileBackup() {
  if (!fs.existsSync(DB_FILE)) return;
  const target = path.join(BACKUP_DIR, `daily-${ymd()}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DB_FILE, target);
}

function loadFile(): Db {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const start = fs.existsSync(LEGACY_FILE) ? normalize(JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"))) : emptyDb();
    writeAtomic(start);
  }
  dailyFileBackup();
  return normalize(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

// ---------- online: Postgres ----------

async function loadRow(): Promise<{ db: Db; version: number }> {
  const q = await database();
  await q("INSERT INTO sa_state (id, doc, version) VALUES (1, $1::jsonb, 0) ON CONFLICT (id) DO NOTHING", [JSON.stringify(emptyDb())]);
  const [row] = await q("SELECT doc, version FROM sa_state WHERE id = 1");
  return { db: normalize(row.doc), version: Number(row.version) };
}

// ---------- shared API ----------

export async function load(): Promise<Db> {
  return hosted() ? (await loadRow()).db : loadFile();
}

/**
 * Apply `change` to the records and save them. Online, if someone else saved in the meantime the change
 * is re-applied to their version, so nobody's work is overwritten.
 */
export async function mutate<T>(change: (db: Db) => T | Promise<T>): Promise<T> {
  if (!hosted()) {
    const db = loadFile();
    const result = await change(db);
    dailyFileBackup();
    writeAtomic(db);
    return result;
  }
  const q = await database();
  for (let attempt = 0; attempt < 5; attempt++) {
    const { db, version } = await loadRow();
    const before = JSON.stringify(db);
    const result = await change(db);
    // Daily backup: the records as they were before the first change of the day.
    await q("INSERT INTO sa_backups (day, doc) VALUES ($1::date, $2::jsonb) ON CONFLICT (day) DO NOTHING", [ymd(), before]);
    const saved = await q("UPDATE sa_state SET doc = $1::jsonb, version = version + 1, updated_at = now() WHERE id = 1 AND version = $2 RETURNING version", [
      JSON.stringify(db),
      version,
    ]);
    if (saved.length) return result;
  }
  throw new HttpError(409, "Someone else is saving changes right now. Please try again.");
}

export async function listBackups(): Promise<string[]> {
  if (hosted()) {
    const q = await database();
    const rows = await q("SELECT to_char(day, 'YYYY-MM-DD') AS day FROM sa_backups ORDER BY day DESC");
    return rows.map((r) => `daily-${r.day}`);
  }
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
}

/** All records as JSON, for downloading a backup copy. */
export async function exportJson(): Promise<string> {
  return JSON.stringify(await load(), null, 2);
}

// ---------- uploaded application forms ----------

/** Keep an uploaded PDF until its request is saved; returns the token that links them. */
export async function saveTempUpload(pdf: Buffer): Promise<string> {
  const token = crypto.randomUUID();
  if (hosted()) {
    const q = await database();
    await q("INSERT INTO sa_uploads (id, data) VALUES ($1, $2)", [`tmp-${token}`, pdf.toString("base64")]);
  } else {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    fs.writeFileSync(path.join(UPLOAD_DIR, `tmp-${token}.pdf`), pdf);
  }
  return token;
}

/** Attach an uploaded PDF to its saved request. Safe to repeat. */
export async function attachUpload(token: string, requestId: string): Promise<string> {
  if (!UUID.test(token) || !UUID.test(requestId)) throw new HttpError(400, "Invalid upload reference");
  const name = `${requestId}.pdf`;
  if (hosted()) {
    const q = await database();
    const moved = await q("UPDATE sa_uploads SET id = $2 WHERE id = $1 RETURNING id", [`tmp-${token}`, requestId]);
    if (!moved.length && !(await q("SELECT 1 FROM sa_uploads WHERE id = $1", [requestId])).length) {
      throw new HttpError(400, "The uploaded form was not found; upload it again");
    }
    return name;
  }
  const from = path.join(UPLOAD_DIR, `tmp-${token}.pdf`);
  const to = path.join(UPLOAD_DIR, name);
  if (fs.existsSync(from)) fs.renameSync(from, to);
  else if (!fs.existsSync(to)) throw new HttpError(400, "The uploaded form was not found; upload it again");
  return name;
}

export async function readUpload(requestId: string): Promise<Buffer | null> {
  if (!UUID.test(requestId)) return null;
  if (hosted()) {
    const q = await database();
    const [row] = await q("SELECT data FROM sa_uploads WHERE id = $1", [requestId]);
    return row ? Buffer.from(String(row.data), "base64") : null;
  }
  const file = path.join(UPLOAD_DIR, `${requestId}.pdf`);
  return fs.existsSync(file) ? fs.readFileSync(file) : null;
}

// ---------- validation & migration ----------
type Loose = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? v : v == null ? "" : String(v));
const n = (v: unknown) => (Number.isFinite(Number(v)) ? r2(Number(v)) : 0);

export function normalize(x: unknown): Db {
  if (!x || typeof x !== "object") throw new Error("This is not a salary advance data file");
  const d = x as Loose;
  if (!Array.isArray(d.employees) || !Array.isArray(d.requests)) {
    throw new Error("This is not a salary advance data file (employees/requests missing)");
  }
  if (d.version === 2) {
    const db = d as unknown as Db;
    db.settings = { ...emptyDb().settings, ...(db.settings ?? {}) };
    if (!db.settings.currency) db.settings.currency = "KSH";
    return db;
  }
  return migrateV1(d);
}

/** Convert the original server.js format (version 1) to the current format. */
function migrateV1(d: Loose): Db {
  const settings = (d.settings ?? {}) as Loose;
  const employees: Employee[] = (d.employees as Loose[]).map((e) => {
    const parts = s(e.name).trim().split(/\s+/).filter(Boolean);
    return {
      id: s(e.id),
      staffNo: s(e.staffNo),
      surname: parts.length > 1 ? parts[parts.length - 1] : (parts[0] ?? ""),
      firstNames: parts.length > 1 ? parts.slice(0, -1).join(" ") : "",
      position: s(e.position),
      tel: s(e.phone),
      dateOfEmployment: s(e.employedOn),
      monthlyGross: n(e.gross),
      probationDone: !!e.probationDone,
      contractEndDate: s(e.contractEnd) || null,
      servingNotice: !!e.servingNotice,
    };
  });
  const requests: AdvanceRequest[] = (d.requests as Loose[]).map((r) => {
    const text = s(r.purpose).trim();
    const known = PURPOSES.find((p) => p.toLowerCase() === text.toLowerCase());
    const status = s(r.status);
    const schedule = Array.isArray(r.schedule) ? (r.schedule as Loose[]).map((i) => ({ month: s(i.month), due: n(i.due) })) : [];
    return {
      id: s(r.id),
      employeeId: s(r.employeeId),
      requestedOn: s(r.requestedOn),
      amount: n(r.amount),
      months: Number(r.months) || 1,
      purpose: (known ?? "Other") as Purpose,
      purposeOther: known ? "" : text,
      otherLoans: s(r.otherLoans),
      status: status === "approved" || status === "rejected" ? status : "pending",
      approvedAmount: r.approvedAmount == null ? undefined : n(r.approvedAmount),
      decidedOn: s(r.decidedOn) || undefined,
      decisionNote: s(r.rejectReason || r.note) || undefined,
      startMonth: schedule[0]?.month,
      schedule,
      payments: Array.isArray(r.payments)
        ? (r.payments as Loose[]).map((p) => ({
            id: s(p.id),
            date: s(p.date),
            amount: n(p.amount),
            kind: p.kind === "early" ? ("early" as const) : ("deduction" as const),
            month: s(p.month) || undefined,
            note: s(p.note) || undefined,
          }))
        : [],
    };
  });
  return {
    version: 2,
    settings: {
      companyName: s(settings.companyName) || "Company Name",
      currency: s(settings.currency) || "KSH",
      facilitySize: n(settings.fundSize ?? settings.facilitySize),
    },
    employees,
    requests,
  };
}
