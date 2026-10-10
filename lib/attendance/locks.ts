import type { Prisma } from "@/generated/prisma/client";

/**
 * Postgres advisory locks that serialise the attendance writes.
 *
 * Several doors scan at once, the roster polls settle breaks, and staff can
 * close a session mid-scan. Without coordination those requests read the same
 * state and write conflicting rows. Two transaction-scoped locks cover it:
 *
 *  - session lock: every scan and settle takes it SHARED, so they run side by
 *    side; closing a session takes it EXCLUSIVE, so it waits for in-flight
 *    work and nothing starts until the close has committed.
 *  - participant lock: one participant's scans in one session run one after
 *    another, so two doors reading the same badge cannot both act on it.
 *
 * Both are `_xact_` locks: released at commit/rollback, never leaked, and safe
 * behind a transaction-mode pooler (Supavisor / PgBouncer).
 *
 * Lock order is always session, then participant — never the reverse.
 */
export type Tx = Prisma.TransactionClient;

/** Interactive transaction limits: a lock can be queued behind a close. */
export const TX_OPTIONS = { maxWait: 5_000, timeout: 15_000 } as const;

export async function lockSession(
  tx: Tx,
  sessionId: string,
  mode: "shared" | "exclusive"
): Promise<void> {
  const key = `checkin:session:${sessionId}`;
  if (mode === "shared") {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${key}, 0))`;
  } else {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
  }
}

export async function lockParticipant(
  tx: Tx,
  sessionId: string,
  participantId: string
): Promise<void> {
  const key = `checkin:participant:${sessionId}:${participantId}`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
}
