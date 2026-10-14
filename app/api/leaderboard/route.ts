import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { getLeaderboard } from "@/lib/attendance/close-session";
import { settleBreaks } from "@/lib/attendance/settle";
import { requireScanner } from "@/lib/scanners";

// GET /api/leaderboard[?sessionId=...]
// Points lost per student branch, with the individual deductions behind them.
export async function GET(req: NextRequest) {
  return handleApiRequest(async () => {
    // Branch standings are for managers (and later the admin dashboard),
    // not for the officers at the doors.
    await requireScanner(req, { role: "Manager" });
    const sessionId =
      req.nextUrl.searchParams.get("sessionId") ?? undefined;

    // Make sure any break that has gone over by now is counted.
    const open = await prisma.session.findMany({ where: { status: "Open" } });
    for (const session of open) await settleBreaks(session);

    const [standings, penalties] = await Promise.all([
      getLeaderboard(sessionId),
      prisma.penalty.findMany({
        where: sessionId ? { sessionId } : undefined,
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          session: { select: { title: true } },
          participant: {
            select: {
              id: true,
              sb: true,
              user: { select: { name: true, lastName: true } },
            },
          },
        },
      }),
    ]);

    return {
      standings,
      totalPoints: standings.reduce((sum, s) => sum + s.points, 0),
      penalties,
    };
  }, req);
}
