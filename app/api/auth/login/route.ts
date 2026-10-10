import { NextRequest, NextResponse } from "next/server";
import { sessionCookie, signSession } from "@/lib/auth";
import { authenticate, toProfile } from "@/lib/scanners";
import { ApiError } from "@/lib/errors";

// POST /api/auth/login — exchange a scanner's username + password for a
// signed session cookie. Body: { username, password }
export async function POST(req: NextRequest) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
    return NextResponse.json(
      { success: false, error: "SESSION_SECRET is not configured on the server" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json(
      { success: false, error: "Enter your username and password" },
      { status: 400 }
    );
  }

  try {
    const scanner = await authenticate(username, password);
    const res = NextResponse.json({ success: true, data: toProfile(scanner) });
    res.cookies.set(sessionCookie(await signSession(scanner)));
    return res;
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("Login error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
