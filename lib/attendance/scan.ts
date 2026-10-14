import { prisma } from "@/lib/db";
import type { Penalty, Presence, SB, Session } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import { evaluateBreak, minutesLate, type BreakEvaluation } from "./evaluate-break";
import { accountability, hasList, notChargedReason, standingOf } from "./expected";
import { lockParticipant, lockSession, TX_OPTIONS, type Tx } from "./locks";
import { chargeBreaks } from "./settle";

/**
 * Each participant moves through a simple state machine *per session*:
 *
 *     NOT_CHECKED_IN ──scan──▶ INSIDE ──scan──▶ ON_BREAK ──scan──▶ INSIDE ...
 *
 * `presences` stores one row per INSIDE interval: `check_in_at` set on entry,
 * `check_out_at` filled in on exit. A participant with an open row (no
 * check-out) is inside; one whose latest row is closed is on a break.
 */
export type ScanAction = "CheckedIn" | "CheckedOut" | "Duplicate";

/**
 * A scan landing within this window of the previous one is treated as the
 * scanner firing twice (USB wedges double-trigger, the camera re-reads the
 * same code, a participant re-taps) rather than as a real state change.
 * Nobody genuinely enters and leaves inside ten seconds.
 */
export const DUPLICATE_WINDOW_MS = 10_000;

export interface ScanOutcome {
  action: ScanAction;
  presence: Presence;
  /** The state the participant is in after this scan. */
  inside: boolean;
  /** Set when a check-in ended a break: how long they were out. */
  breakTaken: BreakEvaluation | null;
  /** Written when that break was over the allowance, or for arriving late. */
  penalty: Penalty | null;
  /** Set on check-out: how long they had been inside. */
  insideMinutes: number | null;
  /** Set on a first check-in past the grace period: minutes after the start. */
  lateMinutes: number | null;
  /** Excused here by a technical challenge at the same time: never charged. */
  excused: boolean;
  /** Why this person is never charged here (mandatory sessions); null = they are. */
  notCharged: string | null;
  /**
   * For a session with a list (Assigned): whether they are on it. False is
   * someone who should not be here — the door is told at once. Null for an
   * Everyone session, or one whose list isn't loaded yet.
   */
  registered: boolean | null;
}

/**
 * Records one badge scan and returns what it did. The direction is derived
 * from stored state, never from the client, so two doors cannot disagree.
 *
 * Runs as one transaction under the participant lock: two doors reading the
 * same badge take turns, and the second sees the first one's write (and
 * reports a Duplicate). All or nothing — an error means nothing was recorded,
 * so staff can safely scan again.
 */
export async function recordScan({
  participant,
  session,
  scannerId,
  stationId,
  now = new Date(),
}: {
  /** `sb` is snapshotted onto any penalty, so it must come from the caller. */
  participant: { id: string; sb: SB | null };
  session: Session;
  /** The signed-in account doing the scan, kept on the presence row. */
  scannerId?: string;
  stationId?: string;
  now?: Date;
}): Promise<ScanOutcome> {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, session.id, "shared");
    await lockParticipant(tx, session.id, participant.id);

    // The route checked the status before the lock; a close may have
    // committed while this scan waited.
    const current = await tx.session.findUnique({
      where: { id: session.id },
      select: { status: true, startedAt: true },
    });
    if (current?.status !== "Open") {
      throw new ValidationError(`Session "${session.title}" is not open`);
    }

    return applyScan(
      tx,
      participant,
      // The start may have been tapped after the caller read the session.
      { ...session, startedAt: current.startedAt },
      now,
      { scannerId, stationId }
    );
  }, TX_OPTIONS);
}

