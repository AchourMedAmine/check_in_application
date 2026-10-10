import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptRead, GONE_AFTER_MS } from "../lib/scan-gate";

/** Feeds camera reads through the gate; returns which were accepted. */
function run(reads: [code: string, at: number][]) {
  const seen = new Map<string, number>();
  return reads.map(([code, at]) => acceptRead(seen, code, at));
}

/** The camera re-reads what's in view every 1.5 s. */
const held = (codes: string[], seconds: number) =>
  Array.from({ length: Math.floor(seconds / 1.5) + 1 }, (_, i) =>
    codes.map((c, j) => [c, i * 1500 + j * 100] as [string, number])
  ).flat();

test("the first read of a badge scans", () => {
  assert.deepEqual(run([["p1", 0]]), [true]);
});

test("a badge held in view for a minute scans once", () => {
  const accepted = run(held(["p1"], 60));
  assert.equal(accepted.filter(Boolean).length, 1);
  assert.equal(accepted[0], true);
});

test("the same badge scans again once it has been out of the frame", () => {
  assert.deepEqual(run([["p1", 0], ["p1", GONE_AFTER_MS]]), [true, true]);
  assert.deepEqual(run([["p1", 0], ["p1", GONE_AFTER_MS - 1]]), [true, false]);
});

test("a short drop-out between reads does not count as leaving", () => {
  // A missed decode or two (3 s gap) while the badge is still being held.
  assert.deepEqual(
    run([["p1", 0], ["p1", 1500], ["p1", 4500], ["p1", 6000]]),
    [true, false, false, false]
  );
});

test("two badges held up together each scan once, not in turns", () => {
  const reads = held(["p1", "p2"], 60);
  const accepted = run(reads);
  const scansOf = (c: string) => reads.filter(([code], i) => code === c && accepted[i]).length;
  assert.equal(scansOf("p1"), 1);
  assert.equal(scansOf("p2"), 1);
});

test("people one after another at the door all scan", () => {
  assert.deepEqual(run([["p1", 0], ["p2", 800], ["p3", 1600]]), [true, true, true]);
});
