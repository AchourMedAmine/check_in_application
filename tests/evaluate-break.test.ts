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
