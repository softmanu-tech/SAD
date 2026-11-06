"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  CircleCheck,
  CircleX,
  FileText,
  FileUp,
  HandCoins,
  Pencil,
  Plus,
  Printer,
  TriangleAlert,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  balance,
  buildSchedule,
  dateLabel,
  deductedIn,
  dueFor,
  fmtMoney,
  fullName,
  instalmentState,
  isActive,
  isOverdue,
  monthLabel,
  outstanding,
  paidTotal,
  policyChecks,
  r2,
  requestStatus,
} from "@/lib/calc";
import type { ParseResult } from "@/lib/parse-form";
import type { AdvanceRequest, AppState, Check, Db, Employee, Purpose } from "@/lib/types";
import { PURPOSES } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "dashboard" | "requests" | "employees";
type Upload = ParseResult & { token: string; fileName: string };
type Dlg =
  | { kind: "employee"; emp?: Employee }
  | { kind: "new-request"; employeeId?: string }
  | { kind: "from-form"; upload: Upload }
  | { kind: "review"; id: string }
  | { kind: "advance"; id: string }
  | null;
type Run = (body: Record<string, unknown>) => Promise<string | null>;

interface Ctx {
  state: AppState;
  month: string;
  money: (n: number) => string;
  emp: (id: string) => Employee | undefined;
  run: Run;
  open: (d: Dlg) => void;
  deduct: (id: string) => void;
  notify: (msg: string) => void;
}

const selectCls =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";
const textareaCls =
  "min-h-16 w-full rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

async function api(body: Record<string, unknown>): Promise<AppState> {
  const res = await fetch("/api/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data as AppState;
}

export function SalaryApp() {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [banner, setBanner] = useState("");
  const [tab, setTab] = useState<Tab>("dashboard");
  const [monthPick, setMonthPick] = useState<string | null>(null);
  const [dlg, setDlg] = useState<Dlg>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/state", { cache: "no-store" })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Could not load data");
        return d as AppState;
      })
      .then((d) => alive && setState(d))
      .catch((e: Error) => alive && setLoadError(e.message));
    return () => {
      alive = false;
    };
  }, []);

  if (!state) {
    return <div className="p-8 text-sm text-muted-foreground">{loadError || "Loading…"}</div>;
  }

  const { db } = state;
  const month = monthPick ?? state.today.slice(0, 7);
  const run: Run = async (body) => {
    try {
      setState(await api(body));
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const ctx: Ctx = {
    state,
    month,
    money: (n) => fmtMoney(n, db.settings.currency),
    emp: (id) => db.employees.find((e) => e.id === id),
    run,
    open: setDlg,
    deduct: async (id) => {
      const err = await run({ type: "recordDeduction", id, month });
      setBanner(err ?? "");
    },
    notify: setBanner,
  };
  const close = () => setDlg(null);
  const pendingCount = db.requests.filter((r) => r.status === "pending").length;

  const tabs: { id: Tab; label: string }[] = [
    { id: "dashboard", label: "Dashboard" },
    { id: "requests", label: `Requests${pendingCount ? ` (${pendingCount})` : ""}` },
    { id: "employees", label: "Employees" },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local .ico asset, no optimisation needed */}
          <img src="/sensys-logo.ico" alt="" width={64} height={51} className="h-12 w-auto" />
          <h1 className="text-2xl font-semibold tracking-tight">Salary Advance Manager</h1>
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          Payroll month
          <Input
            type="month"
            className="w-44"
            value={month}
            onChange={(e) => e.target.value && setMonthPick(e.target.value)}
          />
        </label>
      </header>

      <nav className="mb-6 flex gap-1 overflow-x-auto overflow-y-hidden border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors",
              tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {banner && (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{banner}</span>
          <button onClick={() => setBanner("")} aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      )}

      {tab === "dashboard" && <Dashboard ctx={ctx} />}
      {tab === "requests" && <Requests ctx={ctx} />}
      {tab === "employees" && <Employees ctx={ctx} />}

      {dlg?.kind === "employee" && <EmployeeDialog key={dlg.emp?.id ?? "new"} ctx={ctx} emp={dlg.emp} onClose={close} />}
      {dlg?.kind === "new-request" && <NewRequestDialog ctx={ctx} employeeId={dlg.employeeId} onClose={close} />}
      {dlg?.kind === "from-form" && <FromFormDialog key={dlg.upload.token} ctx={ctx} upload={dlg.upload} onClose={close} />}
      {dlg?.kind === "review" && <ReviewDialog key={dlg.id} ctx={ctx} id={dlg.id} onClose={close} />}
      {dlg?.kind === "advance" && <AdvanceDialog key={dlg.id} ctx={ctx} id={dlg.id} onClose={close} />}
    </div>
  );
}

