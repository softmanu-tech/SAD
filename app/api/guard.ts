import type { NextRequest } from "next/server";
import { HttpError } from "@/lib/actions";

const LOCAL_HOST = /^(127\.0\.0\.1|localhost)(:\d+)?$/i;

/** Only this laptop may use the API: blocks other machines and other websites (DNS rebinding / CSRF). */
export function guard(req: NextRequest, write: boolean) {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOST.test(host)) throw new HttpError(403, "Local access only");
  if (write) {
    const origin = req.headers.get("origin");
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* invalid origin */
      }
      if (originHost.toLowerCase() !== host.toLowerCase()) throw new HttpError(403, "Cross-site request blocked");
    }
  }
}
