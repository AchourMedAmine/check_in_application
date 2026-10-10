import { prisma } from "@/lib/db";
import type { Penalty, Presence, SB, Session } from "@/generated/prisma/client";
import { ValidationError } from "@/lib/errors";
import { evaluateBreak, type BreakEvaluation } from "./evaluate-break";
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
  /** Written when that break was over the allowance. */
  penalty: Penalty | null;
  /** Set on check-out: how long they had been inside. */
  insideMinutes: number | null;
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
  stationId,
  now = new Date(),
}: {
  /** `sb` is snapshotted onto any penalty, so it must come from the caller. */
  participant: { id: string; sb: SB | null };
  session: Session;
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
      select: { status: true },
    });
    if (current?.status !== "Open") {
      throw new ValidationError(`Session "${session.title}" is not open`);
    }

    return applyScan(tx, participant.id, session, now, stationId);
  }, TX_OPTIONS);
}

async function applyScan(
  tx: Tx,
  participantId: string,
  session: Session,
  now: Date,
  stationId: string | undefined
): Promise<ScanOutcome> {
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
      };
    }

    const presence = await tx.presence.update({
      where: { id: open.id },
      data: { checkOutAt: now },
    });

    return {
      action: "CheckedOut",
      presence,
      inside: false,
      breakTaken: null,
      penalty: null,
      insideMinutes: Math.max(0, Math.floor(sinceCheckIn / 60_000)),
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
      stationId,
    },
  });

  // The penalty for the break they just ended was already owed the moment it
  // passed the allowance, so it may exist from an earlier settle. Either way
  // this records the final length and returns it for the banner. Only this
  // participant is settled here; the roster poll settles everyone else.
  await chargeBreaks(tx, session, now, { participantId });
  const penalty =
    breakTaken?.overAllowance && last
      ? await tx.penalty.findFirst({ where: { presenceId: last.id } })
      : null;

  return {
    action: "CheckedIn",
    presence,
    inside: true,
    breakTaken,
    penalty,
    insideMinutes: null,
  };
}

export interface SessionStats {
  /** Participants currently in the room. */
  inside: number;
  /** Checked in at some point, currently out. */
  onBreak: number;
  /** Expected but never scanned for this session. */
  missing: number;
  /** How many are expected: everyone, or the assigned roster. */
  total: number;
  /** Scanned in although not on the roster (Assigned sessions only). */
  unexpected: number;
}

/**
 * How many participants are expected at a session: everyone for the Opening
 * Ceremony, only the assigned roster for a workshop.
 */
export async function countExpected(session: Session): Promise<number> {
  return session.audience === "Everyone"
    ? prisma.participant.count()
    : prisma.sessionParticipant.count({ where: { sessionId: session.id } });
}

export async function getSessionStats(session: Session): Promise<SessionStats> {
  const [presences, total, roster] = await Promise.all([
    prisma.presence.findMany({
      where: { sessionId: session.id },
      select: { participantId: true, checkOutAt: true },
    }),
    countExpected(session),
    session.audience === "Assigned"
      ? prisma.sessionParticipant.findMany({
          where: { sessionId: session.id },
          select: { participantId: true },
        })
      : Promise.resolve(null),
  ]);

  const insideIds = new Set(
    presences.filter((p) => p.checkOutAt === null).map((p) => p.participantId)
  );
  const seenIds = new Set(presences.map((p) => p.participantId));

  // On an Assigned session someone can turn up who is not on the roster. They
  // are recorded, but they neither reduce `missing` nor count towards `total`.
  const expectedIds = roster
    ? new Set(roster.map((r) => r.participantId))
    : null;
  const seenExpected = expectedIds
    ? [...seenIds].filter((id) => expectedIds.has(id)).length
    : seenIds.size;

  return {
    inside: insideIds.size,
    onBreak: seenIds.size - insideIds.size,
    missing: total - seenExpected,
    total,
    unexpected: seenIds.size - seenExpected,
  };
}
