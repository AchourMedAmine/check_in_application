/**
 * Creates (or updates) the congress programme in `checkin.sessions`.
 * Safe to re-run: sessions are matched on title. New sessions start as
 * Scheduled; a manager opens each one at the door.
 *
 * `audience`:
 *   Everyone → all participants are expected (Opening Ceremony).
 *   Assigned → only the participants in checkin.session_participants, which
 *              the TRSYP website will fill once workshop choices ship. Until
 *              then an Assigned session simply shows an empty roster.
 *
 * Run: npm run db:sessions
 */
import "dotenv/config";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { Prisma } from "../generated/prisma/client";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

// TRSYP 3.0 programme ("shared program - Sheet1"), 16–18 October 2026.
// Times are Tunisia local time (UTC+1 all year — no daylight saving), so they
// read exactly like the programme. The browser shows them in its own zone.
const at = (day: string, time: string) => new Date(`2026-10-${day}T${time}:00+01:00`);

const ROOM = {
  ceremonies: "Salle de cérémonies",
  cesarion: "Salle césarion",
  sphinx: "Salle sphinx",
  cesar: "Salle césar",
  party: "Party room",
};

// Sessions that count towards branch points: a break may last 15 minutes;
// past that, the participant's branch loses 5 points.
const RULES = { mandatory: true, breakAllowanceMinutes: 15, penaltyPoints: 5 } as const;

// Attendance only: who came and who didn't, with no break limit and no
// points at stake.
const ATTENDANCE_ONLY = { mandatory: false, breakAllowanceMinutes: 15, penaltyPoints: 0 } as const;

/**
 * Every session staff scan for. Not tracked: check-in desks, meals and coffee
 * breaks, the exhibition, the party and the non-technical pitching round.
 *
 * `challenge: true` marks a technical-challenge slot: everyone on its roster
 * is excused from any session that overlaps it (the congress rule).
 *
 * Hackathon and competition rosters (Assigned) are filled in later, like the
 * workshops'.
 */
const SESSIONS: Prisma.SessionCreateInput[] = [
  // ── Day 1 · Friday 16/10 — Hackathon (attendance only) ───────────────
  // One session per block, so the roster shows who turned up to each part.
  {
    title: "Hackathon — Launch & Workshop 1",
    startsAt: at("16", "13:00"),
    endsAt: at("16", "14:30"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },
  {
    title: "Hackathon — Session 1",
    startsAt: at("16", "15:00"),
    endsAt: at("16", "19:00"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },
  {
    title: "Hackathon — Session 2",
    startsAt: at("16", "20:30"),
    endsAt: at("16", "23:00"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },

  // ── Day 2 · Saturday 17/10 ────────────────────────────────────────────
  {
    title: "Hackathon — Pitching",
    startsAt: at("17", "10:30"),
    endsAt: at("17", "11:30"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },
  {
    // Scheduled for 14:00, so its doors open by themselves at 13:30 — the
    // programme's check-in window. Lateness counts from when the moderators
    // actually begin, tapped at the door ("Session started").
    title: "Opening Ceremony",
    location: ROOM.ceremonies,
    startsAt: at("17", "14:00"),
    endsAt: at("17", "17:00"),
    audience: "Everyone",
    ...RULES,
  },
  {
    // Runs past midnight into Sunday.
    title: "Technical Competition",
    startsAt: at("17", "20:30"),
    endsAt: at("18", "00:00"),
    audience: "Assigned",
    challenge: true,
    ...ATTENDANCE_ONLY,
  },

  // ── Day 3 · Sunday 18/10 ──────────────────────────────────────────────
  {
    // The programme lists "First session pitching challenge" (party room,
    // 10 teams) in the 07:00–08:30 breakfast block — confirm the time.
    title: "Technical Pitching — Session 1",
    location: ROOM.party,
    startsAt: at("18", "07:00"),
    endsAt: at("18", "08:30"),
    audience: "Assigned",
    challenge: true,
    ...ATTENDANCE_ONLY,
  },
  {
    title: "Workshop 1 — Pitching",
    location: ROOM.cesarion,
    startsAt: at("18", "09:00"),
    endsAt: at("18", "10:00"),
    audience: "Assigned", // obligatory for the technical challenge participants
    ...RULES,
  },
  {
    title: "Workshop 2 — IES Workshop",
    location: ROOM.sphinx,
    startsAt: at("18", "09:00"),
    endsAt: at("18", "10:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    title: "Workshop 3 — YP Tech Session",
    location: ROOM.cesar,
    startsAt: at("18", "09:00"),
    endsAt: at("18", "10:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    title: "DL Session — Social Psychology and Social Robotics",
    location: ROOM.ceremonies,
    startsAt: at("18", "10:15"),
    endsAt: at("18", "11:15"),
    audience: "Everyone",
    ...RULES,
  },
  {
    // The programme gives this one 1h30, unlike the other 12:00 workshops.
    title: "Workshop — Building Agentic & Multimodal Systems",
    location: ROOM.sphinx,
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:30"),
    audience: "Assigned",
    ...RULES,
  },
  {
    title: "Round Tables YP",
    location: ROOM.cesar,
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    title: "RAS Leaders",
    location: ROOM.cesarion,
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    // Overlaps the second round of workshops: its pitchers are excused
    // from them.
    title: "Technical Pitching — Session 2",
    location: ROOM.party,
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:00"),
    audience: "Assigned",
    challenge: true,
    ...ATTENDANCE_ONLY,
  },
  {
    // "Not known yet" in the programme. The title is how this script finds
    // the session again: rename it here AND in the database together, or the
    // next run creates a new session and lists this one as a leftover.
    title: "Workshop 2 (2nd session) — to be announced",
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    // The programme lists "2:00 – --:-- PM"; its last item ends at 16:50.
    // 17:00 until the real end time is known.
    title: "Closing Ceremony",
    location: ROOM.ceremonies,
    startsAt: at("18", "14:00"),
    endsAt: at("18", "17:00"),
    audience: "Everyone",
    ...RULES,
  },
];

async function main() {
  for (const s of SESSIONS) {
    const existing = await prisma.session.findFirst({ where: { title: s.title } });

    // Don't stomp on a status staff changed at the door.
    const rest = { ...s };
    delete rest.status;
    const saved = existing
      ? await prisma.session.update({ where: { id: existing.id }, data: rest })
      : await prisma.session.create({ data: { ...s, status: "Scheduled" } });

    console.log(
      `${existing ? "updated" : "created"}  ${saved.title.padEnd(50)} ${saved.status.padEnd(10)} ${saved.audience}`
    );
  }

  // Sessions in the database that are not (or no longer) in the programme —
  // usually leftovers from testing. Listed, never deleted: they may hold
  // attendance that someone wants to keep.
  const titles = SESSIONS.map((s) => s.title);
  const stray = await prisma.session.findMany({
    where: { title: { notIn: titles } },
    include: { _count: { select: { presences: true, penalties: true } } },
  });
  // Programme sessions that already have scans or are not Scheduled before
  // the event — test data that would otherwise count on the day.
  const touched = await prisma.session.findMany({
    where: {
      title: { in: titles },
      OR: [{ status: { not: "Scheduled" } }, { presences: { some: {} } }],
    },
    include: { _count: { select: { presences: true, penalties: true } } },
  });

  for (const s of [...stray, ...touched]) {
    const why = titles.includes(s.title) ? "already used" : "not in the programme";
    console.warn(
      `warning  ${s.title.padEnd(50)} ${s.status.padEnd(10)} ${why}: ` +
        `${s._count.presences} presences, ${s._count.penalties} penalties`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
