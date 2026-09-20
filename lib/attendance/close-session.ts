import { prisma } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";
import { settleBreaks } from "./settle";

export interface CloseSessionResult {
  /** Open intervals ended at the session's end time. */
  closed: number;
  /** Penalties charged to people who left and never came back. */
  charged: number;
  points: number;
}

/**
 * Ends a session and settles the breaks that were still running.
 *
 * A break is normally measured when the participant scans back in. Someone who
 * walks out and never returns never triggers that scan, so without this their
 * absence would cost nothing at all. Closing the session treats the stretch
 * from their last check-out to `ends_at` as the break and charges it.
 *
 * Idempotent: the unique key on (presence_id, reason) means re-running this
 * cannot double-charge, so a retry or an accidental second click is harmless.
 */
export async function closeSession(
  session: Session
): Promise<CloseSessionResult> {
  const endsAt = session.endsAt;

  // Settle every break as it stood at the end of the session. Breaks still
  // running are measured to ends_at and marked LeftEarly.
  const settled = await settleBreaks(session, endsAt, { finalizing: true });

  // Anyone still in the room when it ended simply has their interval closed.
  const openNow = await prisma.presence.findMany({
    where: { sessionId: session.id, checkOutAt: null },
    select: { id: true },
  });

  if (openNow.length > 0) {
    await prisma.presence.updateMany({
      where: { id: { in: openNow.map((p) => p.id) } },
      data: { checkOutAt: endsAt },
    });
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { status: "Closed" },
  });

  return {
    closed: openNow.length,
    charged: settled.charged,
    points: settled.points,
  };
}

export interface BranchStanding {
  sb: string;
  points: number;
  penalties: number;
}

/** Points lost per student branch. Positive numbers are deductions. */
export async function getLeaderboard(
  sessionId?: string
): Promise<BranchStanding[]> {
  const rows = await prisma.penalty.groupBy({
    by: ["sb"],
    where: sessionId ? { sessionId } : undefined,
    _sum: { points: true },
    _count: { _all: true },
  });

  return rows
    .filter((r) => r.sb !== null)
    .map((r) => ({
      sb: r.sb as string,
      points: r._sum.points ?? 0,
      penalties: r._count._all,
    }))
    .sort((a, b) => b.points - a.points);
}
