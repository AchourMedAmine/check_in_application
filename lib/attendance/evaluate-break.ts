/**
 * The break rule, kept free of database access so it can be reasoned about and
 * tested on its own.
 *
 * A "break" is the time between a participant's check-out and their next
 * check-in within the same session. Breaks longer than the session's allowance
 * are over-long — that is what will cost their student branch points once
 * scoring is wired up.
 */
export interface EvaluateBreakInput {
  /** checkOutAt of the previous interval in this session; null on first entry. */
  previousCheckOutAt: Date | null;
  /** Server time of the current check-in (or session.endsAt when closing). */
  now: Date;
  allowanceMinutes: number;
}

export interface BreakEvaluation {
  /** Whole minutes spent outside. 0 when this is the participant's first entry. */
  breakMinutes: number;
  /** True when the break exceeded the session allowance. */
  overAllowance: boolean;
  /** Minutes beyond the allowance, 0 when within it. */
  minutesOver: number;
}

export function evaluateBreak({
  previousCheckOutAt,
  now,
  allowanceMinutes,
}: EvaluateBreakInput): BreakEvaluation {
  if (!previousCheckOutAt) {
    return { breakMinutes: 0, overAllowance: false, minutesOver: 0 };
  }

  const ms = now.getTime() - previousCheckOutAt.getTime();
  // Whole minutes, never negative (clock skew between app instances).
  const breakMinutes = Math.max(0, Math.floor(ms / 60_000));
  const overAllowance = breakMinutes > allowanceMinutes;

  return {
    breakMinutes,
    overAllowance,
    minutesOver: overAllowance ? breakMinutes - allowanceMinutes : 0,
  };
}

/**
 * When a session being closed is considered to have ended: the moment it is
 * closed, but never later than its scheduled `ends_at`.
 *
 *  - Closed early or on time → now. Someone five minutes into a break when
 *    the session ends is within the allowance and owes nothing; measuring to
 *    a scheduled end still hours away would bill them for time that never
 *    happened.
 *  - Closed late (nobody pressed the button) → ends_at. Time after the
 *    session should have finished costs nobody anything.
 */
export function sessionEndedAt(endsAt: Date, closedAt: Date): Date {
  return closedAt < endsAt ? closedAt : endsAt;
}

/** Arriving this long after the real start is still on time — a door queue. */
export const LATE_GRACE_MINUTES = 10;

/**
 * Whole minutes a first check-in came after the session really started, or
 * null when it is on time.
 *
 * "Started" is the moment someone at the door tapped "Session started" —
 * when the moderator or instructor began — not the scheduled time. Until
 * that tap nobody can be late, and a session never marked as started
 * charges no lateness at all: lateness is never charged on a guess.
 */
export function minutesLate({
  startedAt,
  checkInAt,
}: {
  startedAt: Date | null;
  checkInAt: Date;
}): number | null {
  if (!startedAt) return null;
  const minutes = Math.floor((checkInAt.getTime() - startedAt.getTime()) / 60_000);
  return minutes > LATE_GRACE_MINUTES ? minutes : null;
}

interface Interval {
  checkInAt: Date;
  checkOutAt: Date | null;
}

/**
 * The break allowance is CUMULATIVE: one allowance per participant per
 * session, spent across all their breaks. Given one participant's intervals
 * in a session, this returns the total minutes out (a break still running is
 * counted up to `now`) and the break during which the total first went past
 * the allowance — that break carries the one penalty.
 */
export function cumulativeBreaks(
  intervals: Interval[],
  allowanceMinutes: number,
  now: Date
): {
  totalMinutes: number;
  /** Index (in check-in order) of the interval left from when the allowance ran out. */
  crossedAt: number | null;
  /** Whether that break is still running (they never came back). */
  crossedOngoing: boolean;
} {
  const sorted = [...intervals].sort((a, b) => a.checkInAt.getTime() - b.checkInAt.getTime());
  let usedMs = 0;
  let crossedAt: number | null = null;
  let crossedOngoing = false;
  sorted.forEach((iv, i) => {
    if (!iv.checkOutAt) return; // still inside: no break started
    const next = sorted[i + 1];
    const end = next ? next.checkInAt : now;
    usedMs += Math.max(0, end.getTime() - iv.checkOutAt.getTime());
    if (crossedAt === null && Math.floor(usedMs / 60_000) > allowanceMinutes) {
      crossedAt = i;
      crossedOngoing = !next;
    }
  });
  return { totalMinutes: Math.floor(usedMs / 60_000), crossedAt, crossedOngoing };
}

/** Minutes of FINISHED breaks only (the person came back from each). */
export function finishedBreakMinutes(intervals: Interval[]): number {
  const sorted = [...intervals].sort((a, b) => a.checkInAt.getTime() - b.checkInAt.getTime());
  let ms = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const out = sorted[i].checkOutAt;
    if (out) ms += Math.max(0, sorted[i + 1].checkInAt.getTime() - out.getTime());
  }
  return Math.floor(ms / 60_000);
}
