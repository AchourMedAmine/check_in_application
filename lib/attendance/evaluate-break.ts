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
