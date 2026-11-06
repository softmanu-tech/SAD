import { NextResponse, type NextRequest } from "next/server";
import { apply, HttpError } from "@/lib/actions";
import { ymd } from "@/lib/calc";
import { listBackups, load, readBackup, restore, save } from "@/lib/store";
import type { AppState } from "@/lib/types";
import { guard } from "../guard";

const noStore = { "Cache-Control": "no-store" };

function view(): AppState {
  return { db: load(), today: ymd(), backups: listBackups() };
}

function fail(e: unknown) {
  const code = e instanceof HttpError ? e.code : 500;
  const error = e instanceof Error ? e.message : String(e);
  return NextResponse.json({ error }, { status: code, headers: noStore });
}

export async function GET(req: NextRequest) {
  try {
    guard(req, false);
    return NextResponse.json(view(), { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    guard(req, true);
    const body = (await req.json()) as Record<string, unknown>;
    if (body.type === "restore") {
      const incoming = typeof body.backup === "string" ? readBackup(body.backup) : body.data;
      try {
        restore(incoming);
      } catch (e) {
        throw new HttpError(400, e instanceof Error ? e.message : String(e));
      }
    } else {
      const db = load();
      apply(db, body);
      save(db);
    }
    return NextResponse.json(view(), { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}
