import { NextResponse, type NextRequest } from "next/server";
import { ymd } from "@/lib/calc";
import { exportJson } from "@/lib/store";
import { fail, guard } from "../guard";

/** Download all records as a JSON backup copy. */
export async function GET(req: NextRequest) {
  try {
    await guard(req, false);
    return new NextResponse(await exportJson(), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="salary-advance-backup-${ymd()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return fail(e);
  }
}
