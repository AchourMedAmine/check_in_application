import { NextResponse } from "next/server";
import { STAFF_COOKIE } from "@/lib/auth";

// POST /api/auth/logout — drop the staff cookie.
export async function POST() {
  const res = NextResponse.json({ success: true, data: { ok: true } });
  res.cookies.set({
    name: STAFF_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return res;
}
