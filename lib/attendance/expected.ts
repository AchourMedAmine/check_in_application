import { prisma } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";
import type { Tx } from "./locks";

/**
 * Who a session holds to account — the single answer used by the counts,
 * the "not scanned" list and every penalty, so what staff see as missing is
 * exactly who gets charged as absent.
 *
 *  - Expected: for an Everyone session, every participant who has paid and
 *    is not banned (unpaid registrants are not coming); for an Assigned
 *    session, its roster.
 *  - Excused: anyone on the roster of a technical-challenge session that
 *    overlaps this one in time — the rule exempts them.
 *  - Chargeable: expected and not excused. Only these can lose points here;
 *    a walk-in to someone else's workshop is charged at their own.
 */
type Db = Tx | typeof prisma;

/** A participant who is actually attending the congress. */
export const attendeeWhere = { paid: true, banned: false } as const;

export async function expectedIds(db: Db, session: Session): Promise<Set<string>> {
  const rows =
    session.audience === "Everyone"
      ? (await db.participant.findMany({ where: attendeeWhere, select: { id: true } })).map(
          (p) => p.id
        )
      : (
          await db.sessionParticipant.findMany({
            where: { sessionId: session.id },
            select: { participantId: true },
          })
        ).map((r) => r.participantId);
  return new Set(rows);
}

export async function excusedIds(db: Db, session: Session): Promise<Set<string>> {
  if (session.challenge) return new Set(); // a challenge doesn't excuse from itself
  const rows = await db.sessionParticipant.findMany({
    where: {
      session: {
        challenge: true,
        id: { not: session.id },
        startsAt: { lt: session.endsAt },
        endsAt: { gt: session.startsAt },
      },
    },
    select: { participantId: true },
    distinct: ["participantId"],
  });
  return new Set(rows.map((r) => r.participantId));
}

export interface Accountability {
  expected: Set<string>;
  excused: Set<string>;
  /** Expected and not excused: the people this session can charge. */
  chargeable: Set<string>;
}

export async function accountability(db: Db, session: Session): Promise<Accountability> {
  const [expected, excused] = await Promise.all([
    expectedIds(db, session),
    excusedIds(db, session),
  ]);
  const chargeable = new Set([...expected].filter((id) => !excused.has(id)));
  return { expected, excused, chargeable };
}

/** The same answer for one participant, without loading everyone. */
export async function standingOf(
  db: Db,
  session: Session,
  participantId: string
): Promise<{ expected: boolean; excused: boolean; chargeable: boolean }> {
  const [isExpected, onChallenge] = await Promise.all([
    session.audience === "Everyone"
      ? db.participant.count({ where: { id: participantId, ...attendeeWhere } })
      : db.sessionParticipant.count({
          where: { sessionId: session.id, participantId },
        }),
    session.challenge
      ? Promise.resolve(0)
      : db.sessionParticipant.count({
          where: {
            participantId,
            session: {
              challenge: true,
              id: { not: session.id },
              startsAt: { lt: session.endsAt },
              endsAt: { gt: session.startsAt },
            },
          },
        }),
  ]);
  const expected = isExpected > 0;
  const excused = onChallenge > 0;
  return { expected, excused, chargeable: expected && !excused };
}
