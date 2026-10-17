import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBreak, sessionEndedAt } from "../lib/attendance/evaluate-break";

const ALLOWANCE = 15;
const base = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const plus = (minutes: number, seconds = 0) =>
  new Date(base.getTime() + minutes * 60_000 + seconds * 1000);

const run = (previousCheckOutAt: Date | null, now: Date) =>
  evaluateBreak({ previousCheckOutAt, now, allowanceMinutes: ALLOWANCE });

test("a first entry is not a break", () => {
  const r = run(null, base);
  assert.equal(r.breakMinutes, 0);
  assert.equal(r.overAllowance, false);
});

test("a break inside the allowance is not penalised", () => {
  const r = run(base, plus(14));
  assert.equal(r.breakMinutes, 14);
  assert.equal(r.overAllowance, false);
  assert.equal(r.minutesOver, 0);
});

test("a break of exactly the allowance is still within it", () => {
  const r = run(base, plus(ALLOWANCE));
  assert.equal(r.breakMinutes, 15);
  assert.equal(r.overAllowance, false);
});

test("one minute past the allowance is over", () => {
  const r = run(base, plus(16));
  assert.equal(r.breakMinutes, 16);
  assert.equal(r.overAllowance, true);
  assert.equal(r.minutesOver, 1);
});

test("part-minutes round down, so 14m59s is 14 minutes", () => {
  const r = run(base, plus(14, 59));
  assert.equal(r.breakMinutes, 14);
  assert.equal(r.overAllowance, false);
});

test("minutesOver reports how far past the allowance", () => {
  const r = run(base, plus(25));
  assert.equal(r.minutesOver, 10);
});

test("clock skew cannot produce a negative break", () => {
  const r = run(plus(5), base);
  assert.equal(r.breakMinutes, 0);
  assert.equal(r.overAllowance, false);
});

test("the allowance is per session, not global", () => {
  const generous = evaluateBreak({
    previousCheckOutAt: base,
    now: plus(25),
    allowanceMinutes: 30,
  });
  assert.equal(generous.overAllowance, false);
});

// ── What the penalty depends on ──────────────────────────────────────────
// A penalty is written exactly when `overAllowance` is true, so these cases
// are the boundary between "no points lost" and "the branch is charged".

test("a break one second over the allowance is still not over", () => {
  // 15m00s is within, and part-minutes floor, so 15m59s is still 15 minutes.
  const r = run(base, plus(15, 59));
  assert.equal(r.breakMinutes, 15);
  assert.equal(r.overAllowance, false, "must not charge for a rounded minute");
});

test("the first minute that charges is 16", () => {
  assert.equal(run(base, plus(16)).overAllowance, true);
});

test("a very long absence is reported in full, not capped", () => {
  const r = run(base, plus(140));
  assert.equal(r.breakMinutes, 140);
  assert.equal(r.minutesOver, 125);
});

// ── Closing a session ────────────────────────────────────────────────────

test("closing early ends the session at the moment it is closed", () => {
  const endsAt = plus(120);
  assert.deepEqual(sessionEndedAt(endsAt, plus(30)), plus(30));
});

test("closing late ends the session at its scheduled end", () => {
  const endsAt = plus(120);
  assert.deepEqual(sessionEndedAt(endsAt, plus(600)), endsAt);
});

test("a break 5 minutes old when the session is closed early is not charged", () => {
  // Left at 0, session closed at 5, although scheduled to run to 120.
  const end = sessionEndedAt(plus(120), plus(5));
  assert.equal(run(base, end).overAllowance, false);
  assert.equal(run(base, end).breakMinutes, 5);
});

test("a break past the allowance when the session is closed is charged", () => {
  const end = sessionEndedAt(plus(120), plus(16));
  assert.equal(run(base, end).overAllowance, true);
});

test("time after the scheduled end never counts, however late the close", () => {
  // Left 5 minutes before the end; nobody closed it until hours later.
  const end = sessionEndedAt(plus(120), plus(600));
  assert.equal(run(plus(115), end).breakMinutes, 5);
  assert.equal(run(plus(115), end).overAllowance, false);
});

// ── Arriving late ───────────────────────────────────────────────────────

import { minutesLate } from "../lib/attendance/evaluate-break";

/** Minutes are relative to the moment the session was marked as started. */
const late = (checkInMinutes: number, started: boolean = true) =>
  minutesLate({ startedAt: started ? base : null, checkInAt: plus(checkInMinutes) });

test("before the session really starts, nobody is late", () => {
  assert.equal(late(-25), null);
  assert.equal(late(0), null);
});

test("up to 10 minutes after the real start is still on time (door queue)", () => {
  assert.equal(late(10), null);
  assert.equal(minutesLate({ startedAt: base, checkInAt: plus(10, 59) }), null);
});

test("the 11th minute is late, and lateness counts from the real start", () => {
  assert.equal(late(11), 11);
  assert.equal(late(25), 25);
});

test("a session nobody marked as started charges no lateness at all", () => {
  assert.equal(late(90, false), null);
});

// ── Cumulative allowance: 15 minutes of breaks per session ─────────────

import { cumulativeBreaks, finishedBreakMinutes } from "../lib/attendance/evaluate-break";

/** An interval from minute `a` to minute `b` (null = still inside). */
const iv = (a: number, b: number | null) => ({ checkInAt: plus(a), checkOutAt: b === null ? null : plus(b) });

test("two 10-minute breaks: 20 in total, the second one crosses the 15", () => {
  // in 0–10, out 10–20, in 20–30, out 30–40, in 40–
  const r = cumulativeBreaks([iv(0, 10), iv(20, 30), iv(40, null)], 15, plus(60));
  assert.equal(r.totalMinutes, 20);
  assert.equal(r.crossedAt, 1);
  assert.equal(r.crossedOngoing, false);
});

test("two 7-minute breaks: 14 in total, no penalty", () => {
  const r = cumulativeBreaks([iv(0, 10), iv(17, 30), iv(37, null)], 15, plus(60));
  assert.equal(r.totalMinutes, 14);
  assert.equal(r.crossedAt, null);
});

test("exactly 15 minutes in total is still within the allowance", () => {
  const r = cumulativeBreaks([iv(0, 10), iv(25, null)], 15, plus(60));
  assert.equal(r.totalMinutes, 15);
  assert.equal(r.crossedAt, null);
});

test("a break still running counts up to now, and can be the one that crosses", () => {
  // 10 min earlier, now out for 6 more → 16
  const r = cumulativeBreaks([iv(0, 10), iv(20, 30)], 15, plus(36));
  assert.equal(r.totalMinutes, 16);
  assert.equal(r.crossedAt, 1);
  assert.equal(r.crossedOngoing, true);
});

test("once crossed, later breaks add minutes but never a second crossing", () => {
  const r = cumulativeBreaks([iv(0, 10), iv(30, 40), iv(60, null)], 15, plus(90));
  assert.equal(r.crossedAt, 0);
  assert.equal(r.totalMinutes, 40);
});

test("finished breaks only: a running break is not counted", () => {
  assert.equal(finishedBreakMinutes([iv(0, 10), iv(18, 30)]), 8);
  assert.equal(finishedBreakMinutes([iv(0, 10), iv(18, 30), iv(40, null)]), 18);
});
