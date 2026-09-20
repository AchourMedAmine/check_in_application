import { prisma } from "@/lib/db";
import type { Presence, Session } from "@/generated/prisma/client";
import { evaluateBreak } from "./evaluate-break";

/**
 * Charges the breaks that have run past the session allowance.
 *
 * A penalty is owed the moment a break crosses the allowance — NOT when the
 * participant scans back in. Someone still outside at minute 16 has already
 * cost their branch the points; whether they return at 20 minutes, at 90, or
 * never changes only the length recorded, never whether it was charged.
 *
 * Each penalty hangs off the interval the participant LEFT from, so it is
 * decided entirely by `check_out_at` + the allowance. That makes this function
 * safe to run at any moment and as often as you like: it derives the same
 * answer from stored timestamps, and the unique key on (presence_id, reason)
 * stops a break being billed twice.
 *
 * It is called on every scan and whenever the roster is read, so penalties
 * appear on their own without a scheduler.
 */
export interface SettleResult {
  /** Penalties newly written by this call. */
  charged: number;
  points: number;
}

export async function settleBreaks(
  session: Session,
  now: Date = new Date(),
  options: { finalizing?: boolean } = {}
): Promise<SettleResult> {
  const presences = await prisma.presence.findMany({
    where: { sessionId: session.id },
    orderBy: [{ participantId: "asc" }, { checkInAt: "asc" }],
  });

  if (presences.length === 0) return { charged: 0, points: 0 };

  // Every break in the session: the interval left from, and when it ended
  // (the next check-in, or — for a break still running — `now`).
  const breaks: { presence: Presence; endedAt: Date; ongoing: boolean }[] = [];

  const byParticipant = new Map<string, Presence[]>();
  for (const p of presences) {
    const list = byParticipant.get(p.participantId) ?? [];
    list.push(p);
    byParticipant.set(p.participantId, list);
  }

  for (const list of byParticipant.values()) {
    for (let i = 0; i < list.length; i++) {
      const presence = list[i];
      if (!presence.checkOutAt) continue; // still inside: no break started

      const next = list[i + 1];
      if (next) {
        breaks.push({ presence, endedAt: next.checkInAt, ongoing: false });
      } else {
        // Still outside. The break has lasted until now.
        breaks.push({ presence, endedAt: now, ongoing: true });
      }
    }
  }

  const overdue = breaks
    .map((b) => ({
      ...b,
      evaluation: evaluateBreak({
        previousCheckOutAt: b.presence.checkOutAt,
        now: b.endedAt,
        allowanceMinutes: session.breakAllowanceMinutes,
      }),
    }))
    .filter((b) => b.evaluation.overAllowance);

  if (overdue.length === 0) return { charged: 0, points: 0 };

  const existing = await prisma.penalty.findMany({
    where: { presenceId: { in: overdue.map((b) => b.presence.id) } },
  });
  const byPresence = new Map(existing.map((p) => [p.presenceId, p]));

  const sbs = await prisma.participant.findMany({
    where: { id: { in: [...new Set(overdue.map((b) => b.presence.participantId))] } },
    select: { id: true, sb: true },
  });
  const sbOf = new Map(sbs.map((p) => [p.id, p.sb]));

  let charged = 0;
  let points = 0;

  for (const b of overdue) {
    const already = byPresence.get(b.presence.id);
    const reason =
      b.ongoing && options.finalizing ? "LeftEarly" : ("OverBreak" as const);

    if (already) {
      // The charge stands; only refine how long the break turned out to be,
      // so the log reads "45 min" rather than the 16 minutes we first saw.
      if (
        already.breakMinutes !== b.evaluation.breakMinutes ||
        already.reason !== reason
      ) {
        await prisma.penalty.update({
          where: { id: already.id },
          data: { breakMinutes: b.evaluation.breakMinutes, reason },
        });
      }
      continue;
    }

    await prisma.penalty.create({
      data: {
        participantId: b.presence.participantId,
        sessionId: session.id,
        presenceId: b.presence.id,
        sb: sbOf.get(b.presence.participantId) ?? null,
        breakMinutes: b.evaluation.breakMinutes,
        points: session.penaltyPoints,
        reason,
      },
    });

    charged++;
    points += session.penaltyPoints;
  }

  return { charged, points };
}
