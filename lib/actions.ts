import crypto from "node:crypto";
import type { AdvanceRequest, Db, Employee, Purpose } from "./types";
import { PURPOSES } from "./types";
import { balance, buildSchedule, deductedIn, dueFor, fmtMoney, monthLabel, policyChecks, r2, ymd } from "./calc";

export class HttpError extends Error {
  code: number;
  constructor(code: number, message: string) {
    super(message);
    this.code = code;
  }
}

type Body = Record<string, unknown>;
const need = (cond: unknown, msg: string) => {
  if (!cond) throw new HttpError(400, msg);
};
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown) => r2(Number(v));
const isDate = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const newId = () => crypto.randomUUID();

function findRequest(db: Db, id: unknown): AdvanceRequest {
  const r = db.requests.find((x) => x.id === id);
  if (!r) throw new HttpError(404, "Request not found");
  return r;
}

/** Applies one change to `db`. Returns the id of a request it created, if any. */
export function apply(db: Db, b: Body): string | void {
  const today = ymd();
  switch (b.type) {
    case "saveSettings": {
      const s = (b.settings ?? {}) as Body;
      const facilitySize = num(s.facilitySize || 0);
      need(Number.isFinite(facilitySize) && facilitySize >= 0, "Facility size must be 0 or more");
      db.settings = { companyName: str(s.companyName) || "Company Name", currency: str(s.currency), facilitySize };
      return;
    }

    case "saveEmployee": {
      const x = (b.employee ?? {}) as Body;
      const id = str(x.id);
      const existing = id ? db.employees.find((e) => e.id === id) : undefined;
      need(!id || existing, "Employee not found");
      const e: Employee = {
        id: existing?.id ?? newId(),
        staffNo: str(x.staffNo),
        surname: str(x.surname),
        firstNames: str(x.firstNames),
        position: str(x.position),
        tel: str(x.tel),
        dateOfEmployment: str(x.dateOfEmployment),
        monthlyGross: num(x.monthlyGross),
        probationDone: !!x.probationDone,
        contractEndDate: str(x.contractEndDate) || null,
        servingNotice: !!x.servingNotice,
      };
      need(e.staffNo, "Staff number is required");
      need(e.surname, "Surname is required");
      need(e.monthlyGross > 0, "Monthly gross salary must be greater than 0");
      need(!e.dateOfEmployment || isDate(e.dateOfEmployment), "Invalid date of employment");
      need(!e.contractEndDate || isDate(e.contractEndDate), "Invalid contract end date");
      need(
        !db.employees.some((o) => o.id !== e.id && o.staffNo.toLowerCase() === e.staffNo.toLowerCase()),
        `Staff number ${e.staffNo} is already used`,
      );
      if (existing) Object.assign(existing, e);
      else db.employees.push(e);
      return;
    }

    case "createRequest": {
      const purpose = str(b.purpose) as Purpose;
      const r: AdvanceRequest = {
        id: newId(),
        employeeId: str(b.employeeId),
        requestedOn: isDate(str(b.requestedOn)) ? str(b.requestedOn) : today,
        amount: num(b.amount),
        months: Number(b.months),
        purpose,
        purposeOther: purpose === "Other" ? str(b.purposeOther) : "",
        otherLoans: str(b.otherLoans),
        status: "pending",
        schedule: [],
        payments: [],
      };
      need(db.employees.some((e) => e.id === r.employeeId), "Choose an employee");
      need(r.amount > 0, "Amount must be greater than 0");
      need([1, 2, 3].includes(r.months), "Repayment period must be 1, 2 or 3 months");
      need(PURPOSES.includes(purpose), "Choose a purpose");
      need(purpose !== "Other" || r.purposeOther, "Describe the purpose for 'Other'");
      db.requests.push(r);
      return r.id;
    }

    case "createFromForm": {
      // From an uploaded application form: add the employee (or update them, matched by staff no)
      // and save the request as pending. Nothing is saved unless every part is valid.
      const x = (b.employee ?? {}) as Body;
      const staffNo = str(x.staffNo);
      need(staffNo, "Staff number is required");
      const byStaffNo = (e: Employee) => e.staffNo.toLowerCase() === staffNo.toLowerCase();
      apply(db, { type: "saveEmployee", employee: { ...x, id: db.employees.find(byStaffNo)?.id ?? "" } });
      const emp = db.employees.find(byStaffNo);
      need(emp, "Employee could not be saved");
      const id = apply(db, { ...((b.request ?? {}) as Body), type: "createRequest", employeeId: emp!.id });
      return id;
    }

    case "approve": {
      const r = findRequest(db, b.id);
      need(r.status === "pending", "Only pending requests can be approved");
      const amount = num(b.amount);
      const start = str(b.startMonth);
      need(amount > 0 && amount <= r.amount, "Approved amount must be above 0 and not more than the requested amount");
      need(isMonth(start), "Choose the first deduction month");
      const failing = policyChecks(db, r, amount, today).filter((c) => c.blocking && !c.ok);
      if (failing.length) throw new HttpError(409, `Cannot approve: ${failing.map((c) => c.rule).join("; ")}`);
      Object.assign(r, {
        status: "approved",
        approvedAmount: amount,
        decidedOn: today,
        decisionNote: str(b.note) || undefined,
        startMonth: start,
        schedule: buildSchedule(amount, r.months, start),
      });
      return;
    }

    case "reject": {
      const r = findRequest(db, b.id);
      need(r.status === "pending", "Only pending requests can be rejected");
      const note = str(b.note);
      need(note, "Add a note explaining the rejection");
      Object.assign(r, { status: "rejected", decidedOn: today, decisionNote: note });
      return;
    }

    case "recordDeduction": {
      const r = findRequest(db, b.id);
      const month = str(b.month);
      need(isMonth(month), "Invalid payroll month");
      need(r.status === "approved" && balance(r) > 0, "This advance is not being repaid");
      need(!deductedIn(r, month), `A deduction is already recorded for ${monthLabel(month)}`);
      const due = dueFor(r, month);
      need(due > 0, `Nothing is due for ${monthLabel(month)}`);
      r.payments.push({ id: newId(), date: today, amount: due, kind: "deduction", month });
      return;
    }

    case "earlyRepayment": {
      const r = findRequest(db, b.id);
      need(r.status === "approved", "This advance is not active");
      const amount = num(b.amount);
      const bal = balance(r);
      need(amount > 0, "Amount must be greater than 0");
      need(amount <= bal, `Amount is more than the balance of ${fmtMoney(bal, db.settings.currency)}`);
      const date = str(b.date);
      r.payments.push({
        id: newId(),
        date: isDate(date) ? date : today,
        amount,
        kind: "early",
        note: str(b.note) || undefined,
      });
      return;
    }

    default:
      throw new HttpError(400, "Unknown action");
  }
}
