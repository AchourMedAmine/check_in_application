import { prisma } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";
import { lockSession, TX_OPTIONS } from "./locks";
import { chargeBreaks } from "./settle";

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
 * One transaction under the EXCLUSIVE session lock: scans and roster settles
 * already in flight finish first, and any that arrive meanwhile wait, then
 * find the session Closed. Nothing can slip a check-in in, or bill a break
 * as OverBreak, halfway through the close.
 *
 * Idempotent: the unique key on (presence_id, reason) means re-running this
 * cannot double-charge, so a retry or an accidental second click is harmless.
 */
export async function closeSession(
  session: Session
): Promise<CloseSessionResult> {
  const endsAt = session.endsAt;

  return prisma.$transaction(async (tx) => {
    await lockSession(tx, session.id, "exclusive");

    await tx.session.update({
      where: { id: session.id },
      data: { status: "Closed" },
    });

    // Settle every break as it stood at the end of the session. Breaks still
    // running are measured to ends_at and marked LeftEarly.
    const settled = await chargeBreaks(tx, session, endsAt, {
      finalizing: true,
    });

    // Anyone still in the room when it ended simply has their interval closed.
    const { count: closed } = await tx.presence.updateMany({
      where: { sessionId: session.id, checkOutAt: null },
      data: { checkOutAt: endsAt },
    });

    return {
      closed,
      charged: settled.charged,
      points: settled.points,
    };
  }, TX_OPTIONS);
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
