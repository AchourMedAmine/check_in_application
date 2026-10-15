import { prisma } from "@/lib/db";
import type { Session } from "@/generated/prisma/client";

/**
 * A participant's team for a team-linked session (the hackathon: Fablab
 * teams), as the door sees it on a check-in. Read-only raw SQL against the
 * website's tables, which are not part of this app's Prisma schema.
 */
export interface TeamBadge {
  name: string;
  code: string;
  /** Fablab axis, in words; null for other activities. */
  axis: string | null;
  /** Teammates who are attending (paid, not banned) — the ones who can come. */
  members: number;
  /** Of those, how many are inside this session right now. */
  inside: number;
}

const AXIS: Record<string, string> = {
  SAMPLE_PREPARATION: "Sample preparation",
  WEIGHING_DOSING: "Weighing & dosing",
};

export async function teamOf(
  session: Pick<Session, "id" | "teamActivity">,
  participantId: string
): Promise<TeamBadge | null> {
  if (!session.teamActivity) return null;

  const [team] = await prisma.$queryRaw<
    { id: string; name: string; code: string; axis: string | null }[]
  >`
    SELECT t.id, t.name, t.code, t.axis::text AS axis
      FROM public.team_memberships m
      JOIN public.teams t ON t.id = m.team_id
     WHERE m.participant_id = ${participantId}
       AND t.activity::text = ${session.teamActivity}
     LIMIT 1`;
  if (!team) return null;

  const [{ members, inside }] = await prisma.$queryRaw<{ members: number; inside: number }[]>`
    SELECT count(DISTINCT p.id)::int AS members,
           count(DISTINCT pr.participant_id)::int AS inside
      FROM public.team_memberships m
      JOIN public.participants p ON p.id = m.participant_id AND p.paid AND NOT p.banned
      LEFT JOIN checkin.presences pr
             ON pr.participant_id = m.participant_id
            AND pr.session_id = ${session.id}
            AND pr.check_out_at IS NULL
     WHERE m.team_id = ${team.id}`;

  return {
    name: team.name,
    code: team.code,
    axis: team.axis ? (AXIS[team.axis] ?? null) : null,
    members,
    inside,
  };
}

/** Team names for many participants at once (the roster), by participant id. */
export async function teamNames(
  session: Pick<Session, "teamActivity">,
  participantIds: string[]
): Promise<Map<string, string>> {
  if (!session.teamActivity || participantIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<{ participant_id: string; name: string }[]>`
    SELECT m.participant_id, t.name
      FROM public.team_memberships m
      JOIN public.teams t ON t.id = m.team_id
     WHERE t.activity::text = ${session.teamActivity}
       AND m.participant_id = ANY(${participantIds}::text[])`;
  return new Map(rows.map((r) => [r.participant_id, r.name]));
}
