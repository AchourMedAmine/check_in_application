import { prisma } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";
import { lockSession, TX_OPTIONS } from "./locks";
import { chargeBreaks } from "./settle";
import { sessionEndedAt } from "./evaluate-break";

export interface CloseSessionResult {
  /** Open intervals ended when the session ended. */
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
 * absence would cost nothing at all. Closing the session measures the stretch
 * from their last check-out to the end of the session (see sessionEndedAt)
 * and charges it as LeftEarly — but only if that stretch is over the
 * allowance, exactly as for any other break.
 *
 * One transaction under the EXCLUSIVE session lock: scans and roster settles
 * already in flight finish first, and any that arrive meanwhile wait, then
 * find the session Closed. Nothing can slip a check-in in, or bill a break
 * as OverBreak, halfway through the close.
 *
 * Closing an already Closed session does nothing. That makes a second click
 * harmless — and it has to: the end is measured from the first close, so a
 * re-close twenty minutes later must not re-measure the breaks and bill
 * someone who was within the allowance when the session really ended.
 */
export async function closeSession(
  session: Session,
  now: Date = new Date()
): Promise<CloseSessionResult> {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, session.id, "exclusive");

    // Re-read under the lock: the caller's copy may predate another close.
    const current = await tx.session.findUnique({
      where: { id: session.id },
      select: { status: true, endsAt: true },
    });
    if (!current || current.status === "Closed") {
      return { closed: 0, charged: 0, points: 0 };
    }

    const endedAt = sessionEndedAt(current.endsAt, now);

    await tx.session.update({
      where: { id: session.id },
      data: { status: "Closed" },
    });

    // Settle every break as it stood when the session ended. Breaks still
    // running are measured to that moment, and charged as LeftEarly only if
    // they are over the allowance by then.
    const settled = await chargeBreaks(tx, session, endedAt, {
      finalizing: true,
    });

    // Anyone still in the room when it ended simply has their interval
    // closed at that moment — never at a scheduled time still in the future.
    const { count: closed } = await tx.presence.updateMany({
      where: { sessionId: session.id, checkOutAt: null },
      data: { checkOutAt: endedAt },
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
