import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMoves, type RosterMove } from "../lib/roster-moves";
import type { Participant } from "../lib/types";

const person = (id: string) =>
  ({ id, user: { id: "u" + id, email: "", name: id, lastName: "" } }) as unknown as Participant;

const move = (id: string, inside: boolean, at: string): RosterMove => ({
  participant: person(id),
  inside,
  since: `2026-10-17T13:${at}:00.000Z`,
});

test("another station's scan appears on this phone", () => {
  const mine = new Map([["p1", move("p1", true, "40")]]);
  const merged = mergeMoves(mine, [move("p2", true, "41")]);
  assert.deepEqual([...merged.keys()].sort(), ["p1", "p2"]);
});

test("a newer state replaces an older one", () => {
  const shown = new Map([["p1", move("p1", true, "40")]]);
  const merged = mergeMoves(shown, [move("p1", false, "45")]);
  assert.equal(merged.get("p1")?.inside, false);
});

test("a poll that started before this phone's own scan cannot undo it", () => {
  // This phone just checked p1 out at :45; the poll answer still says inside since :40.
  const shown = new Map([["p1", move("p1", false, "45")]]);
  const merged = mergeMoves(shown, [move("p1", true, "40")]);
  assert.equal(merged.get("p1")?.inside, false);
});

test("re-sent changes leave the roster untouched (no re-render)", () => {
  const shown = new Map([["p1", move("p1", true, "40")]]);
  assert.equal(mergeMoves(shown, [move("p1", true, "40")]), shown);
  assert.equal(mergeMoves(shown, []), shown);
});