// ---------------------------------------------------------------- shared bits

function Stat({ icon: Icon, label, value, sub, tone }: { icon: typeof Wallet; label: string; value: string; sub?: string; tone?: "warn" }) {
  return (
    <Card size="sm">
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="size-4" />
          {label}
        </div>
        <div className={cn("text-xl font-semibold tabular-nums", tone === "warn" && "text-destructive")}>{value}</div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: string }) {
  const hasRows = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {head.map((h, i) => (
              <th key={i} className={cn("px-2 py-2 font-medium whitespace-nowrap", /amount|balance|instalment|gross|paid|due|approved|limit/i.test(h) && "text-right")}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_td]:px-2 [&_td]:py-2 [&_tr]:border-b [&_tr:last-child]:border-0">
          {hasRows ? children : (
            <tr>
              <td colSpan={head.length} className="py-6 text-center text-muted-foreground">
                {empty ?? "Nothing here yet."}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

const Num = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <td className={cn("text-right tabular-nums whitespace-nowrap", className)}>{children}</td>
);

function StatusBadge({ r, month }: { r: AdvanceRequest; month: string }) {
  const s = requestStatus(r);
  if (s === "pending") return <Badge variant="warning">Pending</Badge>;
  if (s === "rejected") return <Badge variant="destructive">Rejected</Badge>;
  if (s === "repaid") return <Badge variant="secondary">Repaid</Badge>;
  return isOverdue(r, month) ? <Badge variant="destructive">Overdue</Badge> : <Badge>Active</Badge>;
}

function ChecksList({ checks }: { checks: Check[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {checks.map((c) => (
        <li key={c.rule} className="flex items-start gap-2">
          {c.ok ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-primary" />
          ) : c.blocking ? (
            <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
          )}
          <div>
            <div className={cn("font-medium", !c.ok && c.blocking && "text-destructive")}>{c.rule}</div>
            <div className="text-xs text-muted-foreground">
              {c.detail}
              {!c.ok && !c.blocking && " · warning only"}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

const ErrorText = ({ msg }: { msg: string }) =>
  msg ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{msg}</p> : null;

const PrintLink = ({ id }: { id: string }) => (
  <Button variant="ghost" size="icon-sm" title="Print loan application form" render={<a href={`/print/${id}`} target="_blank" rel="noopener" />} nativeButton={false}>
    <Printer />
  </Button>
);

// ---------------------------------------------------------------- dashboard

function Dashboard({ ctx }: { ctx: Ctx }) {
  const { db } = ctx.state;
  const { month, money } = ctx;
  const pending = db.requests.filter((r) => r.status === "pending");
  const active = db.requests.filter(isActive);
  const total = outstanding(db);
  const due = active
    .map((r) => ({ r, amount: dueFor(r, month), done: deductedIn(r, month) }))
    .filter((x) => x.amount > 0 || x.done);
  const dueTotal = r2(due.filter((x) => !x.done).reduce((s, x) => s + x.amount, 0));
  const overdue = active.filter((r) => isOverdue(r, month)).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat icon={CalendarClock} label="Pending requests" value={String(pending.length)} sub="awaiting a decision" />
        <Stat icon={HandCoins} label="Active advances" value={String(active.length)} sub={overdue ? `${overdue} overdue` : "none overdue"} tone={overdue ? "warn" : undefined} />
        <Stat icon={Wallet} label="Total outstanding" value={money(total)} />
        <Stat icon={Users} label={`Due in ${monthLabel(month)}`} value={money(dueTotal)} sub={`${due.filter((x) => !x.done).length} to deduct`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Due for deduction — {monthLabel(month, "long")}</CardTitle>
          <CardDescription>Record each salary deduction when this month&apos;s payroll is run. Amounts include any arrears.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table head={["Staff no", "Name", "Instalment", "Balance", "", ""]} empty="No deductions due this payroll month.">
            {due.map(({ r, amount, done }) => {
              const e = ctx.emp(r.employeeId);
              return (
                <tr key={r.id}>
                  <td>{e?.staffNo}</td>
                  <td>
                    <button className="font-medium hover:underline" onClick={() => ctx.open({ kind: "advance", id: r.id })}>
                      {fullName(e)}
                    </button>
                  </td>
                  <Num>{done ? "—" : money(amount)}</Num>
                  <Num>{money(balance(r))}</Num>
                  <td>{isOverdue(r, month) && <Badge variant="destructive">Overdue</Badge>}</td>
                  <td className="text-right">
                    {done ? (
                      <Badge variant="secondary">
                        <CircleCheck /> Deducted
                      </Badge>
                    ) : (
                      <Button size="sm" onClick={() => ctx.deduct(r.id)}>
                        Record deduction
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>Pending requests</CardTitle>
            <UploadButton ctx={ctx} size="sm" />
          </CardHeader>
          <CardContent>
            <Table head={["Name", "Amount", "Policy", ""]} empty="No pending requests.">
              {pending.map((r) => {
                const failing = policyChecks(db, r, r.amount, ctx.state.today).filter((c) => c.blocking && !c.ok).length;
                return (
                  <tr key={r.id}>
                    <td>
                      <div className="font-medium">{fullName(ctx.emp(r.employeeId))}</div>
                      <div className="text-xs text-muted-foreground">{dateLabel(r.requestedOn)}</div>
                    </td>
                    <Num>{money(r.amount)}</Num>
                    <td>{failing ? <Badge variant="destructive">{failing} rule{failing > 1 ? "s" : ""} failing</Badge> : <Badge variant="secondary">All rules pass</Badge>}</td>
                    <td className="text-right">
                      <Button size="sm" variant="outline" onClick={() => ctx.open({ kind: "review", id: r.id })}>
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Active advances</CardTitle>
          </CardHeader>
          <CardContent>
            <Table head={["Name", "Approved", "Balance", ""]} empty="No advances being repaid.">
              {active.map((r) => (
                <tr key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => ctx.open({ kind: "advance", id: r.id })}>
                  <td className="font-medium">{fullName(ctx.emp(r.employeeId))}</td>
                  <Num>{money(r.approvedAmount ?? 0)}</Num>
                  <Num className="font-medium">{money(balance(r))}</Num>
                  <td className="text-right">
                    <StatusBadge r={r} month={month} />
                  </td>
                </tr>
              ))}
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- requests

function Requests({ ctx }: { ctx: Ctx }) {
  const { db } = ctx.state;
  const [filter, setFilter] = useState<"all" | "pending" | "active" | "repaid" | "rejected">("all");
  const rows = [...db.requests]
    .filter((r) => filter === "all" || requestStatus(r) === filter)
    .sort((a, b) => b.requestedOn.localeCompare(a.requestedOn));

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Advance requests</CardTitle>
        <div className="flex gap-2">
          <select className={cn(selectCls, "w-36")} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All</option>
            <option value="pending">Pending</option>
            <option value="active">Active</option>
            <option value="repaid">Repaid</option>
            <option value="rejected">Rejected</option>
          </select>
          <UploadButton ctx={ctx} />
          <Button variant="outline" onClick={() => ctx.open({ kind: "new-request" })} disabled={!db.employees.length}>
            <Plus /> Type in a request
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table
          head={["Requested", "Staff no", "Name", "Amount", "Approved", "Months", "Purpose", "Status", ""]}
          empty="No requests yet. Upload an employee's loan application form to start."
        >
          {rows.map((r) => {
            const e = ctx.emp(r.employeeId);
            return (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{dateLabel(r.requestedOn)}</td>
                <td>{e?.staffNo}</td>
                <td className="font-medium">{fullName(e)}</td>
                <Num>{ctx.money(r.amount)}</Num>
                <Num>{r.status === "approved" ? ctx.money(r.approvedAmount ?? 0) : "—"}</Num>
                <td className="text-center">{r.months}</td>
                <td>{r.purpose === "Other" ? `Other: ${r.purposeOther}` : r.purpose}</td>
                <td>
                  <StatusBadge r={r} month={ctx.month} />
                </td>
                <td className="text-right whitespace-nowrap">
                  {r.status === "pending" ? (
                    <Button size="sm" variant="outline" onClick={() => ctx.open({ kind: "review", id: r.id })}>
                      Review
                    </Button>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => ctx.open({ kind: "advance", id: r.id })}>
                      Open
                    </Button>
                  )}
                  {r.sourceFile && <OriginalLink id={r.id} icon />}
                  <PrintLink id={r.id} />
                </td>
              </tr>
            );
          })}
        </Table>
      </CardContent>
    </Card>
  );
}

function NewRequestDialog({ ctx, employeeId, onClose }: { ctx: Ctx; employeeId?: string; onClose: () => void }) {
  const { db, today } = ctx.state;
  const [f, setF] = useState({
    employeeId: employeeId ?? "",
    requestedOn: today,
    amount: "",
    months: "3",
    purpose: "" as Purpose | "",
    purposeOther: "",
    otherLoans: "",
  });
  const [err, setErr] = useState("");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  const amount = Number(f.amount) || 0;
  const e = ctx.emp(f.employeeId);
  const checks = e ? policyChecks(db, { id: "", employeeId: e.id, months: Number(f.months) }, amount, today) : [];
  const sorted = [...db.employees].sort((a, b) => a.surname.localeCompare(b.surname));

  const submit = async () => {
    const msg = await ctx.run({ type: "createRequest", ...f });
    if (msg) setErr(msg);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>New salary advance request</DialogTitle>
          <DialogDescription>Saved as pending. Approval happens from the review screen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Employee" className="sm:col-span-2">
            <select className={selectCls} value={f.employeeId} onChange={set("employeeId")}>
              <option value="">Choose…</option>
              {sorted.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.surname}, {x.firstNames} ({x.staffNo})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Requested amount">
            <Input type="number" min="0" step="0.01" value={f.amount} onChange={set("amount")} />
            {e && <span className="text-xs text-muted-foreground">Maximum {ctx.money(r2(e.monthlyGross / 3))} (1/3 of {ctx.money(e.monthlyGross)})</span>}
          </Field>
          <Field label="Repayment (equal monthly salary deductions)">
            <select className={selectCls} value={f.months} onChange={set("months")}>
              {[1, 2, 3].map((m) => (
                <option key={m} value={m}>
                  {m} month{m > 1 ? "s" : ""}
                  {amount > 0 ? ` · ${ctx.money(buildSchedule(amount, m, "2000-01")[0].due)} / month` : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date of application">
            <Input type="date" value={f.requestedOn} onChange={set("requestedOn")} />
          </Field>
          <Field label="Purpose" className="sm:col-span-2">
            <div className="flex flex-wrap gap-4">
              {PURPOSES.map((p) => (
                <label key={p} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="purpose" className="accent-primary" checked={f.purpose === p} onChange={() => setF({ ...f, purpose: p })} />
                  {p}
                </label>
              ))}
            </div>
            {f.purpose === "Other" && <Input placeholder="Please specify" value={f.purposeOther} onChange={set("purposeOther")} />}
          </Field>
          <Field label="Other outstanding loans" className="sm:col-span-2">
            <textarea className={textareaCls} placeholder="e.g. none, or bank loan 20,000 at 2,000/month" value={f.otherLoans} onChange={set("otherLoans")} />
          </Field>
        </div>
        {e && (
          <div className="rounded-lg border p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Policy check preview</div>
            <ChecksList checks={checks} />
          </div>
        )}
        <ErrorText msg={err} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save as pending</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmployeeSummary({ ctx, e }: { ctx: Ctx; e?: Employee }) {
  if (!e) return null;
  const items: [string, string][] = [
    ["Staff no", e.staffNo],
    ["Position", e.position],
    ["Tel", e.tel],
    ["Employed", dateLabel(e.dateOfEmployment)],
    ["Monthly gross", ctx.money(e.monthlyGross)],
    ["Contract ends", e.contractEndDate ? dateLabel(e.contractEndDate) : "Permanent"],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg bg-muted/50 p-3 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt className="text-xs text-muted-foreground">{k}</dt>
          <dd className="font-medium">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function ReviewDialog({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const { db, today } = ctx.state;
  const r = db.requests.find((x) => x.id === id);
  const [amount, setAmount] = useState(String(r?.amount ?? ""));
  const [start, setStart] = useState(ctx.month);
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  if (!r) return null;
  const e = ctx.emp(r.employeeId);
  const amt = r2(Number(amount) || 0);
  const checks = policyChecks(db, r, amt, today);
  if (amt > r.amount) {
    checks.unshift({ rule: "Approved amount not above the requested amount", ok: false, detail: `Requested ${ctx.money(r.amount)}`, blocking: true });
  }
  const blocked = checks.some((c) => c.blocking && !c.ok);
  const schedule = amt > 0 && start ? buildSchedule(amt, r.months, start) : [];

  const act = async (type: "approve" | "reject") => {
    if (type === "reject" && !note.trim()) return setErr("Add a note explaining why the request is rejected.");
    const msg = await ctx.run({ type, id: r.id, amount: amt, startMonth: start, note });
    if (msg) setErr(msg);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review request — {fullName(e)}</DialogTitle>
          <DialogDescription>
            {ctx.money(r.amount)} over {r.months} month{r.months > 1 ? "s" : ""} · {r.purpose === "Other" ? `Other: ${r.purposeOther}` : r.purpose} · applied{" "}
            {dateLabel(r.requestedOn)}
          </DialogDescription>
        </DialogHeader>
        <EmployeeSummary ctx={ctx} e={e} />
        {r.otherLoans && (
          <p className="text-sm">
            <span className="text-muted-foreground">Other outstanding loans: </span>
            {r.otherLoans}
          </p>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Approved amount (may be lower)">
            <Input type="number" min="0" step="0.01" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
          </Field>
          <Field label="First deduction month">
            <Input type="month" value={start} onChange={(ev) => setStart(ev.target.value)} />
          </Field>
        </div>
        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Salary Advance Policy checks</div>
          <ChecksList checks={checks} />
        </div>
        {schedule.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Deductions: {schedule.map((s) => `${monthLabel(s.month)} ${ctx.money(s.due)}`).join(" · ")}
          </p>
        )}
        <Field label="Note (required to reject)">
          <textarea className={textareaCls} value={note} onChange={(ev) => setNote(ev.target.value)} />
        </Field>
        <ErrorText msg={err} />
        <DialogFooter className="sm:justify-between">
          <div className="flex gap-1">
            {r.sourceFile && <OriginalLink id={r.id} />}
            <Button variant="ghost" render={<a href={`/print/${r.id}`} target="_blank" rel="noopener" />} nativeButton={false}>
              <Printer /> Print form
            </Button>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="destructive" onClick={() => act("reject")}>
              Reject
            </Button>
            <Button onClick={() => act("approve")} disabled={blocked} title={blocked ? "Every policy rule must pass before approval" : undefined}>
              Approve {amt > 0 ? ctx.money(amt) : ""}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AdvanceDialog({ ctx, id, onClose }: { ctx: Ctx; id: string; onClose: () => void }) {
  const { db, today } = ctx.state;
  const r = db.requests.find((x) => x.id === id);
  const [early, setEarly] = useState({ amount: "", date: today, note: "" });
  const [err, setErr] = useState("");
  if (!r) return null;
  const e = ctx.emp(r.employeeId);
  const bal = balance(r);
  const dueNow = dueFor(r, ctx.month);
  const done = deductedIn(r, ctx.month);

  const pay = async () => {
    const msg = await ctx.run({ type: "earlyRepayment", id: r.id, ...early, amount: Number(early.amount) });
    setErr(msg ?? "");
    if (!msg) setEarly({ amount: "", date: today, note: "" });
  };
  const deduct = async () => setErr((await ctx.run({ type: "recordDeduction", id: r.id, month: ctx.month })) ?? "");

  const stateBadge = {
    paid: <Badge variant="secondary">Paid</Badge>,
    overdue: <Badge variant="destructive">Overdue</Badge>,
    due: <Badge variant="warning">Due</Badge>,
    upcoming: <Badge variant="outline">Upcoming</Badge>,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {fullName(e)} <StatusBadge r={r} month={ctx.month} />
          </DialogTitle>
          <DialogDescription>
            Applied {dateLabel(r.requestedOn)} for {ctx.money(r.amount)}
            {r.decidedOn && ` · ${r.status} ${dateLabel(r.decidedOn)}`}
          </DialogDescription>
        </DialogHeader>
        {r.decisionNote && <p className="rounded-lg bg-muted/50 p-3 text-sm">Note: {r.decisionNote}</p>}
        {r.status === "approved" && (
          <>
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={HandCoins} label="Approved" value={ctx.money(r.approvedAmount ?? 0)} />
              <Stat icon={CircleCheck} label="Paid" value={ctx.money(paidTotal(r))} />
              <Stat icon={Wallet} label="Balance" value={ctx.money(bal)} tone={isOverdue(r, ctx.month) ? "warn" : undefined} />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Repayment schedule</div>
              <Table head={["Payroll month", "Instalment", ""]}>
                {r.schedule.map((s) => (
                  <tr key={s.month}>
                    <td>{monthLabel(s.month, "long")}</td>
                    <Num>{ctx.money(s.due)}</Num>
                    <td className="text-right">{stateBadge[instalmentState(r, s.month, ctx.month)]}</td>
                  </tr>
                ))}
              </Table>
            </div>
            {bal > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3">
                <span className="text-sm">
                  {done
                    ? `Deduction recorded for ${monthLabel(ctx.month)}.`
                    : dueNow > 0
                      ? `${ctx.money(dueNow)} due in ${monthLabel(ctx.month)}.`
                      : `Nothing due in ${monthLabel(ctx.month)}.`}
                </span>
                <Button size="sm" onClick={deduct} disabled={done || dueNow <= 0}>
                  Record deduction
                </Button>
              </div>
            )}
            {bal > 0 && (
              <div className="rounded-lg border p-3">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Early repayment</div>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_2fr_auto]">
                  <Input type="number" min="0" step="0.01" placeholder="Amount" value={early.amount} onChange={(ev) => setEarly({ ...early, amount: ev.target.value })} />
                  <Input type="date" value={early.date} onChange={(ev) => setEarly({ ...early, date: ev.target.value })} />
                  <Input placeholder="Note (e.g. cash, M-Pesa ref)" value={early.note} onChange={(ev) => setEarly({ ...early, note: ev.target.value })} />
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-8" onClick={() => setEarly({ ...early, amount: String(bal) })}>
                      Full
                    </Button>
                    <Button size="sm" className="h-8" onClick={pay}>
                      Record
                    </Button>
                  </div>
                </div>
              </div>
            )}
            <div>
              <div className="mb-1 text-xs font-medium text-muted-foreground">Payments</div>
              <Table head={["Date", "Type", "Amount"]} empty="No payments yet.">
                {r.payments.map((p) => (
                  <tr key={p.id}>
                    <td>{dateLabel(p.date)}</td>
                    <td>
                      {p.kind === "deduction" ? `Salary deduction · ${monthLabel(p.month ?? "")}` : "Early repayment"}
                      {p.note && <span className="text-muted-foreground"> · {p.note}</span>}
                    </td>
                    <Num>{ctx.money(p.amount)}</Num>
                  </tr>
                ))}
              </Table>
            </div>
          </>
        )}
        <ErrorText msg={err} />
        <DialogFooter>
          {r.sourceFile && <OriginalLink id={r.id} />}
          <Button variant="outline" render={<a href={`/print/${r.id}`} target="_blank" rel="noopener" />} nativeButton={false}>
            <Printer /> Print form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- employees

function eligibility(ctx: Ctx, e: Employee) {
  const checks = policyChecks(ctx.state.db, { id: "", employeeId: e.id, months: 1 }, 0.01, ctx.state.today);
  return checks.filter((c) => c.blocking && !c.ok && !c.rule.startsWith("Amount"));
}

function Employees({ ctx }: { ctx: Ctx }) {
  const { db } = ctx.state;
  const [q, setQ] = useState("");
  const rows = [...db.employees]
    .filter((e) => `${e.staffNo} ${e.surname} ${e.firstNames} ${e.position}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.surname.localeCompare(b.surname));

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle>Employees</CardTitle>
        <div className="flex gap-2">
          <Input placeholder="Search…" className="w-48" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button onClick={() => ctx.open({ kind: "employee" })}>
            <Plus /> Add employee
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table head={["Staff no", "Surname", "First names", "Position", "Tel", "D.O.E", "Monthly gross", "Limit (1/3)", "Eligibility", ""]} empty="No employees yet.">
          {rows.map((e) => {
            const issues = eligibility(ctx, e);
            return (
              <tr key={e.id}>
                <td>{e.staffNo}</td>
                <td className="font-medium">{e.surname}</td>
                <td>{e.firstNames}</td>
                <td>{e.position}</td>
                <td className="whitespace-nowrap">{e.tel}</td>
                <td className="whitespace-nowrap">{dateLabel(e.dateOfEmployment)}</td>
                <Num>{ctx.money(e.monthlyGross)}</Num>
                <Num>{ctx.money(r2(e.monthlyGross / 3))}</Num>
                <td>
                  {issues.length ? (
                    <div className="flex flex-col gap-0.5">
                      {issues.map((c) => (
                        <span key={c.rule} className="text-xs text-destructive">
                          {c.detail}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <Badge variant="secondary">Eligible</Badge>
                  )}
                </td>
                <td className="text-right whitespace-nowrap">
                  <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => ctx.open({ kind: "employee", emp: e })}>
                    <Pencil />
                  </Button>
                  <Button variant="ghost" size="icon-sm" title="New request" onClick={() => ctx.open({ kind: "new-request", employeeId: e.id })}>
                    <Plus />
                  </Button>
                </td>
              </tr>
            );
          })}
        </Table>
      </CardContent>
    </Card>
  );
}

function EmployeeDialog({ ctx, emp, onClose }: { ctx: Ctx; emp?: Employee; onClose: () => void }) {
  const [f, setF] = useState({
    id: emp?.id ?? "",
    staffNo: emp?.staffNo ?? "",
    surname: emp?.surname ?? "",
    firstNames: emp?.firstNames ?? "",
    position: emp?.position ?? "",
    tel: emp?.tel ?? "",
    dateOfEmployment: emp?.dateOfEmployment ?? "",
    monthlyGross: emp ? String(emp.monthlyGross) : "",
    probationDone: emp?.probationDone ?? false,
    contractEndDate: emp?.contractEndDate ?? "",
    servingNotice: emp?.servingNotice ?? false,
  });
  const [err, setErr] = useState("");
  const text = (k: keyof typeof f) => ({
    value: f[k] as string,
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value }),
  });
  const save = async () => {
    const msg = await ctx.run({ type: "saveEmployee", employee: f });
    if (msg) setErr(msg);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{emp ? "Edit employee" : "Add employee"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Staff no">
            <Input {...text("staffNo")} />
          </Field>
          <Field label="Position">
            <Input {...text("position")} />
          </Field>
          <Field label="Surname">
            <Input {...text("surname")} />
          </Field>
          <Field label="First names">
            <Input {...text("firstNames")} />
          </Field>
          <Field label="Tel">
            <Input {...text("tel")} />
          </Field>
          <Field label="Date of employment">
            <Input type="date" {...text("dateOfEmployment")} />
          </Field>
          <Field label="Monthly gross salary">
            <Input type="number" min="0" step="0.01" {...text("monthlyGross")} />
          </Field>
          <Field label="Contract end date (blank if permanent)">
            <Input type="date" {...text("contractEndDate")} />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={f.probationDone} onChange={(e) => setF({ ...f, probationDone: e.target.checked })} />
            Probation completed
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={f.servingNotice} onChange={(e) => setF({ ...f, servingNotice: e.target.checked })} />
            Serving notice
          </label>
        </div>
        <ErrorText msg={err} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------- uploaded application forms

const OriginalLink = ({ id, icon }: { id: string; icon?: boolean }) => (
  <Button
    variant="ghost"
    size={icon ? "icon-sm" : "default"}
    title="Open the uploaded application form"
    render={<a href={`/api/upload?id=${id}`} target="_blank" rel="noopener" />}
    nativeButton={false}
  >
    <FileText />
    {!icon && "Original form"}
  </Button>
);

function UploadButton({ ctx, size }: { ctx: Ctx; size?: "sm" }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const read = async (file?: File) => {
    if (!file) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const res = await fetch("/api/upload", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      ctx.notify("");
      ctx.open({ kind: "from-form", upload: { ...(data as ParseResult & { token: string }), fileName: file.name } });
    } catch (e) {
      ctx.notify(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  };

  return (
    <>
      <Button size={size} onClick={() => ref.current?.click()} disabled={busy}>
        <FileUp /> {busy ? "Reading form…" : "Upload application form"}
      </Button>
      <input ref={ref} type="file" accept=".pdf,application/pdf" hidden onChange={(e) => read(e.target.files?.[0])} />
    </>
  );
}

/** Review what was read from an uploaded form, complete what the form doesn't say, and save as pending. */
function FromFormDialog({ ctx, upload, onClose }: { ctx: Ctx; upload: Upload; onClose: () => void }) {
  const { db, today } = ctx.state;
  const p = upload.fields;
  const findByStaffNo = (no: string) => db.employees.find((e) => no.trim() && e.staffNo.toLowerCase() === no.trim().toLowerCase());
  const known = findByStaffNo(p.staffNo);

  const [emp, setEmp] = useState({
    staffNo: p.staffNo || known?.staffNo || "",
    surname: p.surname || known?.surname || "",
    firstNames: p.firstNames || known?.firstNames || "",
    position: p.position || known?.position || "",
    tel: p.tel || known?.tel || "",
    dateOfEmployment: p.dateOfEmployment || known?.dateOfEmployment || "",
    monthlyGross: p.monthlyGross ? String(p.monthlyGross) : known ? String(known.monthlyGross) : "",
    probationDone: known?.probationDone ?? false,
    contractEndDate: known?.contractEndDate ?? "",
    servingNotice: known?.servingNotice ?? false,
  });
  const [req, setReq] = useState({
    amount: p.amount ? String(p.amount) : "",
    months: String(p.months ?? 3),
    purpose: p.purpose as Purpose | "",
    purposeOther: p.purposeOther,
    otherLoans: p.otherLoans,
    requestedOn: p.requestedOn || today,
  });
  const [err, setErr] = useState("");

  const empText = (k: "staffNo" | "surname" | "firstNames" | "position" | "tel" | "dateOfEmployment" | "monthlyGross" | "contractEndDate") => ({
    value: emp[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setEmp({ ...emp, [k]: e.target.value }),
  });
  const reqText = (k: "amount" | "purposeOther" | "requestedOn") => ({
    value: req[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setReq({ ...req, [k]: e.target.value }),
  });

  // Policy preview with the employee as they will be saved.
  const match = findByStaffNo(emp.staffNo);
  const preview: Employee = {
    id: match?.id ?? "__new__",
    staffNo: emp.staffNo,
    surname: emp.surname,
    firstNames: emp.firstNames,
    position: emp.position,
    tel: emp.tel,
    dateOfEmployment: emp.dateOfEmployment,
    monthlyGross: Number(emp.monthlyGross) || 0,
    probationDone: emp.probationDone,
    contractEndDate: emp.contractEndDate || null,
    servingNotice: emp.servingNotice,
  };
  const previewDb: Db = { ...db, employees: [...db.employees.filter((e) => e.id !== preview.id), preview] };
  const amount = Number(req.amount) || 0;
  const checks = policyChecks(previewDb, { id: "", employeeId: preview.id, months: Number(req.months) }, amount, today);
  const changed = match
    ? ([
        ["surname", "Surname"],
        ["firstNames", "First names"],
        ["position", "Position"],
        ["tel", "Tel"],
        ["dateOfEmployment", "D.O.E"],
      ] as const)
        .filter(([k]) => String(match[k] ?? "") !== emp[k])
        .map(([, label]): string => label)
        .concat(match.monthlyGross !== preview.monthlyGross ? ["Monthly gross"] : [])
    : [];

  const save = async () => {
    const msg = await ctx.run({ type: "createFromForm", uploadToken: upload.token, employee: emp, request: req });
    if (msg) setErr(msg);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Loan application form</DialogTitle>
          <DialogDescription>
            Read from {upload.fileName}. Check the details, complete what the form doesn&apos;t say, then save it as a pending request.
          </DialogDescription>
        </DialogHeader>

        {upload.notes.length > 0 && (
          <ul className="flex flex-col gap-1 rounded-lg bg-warning/10 p-3 text-sm">
            {upload.notes.map((n) => (
              <li key={n} className="flex items-start gap-2">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
                {n}
              </li>
            ))}
          </ul>
        )}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Employee</h3>
            {match ? (
              <Badge variant="secondary">
                Existing employee{changed.length ? ` · will update ${changed.join(", ")}` : ""}
              </Badge>
            ) : (
              <Badge variant="outline">New employee · will be added</Badge>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Surname">
              <Input {...empText("surname")} />
            </Field>
            <Field label="First names">
              <Input {...empText("firstNames")} />
            </Field>
            <Field label="Position">
              <Input {...empText("position")} />
            </Field>
            <Field label="Tel">
              <Input {...empText("tel")} />
            </Field>
            <Field label="Date of employment (D.O.E)">
              <Input type="date" {...empText("dateOfEmployment")} />
            </Field>
            <Field label="Staff no">
              <Input {...empText("staffNo")} />
            </Field>
            <Field label="Monthly gross salary">
              <Input type="number" min="0" step="0.01" {...empText("monthlyGross")} />
            </Field>
          </div>
          <div className="rounded-lg border p-3">
            <div className="mb-2 text-xs font-medium text-muted-foreground">Not on the form: confirm from HR records</div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Contract end date (blank if permanent)">
                <Input type="date" {...empText("contractEndDate")} />
              </Field>
              <div className="flex flex-col justify-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={emp.probationDone} onChange={(e) => setEmp({ ...emp, probationDone: e.target.checked })} />
                  Probation completed
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" className="size-4 accent-primary" checked={emp.servingNotice} onChange={(e) => setEmp({ ...emp, servingNotice: e.target.checked })} />
                  Serving notice
                </label>
              </div>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Request</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Requested amount">
              <Input type="number" min="0" step="0.01" {...reqText("amount")} />
              {preview.monthlyGross > 0 && (
                <span className="text-xs text-muted-foreground">Maximum {ctx.money(r2(preview.monthlyGross / 3))} (1/3 of gross)</span>
              )}
            </Field>
            <Field label="Repayment (equal monthly salary deductions)">
              <select className={selectCls} value={req.months} onChange={(e) => setReq({ ...req, months: e.target.value })}>
                {[1, 2, 3].map((m) => (
                  <option key={m} value={m}>
                    {m} month{m > 1 ? "s" : ""}
                    {amount > 0 ? ` · ${ctx.money(buildSchedule(amount, m, "2000-01")[0].due)} / month` : ""}
                  </option>
                ))}
              </select>
              {p.instalment && <span className="text-xs text-muted-foreground">Instalment on the form: {ctx.money(p.instalment)}</span>}
            </Field>
            <Field label="Date of application (signature date)">
              <Input type="date" {...reqText("requestedOn")} />
            </Field>
            <Field label="Other outstanding loans">
              <Input placeholder="None" value={req.otherLoans} onChange={(e) => setReq({ ...req, otherLoans: e.target.value })} />
            </Field>
            <Field label="Purpose" className="sm:col-span-2">
              <div className="flex flex-wrap gap-4">
                {PURPOSES.map((x) => (
                  <label key={x} className="flex items-center gap-2 text-sm">
                    <input type="radio" name="form-purpose" className="accent-primary" checked={req.purpose === x} onChange={() => setReq({ ...req, purpose: x })} />
                    {x}
                  </label>
                ))}
              </div>
              {req.purpose === "Other" && <Input placeholder="Please specify" {...reqText("purposeOther")} />}
            </Field>
          </div>
        </section>

        <div className="rounded-lg border p-3">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Policy check preview</div>
          <ChecksList checks={checks} />
        </div>
        <ErrorText msg={err} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save}>Save as pending</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

