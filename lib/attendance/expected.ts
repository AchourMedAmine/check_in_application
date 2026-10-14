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

/**
 * Members of the website's selected teams for an activity (FABLAB,
 * COMPETITION, CHALLENGE). Read-only raw SQL: the website's tables are not
 * in this app's Prisma schema, and must never be.
 */
async function teamMemberIds(
  db: Db,
  activity: string,
  participantId?: string
): Promise<string[]> {
  const rows = await db.$queryRaw<{ participant_id: string }[]>`
    SELECT DISTINCT m.participant_id
      FROM public.team_memberships m
      JOIN public.teams t ON t.id = m.team_id
     WHERE t.activity::text = ${activity}
       AND t.selected
       AND (${participantId ?? null}::text IS NULL OR m.participant_id = ${participantId ?? null}::text)`;
  return rows.map((r) => r.participant_id);
}

export async function expectedIds(db: Db, session: Session): Promise<Set<string>> {
  if (session.audience === "Everyone") {
    const rows = await db.participant.findMany({ where: attendeeWhere, select: { id: true } });
    return new Set(rows.map((p) => p.id));
  }
  const [listed, team] = await Promise.all([
    db.sessionParticipant.findMany({
      where: { sessionId: session.id },
      select: { participantId: true },
    }),
    session.teamActivity ? teamMemberIds(db, session.teamActivity) : Promise.resolve([]),
  ]);
  return new Set([...listed.map((r) => r.participantId), ...team]);
}

/** The challenge sessions that overlap this one in time. */
function overlappingChallenges(db: Db, session: Session) {
  return db.session.findMany({
    where: {
      challenge: true,
      id: { not: session.id },
      startsAt: { lt: session.endsAt },
      endsAt: { gt: session.startsAt },
    },
  });
}

export async function excusedIds(db: Db, session: Session): Promise<Set<string>> {
  if (session.challenge) return new Set(); // a challenge doesn't excuse from itself
  const challenges = await overlappingChallenges(db, session);
  const rosters = await Promise.all(challenges.map((c) => expectedIds(db, c)));
  return new Set(rosters.flatMap((r) => [...r]));
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

/**
 * Whether a session has a list yet: linked to website teams, or with people
 * listed by hand. Until it does, nobody can be "not registered" for it —
 * otherwise every scan at a workshop whose roster isn't loaded would raise
 * the alarm.
 */
export async function hasList(db: Db, session: Session): Promise<boolean> {
  if (session.audience === "Everyone") return false;
  if (session.teamActivity) return true;
  return (await db.sessionParticipant.count({ where: { sessionId: session.id } })) > 0;
}

/** For the roster: on the list (true), not on it (false), or no list (undefined). */
export function registeredFor(who: Accountability, participantId: string): boolean | undefined {
  if (who.audience === "Everyone" || who.expected.size === 0) return undefined;
  return who.expected.has(participantId);
}

/** The same answers for one participant, without loading everyone. */
export async function standingOf(
  db: Db,
  session: Session,
  participantId: string
): Promise<{ expected: boolean; excused: boolean; mustAttend: boolean; answers: boolean }> {
  const onRoster = async (s: Session): Promise<boolean> => {
    const [listed, team] = await Promise.all([
      db.sessionParticipant.count({ where: { sessionId: s.id, participantId } }),
      s.teamActivity ? teamMemberIds(db, s.teamActivity, participantId) : Promise.resolve([]),
    ]);
    return listed > 0 || team.length > 0;
  };

  const [expected, excused] = await Promise.all([
    session.audience === "Everyone"
      ? db.participant
          .count({ where: { id: participantId, ...attendeeWhere } })
          .then((n) => n > 0)
      : onRoster(session),
    session.challenge
      ? Promise.resolve(false)
      : overlappingChallenges(db, session).then(async (cs) =>
          (await Promise.all(cs.map(onRoster))).some(Boolean)
        ),
  ]);
  return {
    expected,
    excused,
    mustAttend: expected && !excused,
    answers: !excused && (session.audience === "Everyone" || expected),
  };
}
