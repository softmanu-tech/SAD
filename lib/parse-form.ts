import type { Purpose } from "./types";

/** A piece of text from the PDF with its position (PDF units, y grows upwards). */
export interface PdfItem {
  x: number;
  y: number;
  str: string;
}

/** Fields read from an uploaded Loan Application Form. Empty string / null = not found. */
export interface ParsedForm {
  surname: string;
  firstNames: string;
  position: string;
  tel: string;
  /** YYYY-MM-DD */
  dateOfEmployment: string;
  staffNo: string;
  amount: number | null;
  monthlyGross: number | null;
  instalment: number | null;
  /** 1–3, worked out from amount ÷ instalment */
  months: number | null;
  purpose: Purpose | "";
  purposeOther: string;
  otherLoans: string;
  /** YYYY-MM-DD, the date next to the applicant's signature */
  requestedOn: string;
}

export interface ParseResult {
  fields: ParsedForm;
  /** Things the manager should check before saving. */
  notes: string[];
}

// Tick boxes come through as Wingdings / Unicode ballot-box characters.
const BOX_EMPTY = /^[☐□]/;
const BOX_TICKED = /^[☑☒✓✔]/;
const BOX_ANY = /^[☐□☑☒✓✔]\s*/;

type Key =
  | "surname"
  | "firstNames"
  | "position"
  | "tel"
  | "doe"
  | "staffNo"
  | "amount"
  | "gross"
  | "mode"
  | "instalment"
  | "purpose"
  | "otherLoans"
  | "signature"
  | "date";

const LABELS: [Key, RegExp][] = [
  ["surname", /^surname\b/i],
  ["firstNames", /^first\s*name/i],
  ["position", /^position\b/i],
  ["tel", /^tel(ephone)?\b/i],
  ["doe", /^d\.?\s*o\.?\s*e\b/i],
  ["staffNo", /^staff\s*no\b/i],
  ["amount", /^requested\s*amount\b/i],
  ["gross", /^monthly\s*gross\b/i],
  ["mode", /^mode\s*of\s*repayment\b/i],
  ["instalment", /^proposed\s*repayment\b/i],
  ["purpose", /^purpose\s*of\s*loan\b/i],
  ["otherLoans", /^any\s*other\s*outstanding\b/i],
  ["signature", /^signature\s*of\s*the\s*applicant\b/i],
  ["date", /^date\s*:/i],
];

const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const labelOf = (s: string): Key | null => LABELS.find(([, re]) => re.test(s.trim()))?.[0] ?? null;

/** "15, 000" / "KSH 15,000/=" → 15000 */
export function parseAmount(s: string): number | null {
  const digits = s.replace(/[^\d.]/g, "").replace(/\.(?=.*\.)/g, "");
  const n = Number(digits);
  return digits && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

/** "01/11/2026" (day first) or "2026-11-01" → "2026-11-01" */
export function parseDate(s: string): string {
  const t = s.trim();
  let m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = t.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
  return "";
}
function iso(y: number, mo: number, d: number) {
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Group text into lines (top to bottom), each line's cells left to right. */
function toLines(items: PdfItem[]): string[][] {
  const sorted = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: { y: number; cells: PdfItem[] }[] = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= 3);
    if (line) line.cells.push(it);
    else lines.push({ y: it.y, cells: [it] });
  }
  return lines.map((l) => l.cells.sort((a, b) => a.x - b.x).map((c) => c.str));
}

export function parseLoanForm(items: PdfItem[]): ParseResult {
  const raw: Partial<Record<Key, string>> = {};
  let purpose: Purpose | "" = "";
  let purposeOther = "";

  for (const cells of toLines(items)) {
    const text = clean(cells.join(" "));
    // The applicant fills in everything above this; the rest is management's decision, made in the app.
    if (/^for official use only/i.test(text)) break;

    // Tick boxes: a box glyph followed by the option text (same cell or the next one).
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i].trim();
      if (!BOX_ANY.test(c)) continue;
      const option = clean(c.replace(BOX_ANY, "") || cells[i + 1] || "");
      const ticked = BOX_TICKED.test(c) && !BOX_EMPTY.test(c);
      const p: Purpose | null = /educat/i.test(option)
        ? "Education"
        : /medic/i.test(option)
          ? "Medical"
          : /personal/i.test(option)
            ? "Personal"
            : /other\s*reason|specify/i.test(option)
              ? "Other"
              : null;
      if (ticked && p) {
        purpose = p;
        if (p === "Other") purposeOther = clean(option.replace(/^any\s*other\s*reasons?\s*(please\s*specify)?\s*:?/i, ""));
      }
    }

    // Label → the cells after it on the same line, up to the next label.
    for (let i = 0; i < cells.length; i++) {
      const key = labelOf(cells[i]);
      if (!key) continue;
      const inline = cells[i].includes(":") ? cells[i].slice(cells[i].indexOf(":") + 1) : "";
      const rest: string[] = [inline];
      for (let j = i + 1; j < cells.length && !labelOf(cells[j]); j++) rest.push(cells[j]);
      const value = clean(rest.join(" ").replace(BOX_ANY, ""));
      if (value && raw[key] === undefined) raw[key] = value;
    }
  }

  const amount = parseAmount(raw.amount ?? "");
  const instalment = parseAmount(raw.instalment ?? "");
  const monthlyGross = parseAmount(raw.gross ?? "");
  let months: number | null = null;
  const notes: string[] = [];

  if (amount && instalment) {
    const exact = amount / instalment;
    months = Math.min(3, Math.max(1, Math.round(exact)));
    if (Math.abs(exact - Math.round(exact)) > 0.01) {
      notes.push(`The instalment on the form (${instalment}) does not divide the amount evenly; repayment set to ${months} month(s) of equal deductions.`);
    } else if (exact > 3) {
      notes.push(`The form's instalment means ${Math.round(exact)} months, more than the 3 allowed; set to 3 months.`);
    }
  } else {
    notes.push("No instalment amount found on the form; choose the repayment period.");
  }

  const fields: ParsedForm = {
    surname: raw.surname ?? "",
    firstNames: raw.firstNames ?? "",
    position: raw.position ?? "",
    tel: raw.tel ?? "",
    dateOfEmployment: parseDate(raw.doe ?? ""),
    staffNo: raw.staffNo ?? "",
    amount,
    monthlyGross,
    instalment,
    months,
    purpose,
    purposeOther,
    otherLoans: raw.otherLoans ?? "",
    requestedOn: parseDate(raw.date ?? ""),
  };

  const missing = (
    [
      ["Surname", fields.surname],
      ["Staff no", fields.staffNo],
      ["Requested amount", fields.amount],
      ["Monthly gross", fields.monthlyGross],
      ["Date of employment", fields.dateOfEmployment],
      ["Application date", fields.requestedOn],
    ] as const
  )
    .filter(([, v]) => !v)
    .map(([k]) => k);
  if (missing.length) notes.push(`Not found on the form: ${missing.join(", ")}.`);
  if (!fields.purpose) notes.push("No purpose box is ticked on the form; choose the purpose.");
  return { fields, notes };
}
