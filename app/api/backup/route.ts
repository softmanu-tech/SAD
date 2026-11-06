import { NextResponse, type NextRequest } from "next/server";
import { HttpError } from "@/lib/actions";
import { ymd } from "@/lib/calc";
import { currentFileText } from "@/lib/store";
import { guard } from "../guard";

export async function GET(req: NextRequest) {
  try {
    guard(req, false);
    return new NextResponse(currentFileText(), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="salary-advance-backup-${ymd()}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const code = e instanceof HttpError ? e.code : 500;
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: code });
  }
}
