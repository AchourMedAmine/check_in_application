import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { getSessionStats } from "@/lib/attendance/scan";
import { settleBreaks } from "@/lib/attendance/settle";
import { requireScanner, sessionScope } from "@/lib/scanners";
import { openDueSessions } from "@/lib/attendance/session";

// GET /api/sessions — every session with its attendance figures
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    const scanner = await requireScanner(req);
    // Doors open on their own 30 minutes before each session.
    await openDueSessions();
    // An officer sees only the sessions they are assigned to.
    const scope = await sessionScope(scanner);
    const sessions = await prisma.session.findMany({
      where: scope ? { id: { in: scope } } : undefined,
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
