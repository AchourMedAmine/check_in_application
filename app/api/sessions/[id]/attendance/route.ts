import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { handleApiRequest } from "@/lib/api-handler";
import { getSessionOrThrow } from "@/lib/attendance/session";
import { settleBreaks } from "@/lib/attendance/settle";

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
    const { id } = await ctx.params;
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

    // Who was expected: everyone for the Opening Ceremony, the assigned
    // roster for a workshop.
    const roster =
      session.audience === "Assigned"
        ? await prisma.sessionParticipant.findMany({
            where: { sessionId: session.id },
            select: { participantId: true },
          })
        : null;

    const [seen, missing] = await Promise.all([
      prisma.participant.findMany({
        where: { id: { in: seenIds } },
        include: withUser,
      }),
      prisma.participant.findMany({
        where: roster
          ? {
              id: {
                in: roster.map((r) => r.participantId),
                notIn: seenIds,
              },
            }
          : { id: { notIn: seenIds } },
        include: withUser,
        orderBy: { user: { lastName: "asc" } },
      }),
    ]);

    const expectedIds = roster
      ? new Set(roster.map((r) => r.participantId))
      : null;

    const byId = new Map(seen.map((p) => [p.id, p]));

    const inside = insideIds
      .map((pid) => {
        const participant = byId.get(pid);
        const p = latest.get(pid)!;
        return participant ? { ...participant, since: p.checkInAt } : null;
      })
      .filter((p) => p !== null)
      .sort((a, b) => b.since.getTime() - a.since.getTime());

    const onBreak = onBreakIds
      .map((pid) => {
        const participant = byId.get(pid);
        const p = latest.get(pid)!;
        return participant ? { ...participant, since: p.checkOutAt! } : null;
      })
      .filter((p) => p !== null)
      .sort((a, b) => a.since.getTime() - b.since.getTime()); // longest break first

    // On an Assigned session, walk-ins are recorded but are not part of the
    // expected total.
    const unexpected = expectedIds
      ? seenIds.filter((id) => !expectedIds.has(id)).length
      : 0;

    return {
      session,
      stats: {
        inside: inside.length,
        onBreak: onBreak.length,
        missing: missing.length,
        total: seenIds.length - unexpected + missing.length,
        unexpected,
      },
      inside,
      onBreak,
      missing,
    };
  }, req);
}
