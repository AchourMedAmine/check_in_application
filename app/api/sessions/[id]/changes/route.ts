import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { ValidationError } from "@/lib/errors";
import { requireScanner } from "@/lib/scanners";
import { getSessionOrThrow } from "@/lib/attendance/session";
import { getSessionStats } from "@/lib/attendance/scan";
import { TX_OPTIONS } from "@/lib/attendance/locks";

const withUser = {
  user: { select: { id: true, email: true, name: true, lastName: true } },
} as const;

/**
 * How far back each request re-reads. A scan is stamped with its time before
 * its transaction commits, so it can become visible up to a transaction
 * timeout after that stamp; re-reading this window means a poll that ran in
 * between never loses it. Re-sending a change is harmless — the station
 * keeps the newest state per participant.
 */
const OVERLAP_MS = TX_OPTIONS.timeout + 5_000;

// GET /api/sessions/[id]/changes[?since=<ISO>]
// The participants whose state changed since `since` (the `now` of the
// previous answer), with their current state, plus fresh session figures.
// Polled every few seconds by each open scanner, so other stations' scans
// show up without waiting for the full roster refresh. Deliberately light:
// no break settling (the full roster refresh does that), only the rows that
// moved.
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]/changes">
) {
  return handleApiRequest(async () => {
    await requireScanner(req);
    const { id } = await ctx.params;
    const session = await getSessionOrThrow(id);

    const now = new Date();
    const sinceParam = req.nextUrl.searchParams.get("since");
    const since = sinceParam ? new Date(sinceParam) : now;
    if (Number.isNaN(since.getTime())) {
      throw new ValidationError("since must be an ISO date");
    }
    const from = new Date(since.getTime() - OVERLAP_MS);

    const touched = await prisma.presence.findMany({
      where: {
        sessionId: session.id,
        OR: [{ checkInAt: { gt: from } }, { checkOutAt: { gt: from } }],
      },
      select: { participantId: true },
      distinct: ["participantId"],
    });
    const ids = touched.map((t) => t.participantId);

    const [latest, participants, stats] = await Promise.all([
      // Latest interval per participant decides their current state.
      ids.length
        ? prisma.presence.findMany({
            where: { sessionId: session.id, participantId: { in: ids } },
            orderBy: { checkInAt: "desc" },
            distinct: ["participantId"],
          })
        : Promise.resolve([]),
      ids.length
        ? prisma.participant.findMany({
            where: { id: { in: ids } },
            include: withUser,
          })
        : Promise.resolve([]),
      getSessionStats(session),
    ]);

    const byId = new Map(participants.map((p) => [p.id, p]));
    const changes = latest.flatMap((p) => {
      const participant = byId.get(p.participantId);
      if (!participant) return []; // deleted on the website
      const inside = p.checkOutAt === null;
      return [
        {
          participant,
          inside,
          since: (inside ? p.checkInAt : p.checkOutAt!).toISOString(),
        },
      ];
    });

    return { now: now.toISOString(), changes, stats };
  }, req);
}
