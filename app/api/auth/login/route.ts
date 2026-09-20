import { NextRequest, NextResponse } from "next/server";
import {
  STAFF_COOKIE,
  STAFF_COOKIE_MAX_AGE,
  safeEqual,
  staffToken,
} from "@/lib/auth";

// POST /api/auth/login — exchange the staff PIN for a session cookie.
export async function POST(req: NextRequest) {
  const pin = process.env.STAFF_PIN;

  if (!pin) {
    return NextResponse.json(
      { success: false, error: "STAFF_PIN is not configured on the server" },
      { status: 500 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as { pin?: string };
  const supplied = (body.pin ?? "").trim();

  if (!supplied || !safeEqual(supplied, pin)) {
    // Slow brute force down a little without blocking the event.
    await new Promise((r) => setTimeout(r, 400));
    return NextResponse.json(
      { success: false, error: "Wrong PIN" },
      { status: 401 }
    );
  }

  const res = NextResponse.json({ success: true, data: { ok: true } });
  res.cookies.set({
    name: STAFF_COOKIE,
    value: await staffToken(pin),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STAFF_COOKIE_MAX_AGE,
  });
  return res;
}
