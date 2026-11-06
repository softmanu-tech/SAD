import { NextResponse, type NextRequest } from "next/server";
import { addUser, listUsers, removeUser, setPassword } from "@/lib/auth";
import { HttpError } from "@/lib/errors";
import { fail, guard, noStore } from "../guard";

async function signedIn(req: NextRequest, write: boolean) {
  const me = await guard(req, write);
  if (!me) throw new HttpError(400, "User accounts are only used in the online version");
  return me;
}

export async function GET(req: NextRequest) {
  try {
    await signedIn(req, false);
    return NextResponse.json({ users: await listUsers() }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}

/** { action: "add", name, email, password } | { action: "password", id, password } | { action: "remove", id } */
export async function POST(req: NextRequest) {
  try {
    const me = await signedIn(req, true);
    const b = (await req.json()) as Record<string, unknown>;
    if (b.action === "add") await addUser(b.name, b.email, b.password);
    else if (b.action === "password") await setPassword(b.id, b.password);
    else if (b.action === "remove") await removeUser(b.id, me);
    else throw new HttpError(400, "Unknown action");
    return NextResponse.json({ users: await listUsers() }, { headers: noStore });
  } catch (e) {
    return fail(e);
  }
}