async function applyScan(
  tx: Tx,
  participant: { id: string; sb: SB | null },
  session: Session,
  now: Date,
  by: { scannerId?: string; stationId?: string }
): Promise<ScanOutcome> {
  const participantId = participant.id;
  const [standing, listed] = await Promise.all([
    standingOf(tx, session, participantId),
    hasList(tx, session),
  ]);
  const quiet = {
    lateMinutes: null,
    excused: standing.excused,
    notCharged: session.mandatory ? notChargedReason(session, standing) : null,
    // No list yet (a workshop whose roster isn't loaded): nobody is flagged.
    registered: listed ? standing.expected : null,
  };

  const open = await tx.presence.findFirst({
    where: { participantId, sessionId: session.id, checkOutAt: null },
  });

  // ── Currently inside ────────────────────────────────────────────────────
  if (open) {
    const sinceCheckIn = now.getTime() - open.checkInAt.getTime();

    if (sinceCheckIn < DUPLICATE_WINDOW_MS) {
      return {
        action: "Duplicate",
        presence: open,
        inside: true,
        breakTaken: null,
        penalty: null,
        insideMinutes: null,
        ...quiet,
      };
    }

    const presence = await tx.presence.update({
      where: { id: open.id },
      data: { checkOutAt: now, checkOutScannerId: by.scannerId },
    });

    return {
      action: "CheckedOut",
      presence,
      inside: false,
      breakTaken: null,
      penalty: null,
      insideMinutes: Math.max(0, Math.floor(sinceCheckIn / 60_000)),
      ...quiet,
    };
  }

  // ── Not inside: either never scanned, or on a break ─────────────────────
  const last = await tx.presence.findFirst({
    where: { participantId, sessionId: session.id },
    orderBy: { checkInAt: "desc" },
  });

  if (
    last?.checkOutAt &&
    now.getTime() - last.checkOutAt.getTime() < DUPLICATE_WINDOW_MS
  ) {
    return {
      action: "Duplicate",
      presence: last,
      inside: false,
      breakTaken: null,
      penalty: null,
      insideMinutes: null,
      ...quiet,
    };
  }

  const breakTaken = last?.checkOutAt
    ? evaluateBreak({
        previousCheckOutAt: last.checkOutAt,
        now,
        allowanceMinutes: session.breakAllowanceMinutes,
      })
    : null;

  const presence = await tx.presence.create({
    data: {
      participantId,
      sessionId: session.id,
      checkInAt: now,
      checkInScannerId: by.scannerId,
      stationId: by.stationId,
    },
  });

  // The penalty for the break they just ended was already owed the moment it
  // passed the allowance, so it may exist from an earlier settle. Either way
  // this records the final length and returns it for the banner. Only this
  // participant is settled here; the roster poll settles everyone else.
  await chargeBreaks(tx, session, now, { participantId });
  let penalty =
    breakTaken?.overAllowance && last
      ? await tx.penalty.findFirst({
          where: { presenceId: last.id, reason: "OverBreak" },
        })
      : null;

  // Their first scan into the session: arriving more than the grace period
  // after it really started costs the branch points (only where this
  // session holds them to account).
  // Attendance-only sessions (the hackathon…) have no lateness at all.
  const lateMinutes =
    last || !session.mandatory
      ? null
      : minutesLate({ startedAt: session.startedAt, checkInAt: now });
  if (lateMinutes !== null && session.mandatory && standing.answers) {
    await tx.penalty.createMany({
      data: {
        participantId,
        sessionId: session.id,
        presenceId: presence.id,
        sb: participant.sb,
        breakMinutes: lateMinutes,
        points: session.penaltyPoints,
        reason: "Late",
      },
      skipDuplicates: true,
    });
    penalty = await tx.penalty.findFirst({
      where: { presenceId: presence.id, reason: "Late" },
    });
  }

  return {
    action: "CheckedIn",
    presence,
    inside: true,
    breakTaken,
    penalty,
    insideMinutes: null,
    lateMinutes,
    excused: standing.excused,
    notCharged: quiet.notCharged,
    registered: quiet.registered,
  };
}

export interface SessionStats {
  /** Participants currently in the room. */
  inside: number;
  /** Checked in at some point, currently out. */
  onBreak: number;
  /** Held to account here but never scanned — charged as absent at close. */
  missing: number;
  /** How many this session holds to account: expected, minus excused. */
  total: number;
  /** Scanned in although not expected here (walk-ins, unpaid). */
  unexpected: number;
}

/**
 * The live figures. `total` and `missing` use the same definition as the
 * absence penalty (lib/attendance/expected.ts), so "not scanned yet" is
 * exactly who will be charged as absent if the session closed now.
 */
export async function getSessionStats(session: Session): Promise<SessionStats> {
  const [presences, who] = await Promise.all([
    prisma.presence.findMany({
      where: { sessionId: session.id },
      select: { participantId: true, checkOutAt: true },
    }),
    accountability(prisma, session),
  ]);

  const insideIds = new Set(
    presences.filter((p) => p.checkOutAt === null).map((p) => p.participantId)
  );
  const seenIds = new Set(presences.map((p) => p.participantId));
  const seen = [...seenIds];

  return {
    inside: insideIds.size,
    onBreak: seenIds.size - insideIds.size,
    missing: [...who.mustAttend].filter((id) => !seenIds.has(id)).length,
    total: who.mustAttend.size,
    unexpected: seen.filter((id) => !who.expected.has(id)).length,
  };
}
