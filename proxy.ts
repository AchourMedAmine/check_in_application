import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, readSession } from "@/lib/auth";

/**
 * Gates the whole app behind a scanner sign-in. Everything except the login
 * screen and its endpoints needs a validly signed, unexpired cookie.
 *
 * This is the optimistic check only — no database. Every API route then
 * re-checks the account itself (lib/scanners.ts → requireScanner), which is
 * where disabled accounts and the Manager role are enforced.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(SESSION_COOKIE)?.value;

  if (await readSession(token)) {
    return NextResponse.next();
  }

  // API calls get a 401 rather than an HTML redirect.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { success: false, error: "Not signed in" },
      { status: 401 }
    );
  }

  const login = new URL("/login", request.url);
  login.searchParams.set("next", request.nextUrl.pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - the login page and its auth endpoints
     *  - Next internals and static files
     *  - public images (the logo is on the login page, and the image
     *    optimizer fetches it without the visitor's cookie)
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
