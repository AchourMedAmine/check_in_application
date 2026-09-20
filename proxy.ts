import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { STAFF_COOKIE, isStaffToken } from "@/lib/auth";

/**
 * Gates the whole scanner behind the staff PIN. Everything except the login
 * screen and its endpoints needs a valid cookie.
 */
export async function proxy(request: NextRequest) {
  const token = request.cookies.get(STAFF_COOKIE)?.value;

  if (await isStaffToken(token)) {
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
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
