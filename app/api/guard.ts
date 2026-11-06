import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, userFromToken } from "@/lib/auth";
import { hosted } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { SessionUser } from "@/lib/types";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;
export const noStore = { "Cache-Control": "no-store" };

/** Writes must come from this app's own pages (blocks other websites: CSRF / DNS rebinding). */
function sameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return;
  let originHost = "";
  try {
    originHost = new URL(origin).host;
  } catch {
    /* invalid origin */
  }
  if (originHost.toLowerCase() !== (req.headers.get("host") ?? "").toLowerCase()) throw new HttpError(403, "Cross-site request blocked");
}

/**
 * Laptop: only this computer may use the API. Online: the person must be signed in.
 * Returns the signed-in user online, null on the laptop.
 */
export async function guard(req: NextRequest, write: boolean): Promise<SessionUser | null> {
  if (write) sameOrigin(req);
  if (!hosted()) {
    if (!LOCAL_HOST.test(req.headers.get("host") ?? "")) throw new HttpError(403, "Local access only");
    return null;
  }
  const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!user) throw new HttpError(401, "Please sign in");
  return user;
}

/** JSON error response; unexpected errors are logged but not shown in detail. */
export function fail(e: unknown) {
  const known = e instanceof HttpError;
  if (!known) console.error(e);
  const code = known ? e.code : 500;
  const error = known || !hosted() ? (e instanceof Error ? e.message : String(e)) : "Something went wrong. Please try again.";
  return NextResponse.json({ error }, { status: code, headers: noStore });
}
