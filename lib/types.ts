export type Purpose = "Education" | "Medical" | "Personal" | "Other";
export const PURPOSES: Purpose[] = ["Education", "Medical", "Personal", "Other"];

export interface Settings {
  companyName: string;
  currency: string;
  /** Total advance facility; 0 = not set. */
  facilitySize: number;
}

export interface Employee {
  id: string;
  staffNo: string;
  surname: string;
  firstNames: string;
  position: string;
  tel: string;
  /** YYYY-MM-DD */
  dateOfEmployment: string;
  monthlyGross: number;
  probationDone: boolean;
  /** YYYY-MM-DD, or null for permanent staff */
  contractEndDate: string | null;
  servingNotice: boolean;
}

export interface Payment {
  id: string;
  /** YYYY-MM-DD the payment was recorded */
  date: string;
  amount: number;
  kind: "deduction" | "early";
  /** Payroll month (YYYY-MM) for salary deductions */
  month?: string;
  note?: string;
}

export interface Instalment {
  /** YYYY-MM */
  month: string;
  due: number;
}

export interface AdvanceRequest {
  id: string;
  employeeId: string;
  requestedOn: string;
  amount: number;
  months: number;
  purpose: Purpose;
  purposeOther: string;
  otherLoans: string;
  status: "pending" | "approved" | "rejected";
  approvedAmount?: number;
  decidedOn?: string;
  decisionNote?: string;
  startMonth?: string;
  schedule: Instalment[];
  payments: Payment[];
  /** File name in data/uploads of the uploaded application form, if any */
  sourceFile?: string;
}

export interface Db {
  version: 2;
  settings: Settings;
  employees: Employee[];
  requests: AdvanceRequest[];
}

export interface Check {
  rule: string;
  ok: boolean;
  detail: string;
  /** Blocking checks must all pass before Approve is allowed. */
  blocking: boolean;
}

export interface AppState {
  db: Db;
  today: string;
  backups: string[];
}
