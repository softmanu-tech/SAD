import { buildSchedule, dateLabel, fmtMoney, monthLabel } from "@/lib/calc";
import type { AdvanceRequest, Employee, Settings } from "@/lib/types";
import { PURPOSES } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function Line({ label, value, className }: { label: string; value?: string; className?: string }) {
  return (
    <div className={`flex items-end gap-2 ${className ?? ""}`}>
      <span className="shrink-0 text-[11px] font-semibold tracking-wide uppercase">{label}:</span>
      <span className="min-h-5 flex-1 border-b border-dotted border-black pb-0.5 text-sm">{value}</span>
    </div>
  );
}

function Box({ checked, label }: { checked: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span className="inline-flex size-4 items-center justify-center border border-black text-xs leading-none font-bold">{checked ? "✓" : ""}</span>
      {label}
    </span>
  );
}

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <h2 className="mt-5 mb-2 border-b-2 border-black pb-0.5 text-xs font-bold tracking-widest uppercase">{children}</h2>
);

export function LoanForm({ r, e, settings }: { r: AdvanceRequest; e?: Employee; settings: Settings }) {
  const money = (n?: number) => (n ? fmtMoney(n, settings.currency) : "");
  const requestedInstalment = buildSchedule(r.amount, r.months, "2000-01")[0]?.due;
  const approved = r.status === "approved";
  const rejected = r.status === "rejected";
  const scheduleMonths = new Set(r.schedule.map((s) => Number(s.month.slice(5, 7))));
  const scheduleText = r.schedule.map((s) => monthLabel(s.month)).join(", ");

  return (
    <div className="mx-auto w-full max-w-[190mm] bg-white p-6 font-serif text-black print:p-0">
      <header className="text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- local .ico asset, prints as-is */}
        <img src="/sensys-logo.ico" alt="" width={80} height={64} className="mx-auto mb-1 h-16 w-auto" />
        <h1 className="mt-1 text-xl font-bold tracking-wider uppercase">Loan Application Form</h1>
        <div className="text-sm italic">Salary Advance</div>
      </header>

      <SectionTitle>Applicant details</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Line label="Surname" value={e?.surname} />
        <Line label="First names" value={e?.firstNames} />
        <Line label="Position" value={e?.position} />
        <Line label="Tel" value={e?.tel} />
        <Line label="D.O.E" value={dateLabel(e?.dateOfEmployment)} />
        <Line label="Staff no" value={e?.staffNo} />
      </div>

      <SectionTitle>Advance requested</SectionTitle>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3">
        <Line label="Requested amount" value={money(r.amount)} />
        <Line label="Monthly gross" value={money(e?.monthlyGross)} />
        <div className="flex items-end gap-3">
          <span className="text-[11px] font-semibold tracking-wide uppercase">Mode of repayment:</span>
          <Box checked label="Salary deduction" />
        </div>
        <Line label="Instalment" value={`${money(requestedInstalment)} per month × ${r.months} month${r.months > 1 ? "s" : ""}`} />
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-x-5 gap-y-2">
        <span className="text-[11px] font-semibold tracking-wide uppercase">Purpose:</span>
        {PURPOSES.map((p) => (
          <Box key={p} checked={r.purpose === p} label={p === "Other" ? "Other (specify)" : p} />
        ))}
        <span className="min-h-5 min-w-40 flex-1 border-b border-dotted border-black pb-0.5 text-sm">{r.purpose === "Other" ? r.purposeOther : ""}</span>
      </div>
      <Line className="mt-3" label="Other outstanding loans" value={r.otherLoans || "None"} />

      <SectionTitle>Declaration</SectionTitle>
      <p className="text-sm leading-relaxed">
        I hereby apply for a salary advance as stated above. I confirm that the information I have given is true and that I have read and agree to
        abide by the Company Salary Advance Policy. I authorise the Company to recover the advance by equal monthly deductions from my salary as
        set out below and, should I leave the Company before it is fully repaid, to deduct any outstanding balance from my final dues.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-x-6">
        <Line label="Signature" />
        <Line label="Date" value={dateLabel(r.requestedOn)} />
      </div>

      <section className="mt-6 border-2 border-black p-4">
        <h2 className="mb-3 text-center text-xs font-bold tracking-widest uppercase">For official use only</h2>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3">
          <Line label="Approved amount" value={approved ? money(r.approvedAmount) : ""} />
          <div className="flex items-end gap-5">
            <Box checked={approved} label="Approved" />
            <Box checked={rejected} label="Rejected" />
          </div>
          <Line label="Deduction per month" value={approved ? money(r.schedule[0]?.due) : ""} />
          <Line label="Date" value={dateLabel(r.decidedOn)} />
        </div>
        <div className="mt-4">
          <div className="mb-2 text-[11px] font-semibold tracking-wide uppercase">Months of deduction:</div>
          <div className="grid grid-cols-6 gap-x-4 gap-y-2">
            {MONTHS.map((m, i) => (
              <Box key={m} checked={approved && scheduleMonths.has(i + 1)} label={m} />
            ))}
          </div>
          {approved && <div className="mt-2 text-xs">({scheduleText})</div>}
        </div>
        <Line className="mt-4" label="Remarks" value={r.decisionNote} />
        <div className="mt-8 grid grid-cols-2 gap-x-6">
          <Line label="Management signature" />
          <Line label="Date" />
        </div>
      </section>
    </div>
  );
}
