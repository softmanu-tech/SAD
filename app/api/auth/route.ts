import { NextResponse, type NextRequest } from "next/server";
import { endSessions, login, SESSION_COOKIE, SESSION_HOURS, userFromToken } from "@/lib/auth";
import { hosted } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import { fail, guard, noStore } from "../guard";

const cookieOptions = (req: NextRequest) => ({
  httpOnly: true,
  secure: req.nextUrl.protocol === "https:",
  sameSite: "lax" as const,
  path: "/",
});

/** { action: "login", email, password } or { action: "logout" } */
export async function POST(req: NextRequest) {
  try {
    if (!hosted()) throw new HttpError(400, "Sign-in is only used in the online version");
    const body = (await req.json()) as Record<string, unknown>;

    if (body.action === "login") {
      await guard(req, true).catch((e) => {
        if (!(e instanceof HttpError && e.code === 401)) throw e; // only the same-site check matters here
      });
      const { token, user } = await login(body.email, body.password);
      const res = NextResponse.json({ user }, { headers: noStore });
      res.cookies.set(SESSION_COOKIE, token, { ...cookieOptions(req), maxAge: SESSION_HOURS * 3600 });
      return res;
    }

    if (body.action === "logout") {
      const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
      if (user) await endSessions(user.id);
      const res = NextResponse.json({ ok: true }, { headers: noStore });
      res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions(req), maxAge: 0 });
      return res;
    }

    throw new HttpError(400, "Unknown action");
  } catch (e) {
    return fail(e);
  }
}
