import { NextResponse, type NextRequest } from "next/server";
import { hosted } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { parseLoanForm, type PdfItem } from "@/lib/parse-form";
import { readUpload, saveTempUpload } from "@/lib/store";
import { fail, guard, noStore } from "../guard";

/** Online hosting accepts request bodies up to about 4.5 MB. */
const maxMb = () => (hosted() ? 4 : 10);

async function pdfItems(data: Uint8Array): Promise<PdfItem[]> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data, verbosity: 0 });
  const items: PdfItem[] = [];
  try {
    const doc = await task.promise;
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      for (const it of content.items) {
        // Later pages sit below earlier ones so the reading order stays top-to-bottom.
        if ("str" in it) items.push({ x: it.transform[4], y: it.transform[5] - n * 10000, str: it.str });
      }
    }
  } finally {
    await task.destroy();
  }
  return items;
}

/** Read an uploaded Loan Application Form (PDF) and return what was found on it. */
export async function POST(req: NextRequest) {
  try {
    await guard(req, true);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(400, "Choose a PDF file");
    if (file.size > maxMb() * 1024 * 1024) throw new HttpError(400, `The file is larger than ${maxMb()} MB`);
    const buf = Buffer.from(await file.arrayBuffer());
    if (buf.subarray(0, 5).toString("latin1") !== "%PDF-") {
      throw new HttpError(400, "That is not a PDF. In Word, use File → Save As → PDF, then upload the PDF.");
    }

    let items: PdfItem[];
    try {
      items = await pdfItems(new Uint8Array(buf));
    } catch {
      throw new HttpError(400, "This PDF could not be read. It may be damaged or password-protected.");
    }
    const result = parseLoanForm(items);
    if (!items.some((i) => i.str.trim())) {
      result.notes.unshift("No text was found in this PDF (it may be a scanned image). Fill in the details by hand.");
    }
    const token = await saveTempUpload(buf);
    return NextResponse.json({ token, ...result }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

/** The original uploaded form for a request: /api/upload?id=<requestId> */
export async function GET(req: NextRequest) {
  try {
    await guard(req, false);
    const pdf = await readUpload(req.nextUrl.searchParams.get("id") ?? "");
    if (!pdf) throw new HttpError(404, "No uploaded form for this request");
    return new NextResponse(new Uint8Array(pdf), {
      headers: { ...noStore, "Content-Type": "application/pdf", "Content-Disposition": "inline", "X-Content-Type-Options": "nosniff" },
    });
  } catch (e) {
    return fail(e);
  }
}
