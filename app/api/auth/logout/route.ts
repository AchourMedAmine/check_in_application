import { NextResponse } from "next/server";
import { sessionCookie } from "@/lib/auth";

// POST /api/auth/logout — drop the session cookie.
export async function POST() {
  const res = NextResponse.json({ success: true, data: { ok: true } });
  res.cookies.set(sessionCookie("", 0));
  return res;
}
