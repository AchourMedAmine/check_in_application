import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { getSessionOrThrow } from "@/lib/attendance/session";
import { settleBreaks } from "@/lib/attendance/settle";
import { accountability, answersFor } from "@/lib/attendance/expected";
import { requireAssigned, requireScanner } from "@/lib/scanners";

const withUser = {
  user: { select: { id: true, email: true, name: true, lastName: true } },
} as const;

// GET /api/sessions/[id]/attendance
// The roster split by state: inside the room, out on a break, never scanned.
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/sessions/[id]/attendance">
) {
  return handleApiRequest(async () => {
    const scanner = await requireScanner(req);
    const { id } = await ctx.params;
    await requireAssigned(scanner, id);
    const session = await getSessionOrThrow(id);

    // Breaks go over on the clock, not on a scan. Settling here means the
    // roster staff are looking at is also what charges the points.
    if (session.status === "Open") await settleBreaks(session);

    const presences = await prisma.presence.findMany({
      where: { sessionId: session.id },
      orderBy: { checkInAt: "desc" },
    });

    // Latest interval per participant decides their current state.
    const latest = new Map<string, (typeof presences)[number]>();
    for (const p of presences) {
      const seen = latest.get(p.participantId);
      if (!seen || p.checkInAt > seen.checkInAt) latest.set(p.participantId, p);
    }

    const insideIds: string[] = [];
    const onBreakIds: string[] = [];
    for (const [participantId, p] of latest) {
      (p.checkOutAt === null ? insideIds : onBreakIds).push(participantId);
    }

    const seenIds = [...latest.keys()];

    // Who is held to account here — the same answer as the absence penalty,
    // so this list is exactly who would be charged as absent right now.
    const who = await accountability(prisma, session);
    const missingIds = [...who.mustAttend].filter((id) => !latest.has(id));

    const [seen, missing] = await Promise.all([
      prisma.participant.findMany({
        where: { id: { in: seenIds } },
        include: withUser,
      }),
      prisma.participant.findMany({
        where: { id: { in: missingIds } },
        include: withUser,
        orderBy: { user: { lastName: "asc" } },
      }),
    ]);

    const byId = new Map(seen.map((p) => [p.id, p]));

    const inside = insideIds
      .map((pid) => {
        const participant = byId.get(pid);
        const p = latest.get(pid)!;
        return participant
          ? { ...participant, since: p.checkInAt, answers: answersFor(who, pid) }
          : null;
      })
      .filter((p) => p !== null)
      .sort((a, b) => b.since.getTime() - a.since.getTime());

    const onBreak = onBreakIds
      .map((pid) => {
        const participant = byId.get(pid);
        const p = latest.get(pid)!;
        return participant
          ? { ...participant, since: p.checkOutAt!, answers: answersFor(who, pid) }
          : null;
      })
      .filter((p) => p !== null)
      .sort((a, b) => a.since.getTime() - b.since.getTime()); // longest break first

    // Walk-ins (and unpaid participants) are recorded but not held to account.
    const unexpected = seenIds.filter((id) => !who.expected.has(id)).length;

    return {
      session,
      stats: {
        inside: inside.length,
        onBreak: onBreak.length,
        missing: missing.length,
        total: who.mustAttend.size,
        unexpected,
      },
      inside,
      onBreak,
      missing,
    };
  }, req);
}
