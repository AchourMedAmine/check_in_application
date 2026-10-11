import { prisma } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";
import type { Tx } from "./locks";

/**
 * Who a session holds to account. Two different questions, kept apart:
 *
 *  - Who must attend (absences, the "not scanned" list, the totals):
 *    expected and not excused. Expected = for an Everyone session, every
 *    participant who has paid and is not banned (unpaid registrants are not
 *    coming); for an Assigned session, its roster.
 *  - Who answers for how they attend (late, over-long breaks, leaving
 *    early): anyone actually scanned in — paid or not, they were in the room
 *    — except people excused here, and at an Assigned session only its
 *    roster (a walk-in to someone else's workshop answers at their own).
 *
 * Excused = on the roster of a technical-challenge session that overlaps
 * this one in time; the congress rule exempts them from it entirely.
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
  audience: Session["audience"];
  expected: Set<string>;
  excused: Set<string>;
  /** Expected and not excused: who is charged as absent if never scanned. */
  mustAttend: Set<string>;
}

export async function accountability(db: Db, session: Session): Promise<Accountability> {
  const [expected, excused] = await Promise.all([
    expectedIds(db, session),
    excusedIds(db, session),
  ]);
  const mustAttend = new Set([...expected].filter((id) => !excused.has(id)));
  return { audience: session.audience, expected, excused, mustAttend };
}

/**
 * Whether a participant who was scanned in answers for lateness, long
 * breaks and leaving early here. Not about payment: someone in the room
 * follows the room's rules.
 */
export function answersFor(who: Accountability, participantId: string): boolean {
  if (who.excused.has(participantId)) return false;
  return who.audience === "Everyone" || who.expected.has(participantId);
}

/** Why a scanned participant is not charged here, in staff's words. */
export function notChargedReason(
  who: Pick<Accountability, "audience">,
  standing: { excused: boolean; answers: boolean }
): string | null {
  if (standing.answers) return null;
  if (standing.excused) return "technical challenge at the same time";
  return who.audience === "Assigned" ? "not on this session's roster" : null;
}

/** The same answers for one participant, without loading everyone. */
export async function standingOf(
  db: Db,
  session: Session,
  participantId: string
): Promise<{ expected: boolean; excused: boolean; mustAttend: boolean; answers: boolean }> {
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
  return {
    expected,
    excused,
    mustAttend: expected && !excused,
    answers: !excused && (session.audience === "Everyone" || expected),
  };
}
