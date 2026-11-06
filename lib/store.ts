import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AdvanceRequest, Db, Employee, Purpose } from "./types";
import { PURPOSES } from "./types";
import { r2, ymd } from "./calc";

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

function writeAtomic(db: Db) {
  const tmp = `${DB_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE); // a crash never leaves a half-written data file
}

/** One copy of the data file per day, taken before the first change of the day. Never pruned. */
function dailyBackup() {
  if (!fs.existsSync(DB_FILE)) return;
  const target = path.join(BACKUP_DIR, `daily-${ymd()}.json`);
  if (!fs.existsSync(target)) fs.copyFileSync(DB_FILE, target);
}

export function load(): Db {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const start = fs.existsSync(LEGACY_FILE) ? normalize(JSON.parse(fs.readFileSync(LEGACY_FILE, "utf8"))) : emptyDb();
    writeAtomic(start);
  }
  dailyBackup();
  return normalize(JSON.parse(fs.readFileSync(DB_FILE, "utf8")));
}

export function save(db: Db) {
  dailyBackup();
  writeAtomic(db);
}

export function listBackups(): string[] {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
}

export function readBackup(name: string): unknown {
  if (!/^[\w.-]+\.json$/.test(name)) throw new Error("Invalid backup name");
  const file = path.join(BACKUP_DIR, path.basename(name));
  if (!fs.existsSync(file)) throw new Error("Backup not found");
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

export function currentFileText(): string {
  load();
  return fs.readFileSync(DB_FILE, "utf8");
}

/** Replace the data with `incoming`. The current data is copied to a pre-restore backup first. */
export function restore(incoming: unknown) {
  const db = normalize(incoming);
  load();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `pre-restore-${stamp}.json`));
  writeAtomic(db);
}

// ---------- uploaded application forms ----------

/** Keep an uploaded PDF until its request is saved; returns the token that links them. */
export function saveTempUpload(pdf: Buffer): string {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const token = crypto.randomUUID();
  fs.writeFileSync(path.join(UPLOAD_DIR, `tmp-${token}.pdf`), pdf);
  return token;
}

/** Attach an uploaded PDF to its saved request. */
export function attachUpload(token: string, requestId: string): string {
  if (!UUID.test(token) || !UUID.test(requestId)) throw new Error("Invalid upload reference");
  const from = path.join(UPLOAD_DIR, `tmp-${token}.pdf`);
  if (!fs.existsSync(from)) throw new Error("The uploaded form was not found; upload it again");
  const name = `${requestId}.pdf`;
  fs.renameSync(from, path.join(UPLOAD_DIR, name));
  return name;
}

export function readUpload(requestId: string): Buffer | null {
  if (!UUID.test(requestId)) return null;
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
