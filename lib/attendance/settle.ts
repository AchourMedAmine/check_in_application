import { prisma } from "@/lib/db";
import type { Presence, Prisma, Session } from "@/generated/prisma/client";
import { evaluateBreak } from "./evaluate-break";
import { lockSession, TX_OPTIONS, type Tx } from "./locks";
import { accountability, answersFor, type Accountability } from "./expected";

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
 * It runs whenever the roster or leaderboard is read, so penalties appear on
 * their own without a scheduler. A scan settles only the scanned participant.
 */
export interface SettleResult {
  /** Penalties newly written by this call. */
  charged: number;
  points: number;
}

/**
 * Settles an Open session in its own transaction. Holds the session lock
 * shared, so it runs alongside scans but never overlaps a close — which is
 * what would otherwise bill one break as both OverBreak and LeftEarly.
 */
export async function settleBreaks(
  session: Session,
  now: Date = new Date()
): Promise<SettleResult> {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, session.id, "shared");

    // The caller read the status before taking the lock; a close may have
    // committed since. Settling a closed session against the wall clock
    // would rewrite its final LeftEarly charges.
    const current = await tx.session.findUnique({
      where: { id: session.id },
      select: { status: true },
    });
    if (current?.status !== "Open") return { charged: 0, points: 0 };

    return chargeBreaks(tx, session, now);
  }, TX_OPTIONS);
}

/**
 * The settling itself, on the caller's transaction. The caller must hold the
 * session lock (shared, or exclusive when finalizing).
 */
export async function chargeBreaks(
  tx: Tx,
  session: Session,
  now: Date,
  options: {
    finalizing?: boolean;
    participantId?: string;
    /** Who this session may charge; looked up when not given. */
    who?: Accountability;
  } = {}
): Promise<SettleResult> {
  // Attendance is still recorded at an optional session, but breaks there
  // cost nothing.
  if (!session.mandatory) return { charged: 0, points: 0 };

  const presences = await tx.presence.findMany({
    where: { sessionId: session.id, participantId: options.participantId },
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

  // Everyone in the room answers for their breaks — except those excused by
  // a technical challenge at the same time, and walk-ins to someone else's
  // workshop (they answer at their own).
  const who = options.who ?? (await accountability(tx, session));
  const owed = overdue.filter((b) => answersFor(who, b.presence.participantId));
  if (owed.length === 0) return { charged: 0, points: 0 };

  const existing = await tx.penalty.findMany({
    where: {
      presenceId: { in: owed.map((b) => b.presence.id) },
      // The first interval may also carry a Late penalty — not a break's.
      reason: { in: ["OverBreak", "LeftEarly"] },
    },
  });
  const byPresence = new Map(existing.map((p) => [p.presenceId, p]));

  const sbs = await tx.participant.findMany({
    where: { id: { in: [...new Set(owed.map((b) => b.presence.participantId))] } },
    select: { id: true, sb: true },
  });
  const sbOf = new Map(sbs.map((p) => [p.id, p.sb]));

  const toCreate: Prisma.PenaltyCreateManyInput[] = [];

  for (const b of owed) {
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
        await tx.penalty.update({
          where: { id: already.id },
          data: { breakMinutes: b.evaluation.breakMinutes, reason },
        });
      }
      continue;
    }

    toCreate.push({
      participantId: b.presence.participantId,
      sessionId: session.id,
      presenceId: b.presence.id,
      sb: sbOf.get(b.presence.participantId) ?? null,
      breakMinutes: b.evaluation.breakMinutes,
      points: session.penaltyPoints,
      reason,
    });
  }

  if (toCreate.length === 0) return { charged: 0, points: 0 };

  // Another door or a roster poll may be settling the same break right now.
  // ON CONFLICT DO NOTHING lets the loser of that race simply skip the row
  // instead of failing the whole request.
  const { count } = await tx.penalty.createMany({
    data: toCreate,
    skipDuplicates: true,
  });

  return { charged: count, points: count * session.penaltyPoints };
}
