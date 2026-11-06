import type { AdvanceRequest, Check, Db, Employee, Instalment } from "./types";

// ---------- numbers & dates ----------
export const r2 = (x: number) => Math.round(x * 100) / 100;

const pad = (n: number) => String(n).padStart(2, "0");
/** Payroll dates follow East Africa Time, also when the server runs on UTC. */
export const TIME_ZONE = "Africa/Nairobi";
const todayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" });

/** YYYY-MM-DD: today in East Africa Time, or the calendar date of `d`. */
export function ymd(d?: Date) {
  if (!d) return todayFmt.format(new Date());
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export const thisMonth = () => ymd().slice(0, 7);

export function addMonths(ym: string, n: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function addMonthsToDate(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return ymd(new Date(y, m - 1 + n, d));
}

export function fmtMoney(n: number, currency = "") {
  const s = (n || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency ? `${currency} ${s}` : s;
}
export function monthLabel(ym: string, style: "short" | "long" = "short") {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: style, year: "numeric" });
}
export function dateLabel(date?: string | null) {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export const fullName = (e?: Employee) => (e ? `${e.firstNames} ${e.surname}`.trim() : "Unknown employee");

// ---------- repayment maths ----------
/** Equal monthly deductions; the last instalment absorbs rounding cents. */
export function buildSchedule(amount: number, months: number, startMonth: string): Instalment[] {
  const each = Math.floor((amount / months) * 100) / 100;
  return Array.from({ length: months }, (_, i) => ({
    month: addMonths(startMonth, i),
    due: i === months - 1 ? r2(amount - each * (months - 1)) : each,
  }));
}

export const paidTotal = (r: AdvanceRequest) => r2(r.payments.reduce((s, p) => s + p.amount, 0));
export const balance = (r: AdvanceRequest) =>
  r.status === "approved" ? Math.max(0, r2((r.approvedAmount ?? 0) - paidTotal(r))) : 0;
export const isActive = (r: AdvanceRequest) => balance(r) > 0;

const dueThrough = (r: AdvanceRequest, ym: string) =>
  r2(r.schedule.filter((s) => s.month <= ym).reduce((s, x) => s + x.due, 0));

/** Amount to deduct in payroll month `ym`: scheduled-to-date minus paid, including any arrears. */
export function dueFor(r: AdvanceRequest, ym: string) {
  if (r.status !== "approved") return 0;
  return Math.max(0, r2(Math.min(balance(r), dueThrough(r, ym) - paidTotal(r))));
}
export const deductedIn = (r: AdvanceRequest, ym: string) =>
  r.payments.some((p) => p.kind === "deduction" && p.month === ym);

/** Overdue = an instalment from a month before `ym` is still unpaid. */
export const isOverdue = (r: AdvanceRequest, ym: string) => dueFor(r, addMonths(ym, -1)) > 0;

export const outstanding = (db: Db) => r2(db.requests.reduce((s, r) => s + balance(r), 0));

export type InstalmentState = "paid" | "overdue" | "due" | "upcoming";
export function instalmentState(r: AdvanceRequest, ym: string, payrollMonth: string): InstalmentState {
  if (dueThrough(r, ym) <= paidTotal(r) + 0.001) return "paid";
  if (ym < payrollMonth) return "overdue";
  if (ym === payrollMonth) return "due";
  return "upcoming";
}

export function requestStatus(r: AdvanceRequest): "pending" | "active" | "repaid" | "rejected" {
  if (r.status === "pending") return "pending";
  if (r.status === "rejected") return "rejected";
  return balance(r) > 0 ? "active" : "repaid";
}

// ---------- Salary Advance Policy ----------
export const MAX_MONTHS = 3;
export const MAX_PER_YEAR = 3;

/**
 * Policy checks for approving `req` at `amount` on `today`.
 * Every blocking check must pass before the advance can be approved.
 */
export function policyChecks(
  db: Db,
  req: Pick<AdvanceRequest, "id" | "employeeId" | "months">,
  amount: number,
  today: string,
): Check[] {
  const cur = db.settings.currency;
  const e = db.employees.find((x) => x.id === req.employeeId);
  if (!e) return [{ rule: "Employee on file", ok: false, detail: "Employee record not found", blocking: true }];

  const year = today.slice(0, 4);
  const others = db.requests.filter((r) => r.employeeId === e.id && r.id !== req.id);
  const approvedThisYear = others.filter((r) => r.status === "approved" && (r.decidedOn ?? "").startsWith(year)).length;
  const active = others.filter(isActive);
  const limit = r2(e.monthlyGross / 3);
  const cutoff = addMonthsToDate(today, 3);
  const months = Number(req.months);
  const validMonths = Number.isInteger(months) && months >= 1 && months <= MAX_MONTHS;
  const instalment = validMonths && amount > 0 ? buildSchedule(amount, months, "2000-01")[0].due : 0;

  const checks: Check[] = [
    {
      rule: "Amount is at most 1/3 of monthly gross salary",
      ok: amount > 0 && amount <= limit,
      detail: `${fmtMoney(amount, cur)} against a limit of ${fmtMoney(limit, cur)}`,
      blocking: true,
    },
    {
      rule: "Repaid within 3 months by equal monthly deductions",
      ok: validMonths,
      detail: validMonths ? `${months} × ${fmtMoney(instalment, cur)}` : "Repayment period must be 1–3 months",
      blocking: true,
    },
    {
      rule: "No more than 3 advances in the calendar year",
      ok: approvedThisYear < MAX_PER_YEAR,
      detail: `${approvedThisYear} already approved in ${year}`,
      blocking: true,
    },
    {
      rule: "Only one active advance at a time (no top-ups)",
      ok: active.length === 0,
      detail: active.length
        ? `Still repaying ${fmtMoney(active.reduce((s, r) => s + balance(r), 0), cur)}`
        : "No advance being repaid",
      blocking: true,
    },
    {
      rule: "Probation period completed",
      ok: e.probationDone,
      detail: e.probationDone ? "Completed" : "Still on probation",
      blocking: true,
    },
    {
      rule: "Not serving notice",
      ok: !e.servingNotice,
      detail: e.servingNotice ? "Employee is serving notice" : "Not serving notice",
      blocking: true,
    },
    {
      rule: "Contract has more than 3 months left",
      ok: !e.contractEndDate || e.contractEndDate > cutoff,
      detail: e.contractEndDate ? `Contract ends ${dateLabel(e.contractEndDate)}` : "Permanent / no end date",
      blocking: true,
    },
  ];

  if (db.settings.facilitySize > 0) {
    const remaining = r2(db.settings.facilitySize - outstanding(db));
    checks.push({
      rule: "Within the remaining advance facility",
      ok: amount <= remaining,
      detail: `${fmtMoney(remaining, cur)} of ${fmtMoney(db.settings.facilitySize, cur)} remaining`,
      blocking: false,
    });
  }
  return checks;
}
