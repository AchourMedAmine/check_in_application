import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { getSessionStats } from "@/lib/attendance/scan";

// GET /api/sessions — every session with its attendance figures
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    const sessions = await prisma.session.findMany({
      orderBy: { startsAt: "asc" },
    });

    return Promise.all(
      sessions.map(async (session) => ({
        ...session,
        stats: await getSessionStats(session),
      }))
    );
  }, req);
}
