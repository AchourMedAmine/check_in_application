/**
 * Which camera reads become a scan.
 *
 * The camera reports a badge every time it decodes it — every ~1.5 s for as
 * long as the badge stays in view. Sending each of those to the server would
 * flip the participant in and out: the server ignores repeats for only 10 s,
 * after which the next read checks them straight back out.
 *
 * So a badge counts once per appearance. Every read refreshes when that badge
 * was last seen; it can only scan again after it has been out of the frame
 * for GONE_AFTER_MS. This is tracked per badge, so two badges held up at once
 * (the decoder may alternate between them) each scan once instead of taking
 * turns flipping each other back in.
 */
export const GONE_AFTER_MS = 5_000;

/** When each badge was last seen by the camera, accepted or not. */
export type SeenBadges = Map<string, number>;

export function acceptRead(seen: SeenBadges, code: string, now: number): boolean {
  const lastSeen = seen.get(code);
  seen.set(code, now);

  // Forget badges long gone, so the map stays as small as the queue.
  for (const [c, at] of seen) {
    if (now - at >= GONE_AFTER_MS) seen.delete(c);
  }

  return lastSeen === undefined || now - lastSeen >= GONE_AFTER_MS;
}
