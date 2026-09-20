import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { getSessionStats } from "@/lib/attendance/scan";
import { settleBreaks } from "@/lib/attendance/settle";

// GET /api/sessions — every session with its attendance figures
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    const sessions = await prisma.session.findMany({
      orderBy: { startsAt: "asc" },
    });

    return Promise.all(
      sessions.map(async (session) => {
        if (session.status === "Open") await settleBreaks(session);
        return { ...session, stats: await getSessionStats(session) };
      })
    );
  }, req);
}
