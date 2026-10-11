import type { Participant } from "@/lib/types";

/**
 * A participant's state change made since the station's roster was fetched,
 * applied on top of it — whether this phone scanned them or another one did.
 */
export interface RosterMove {
  participant: Participant;
  /** True when the participant is inside after the change. */
  inside: boolean;
  /** When that state began (check-in or check-out time), ISO string. */
  since: string;
}

/**
 * Applies incoming moves to the ones a station already shows, keyed by
 * participant. A move only replaces one that is not newer than itself: a
 * changes request that began just before this phone's own scan must not
 * undo it. Returns the same map when nothing changed, so React skips the
 * re-render.
 */
export function mergeMoves(
  current: Map<string, RosterMove>,
  incoming: RosterMove[]
): Map<string, RosterMove> {
  let next: Map<string, RosterMove> | null = null;

  for (const move of incoming) {
    const existing = (next ?? current).get(move.participant.id);
    if (
      existing &&
      (Date.parse(existing.since) > Date.parse(move.since) ||
        (existing.since === move.since && existing.inside === move.inside))
    ) {
      continue; // already showing this, or something newer
    }
    next ??= new Map(current);
    next.set(move.participant.id, move);
  }

  return next ?? current;
}
