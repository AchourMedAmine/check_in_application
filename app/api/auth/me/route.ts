import { NextRequest } from "next/server";
import { handleApiRequest } from "@/lib/api-handler";
import { requireScanner, toProfile } from "@/lib/scanners";

// GET /api/auth/me — the signed-in scanner, so the UI knows the role.
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => toProfile(await requireScanner(req)), req);
}
