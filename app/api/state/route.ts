import { NextResponse, type NextRequest } from "next/server";
import { apply } from "@/lib/actions";
import { ymd } from "@/lib/calc";
import { hosted } from "@/lib/db";
import { attachUpload, listBackups, load, mutate } from "@/lib/store";
import type { AppState, SessionUser } from "@/lib/types";
import { fail, guard, noStore } from "../guard";

async function view(user: SessionUser | null): Promise<AppState> {
  const [db, backups] = await Promise.all([load(), listBackups()]);
  return { db, today: ymd(), backups, hosted: hosted(), user };
}

export async function GET(req: NextRequest) {
  try {
    const user = await guard(req, false);
    return NextResponse.json(await view(user), { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await guard(req, true);
    const body = (await req.json()) as Record<string, unknown>;
    await mutate(async (db) => {
      const createdId = apply(db, body, user?.name);
      const token = typeof body.uploadToken === "string" ? body.uploadToken : "";
      if (body.type === "createFromForm" && token && createdId) {
        const r = db.requests.find((x) => x.id === createdId);
        if (r) r.sourceFile = await attachUpload(token, createdId);
      }
    });
    return NextResponse.json(await view(user), { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}
