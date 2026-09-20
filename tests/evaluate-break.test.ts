import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateBreak } from "../lib/attendance/evaluate-break";

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
