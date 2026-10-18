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

// TRSYP 3.0 programme, 16–18 October 2026 (organisers' final list).
// Times are Tunisia local time (UTC+1 all year — no daylight saving), so they
// read exactly like the programme. The browser shows them in its own zone.
const at = (day: string, time: string) => new Date(`2026-10-${day}T${time}:00+01:00`);

const ROOM = {
  fablab: "Fablab",
  ceremonies: "Salle de cérémonies",
  luxor: "Luxor Room",
  ramses: "Ramsès Room",
  cesarion: "Césarion Room",
  cesar: "César Room",
  sphinx: "Sphinx Room",
};

// Sessions that count towards branch points: a break may last 15 minutes;
// past that, the participant's branch loses 5 points.
const RULES = { mandatory: true, breakAllowanceMinutes: 15, penaltyPoints: 5 } as const;

// Attendance only: check-ins and check-outs are kept, nothing is ever
// charged — not to the branch, not to a team.
const ATTENDANCE_ONLY = { mandatory: false, breakAllowanceMinutes: 15, penaltyPoints: 0 } as const;

/**
 * Every session staff scan for.
 *
 * `challenge: true` marks a technical-challenge slot: everyone on its roster
 * is excused from any session that overlaps it (the congress rule) — e.g.
 * Technical Pitching session 2 overlaps the second round of workshops.
 *
 * Assigned rosters (workshops, hackathon, challenges) are filled in later.
 */
const SESSIONS: Prisma.SessionCreateInput[] = [
  // ── Friday 16/10 — Fablab hackathon (attendance only) ─────────────────
  {
    // One session for the whole hackathon, 11:00 to 01:00 the next night (it
    // replaced "Session 1" and "Session 2"). Attendance only.
    title: "Hackathon",
    location: ROOM.fablab,
    // The list: every member of a selected Fablab team on the website.
    teamActivity: "FABLAB",
    // Day part, until the dinner break (closed at 18:40).
    startsAt: at("16", "11:00"),
    endsAt: at("16", "18:40"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
    // Breaks may last up to 2 hours — shown as time left, never charged.
    breakAllowanceMinutes: 120,
  },
  {
    // After dinner: everyone checks in again; dinner is not a break.
    title: "Hackathon — Night",
    location: ROOM.fablab,
    teamActivity: "FABLAB",
    startsAt: at("16", "21:30"),
    endsAt: at("17", "01:00"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
    breakAllowanceMinutes: 120,
  },

  // ── Saturday 17/10 ────────────────────────────────────────────────────
  {
    title: "Hackathon — Pitching",
    location: ROOM.fablab,
    teamActivity: "FABLAB",
    startsAt: at("17", "10:30"),
    endsAt: at("17", "11:30"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },
  {
    // Doors open by themselves at 13:30; lateness counts from when the
    // moderators actually begin (tapped at the door).
    title: "Opening Ceremony",
    location: ROOM.ceremonies,
    startsAt: at("17", "14:00"),
    endsAt: at("17", "17:00"),
    audience: "Everyone",
    ...RULES,
  },
  {
    // Runs to midnight.
    title: "Technical Competition",
    // The list: members of the selected Competition teams.
    teamActivity: "COMPETITION",
    startsAt: at("17", "20:30"),
    endsAt: at("18", "00:00"),
    audience: "Assigned",
    challenge: true,
    ...ATTENDANCE_ONLY,
  },

  // ── Sunday 18/10 ──────────────────────────────────────────────────────
  // Challenge pitching, session 1 — two rooms in parallel.
  {
    title: "Non-technical Challenge Pitching",
    location: ROOM.luxor,
    startsAt: at("18", "07:00"),
    endsAt: at("18", "08:30"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },
  {
    title: "Technical Pitching — Session 1",
    location: ROOM.ramses,
    // The list: members of the selected technical Challenge teams.
    teamActivity: "CHALLENGE",
    startsAt: at("18", "07:00"),
    endsAt: at("18", "08:30"),
    audience: "Assigned",
    challenge: true,
    ...ATTENDANCE_ONLY,
  },

  // Workshops, session 1.
  {
    // Yosr Bayar. Mandatory for the technical challenge participants — its
    // roster is them.
    title: "Pitching Workshop",
    location: ROOM.cesarion,
    // Its list is the website bookings (copied into session_participants).
    startsAt: at("18", "09:00"),
    endsAt: at("18", "10:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    // Website workshop "iiot-breaking-the-cage"; its list is the bookings.
    title: "Breaking the Cage: How IIoT Gives Robots Senses, Reflexes, and a Human Connection",
    location: ROOM.sphinx,
    startsAt: at("18", "09:00"),
    endsAt: at("18", "10:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    // Round tables.
    title: "YP Transition Lab",
    location: ROOM.cesar,
    startsAt: at("18", "09:00"),
    endsAt: at("18", "10:00"),
    audience: "Assigned",
    ...RULES,
  },

  {
    title: "Distinguished Lecturer Session",
    location: ROOM.ceremonies,
    startsAt: at("18", "10:15"),
    endsAt: at("18", "11:15"),
    audience: "Everyone",
    ...RULES,
  },

  {
    // Overlaps the second round of workshops: its pitchers are excused
    // from them.
    title: "Technical Pitching — Session 2",
    // Same teams as session 1. Not an excuse from the 12:00 workshops for
    // now (decided on 18/10): every booked participant counts there.
    teamActivity: "CHALLENGE",
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:00"),
    audience: "Assigned",
    ...ATTENDANCE_ONLY,
  },

  // Workshops, session 2.
  {
    // Mohamed Ali Farhat.
    title: "NVIDIA Jetson Nano: Edge AI Workshop",
    location: ROOM.sphinx,
    startsAt: at("18", "12:00"),
    endsAt: at("18", "13:00"),
    audience: "Assigned",
    ...RULES,
  },
  {
    // Khalil Masmoudi.
    title: "If/Else or AI Agent? Picking the Right Tool for the Job",
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
    title: "Closing Ceremony",
    location: ROOM.ceremonies,
    startsAt: at("18", "15:00"),
    endsAt: at("18", "17:00"),
    audience: "Everyone",
    ...RULES,
  },
];

/**
 * Sessions that were merged or renamed: new title ← old titles. The first old
 * session found becomes the new one (keeping its id, officers and scans); the
 * others hand their officers over and are then removed by the clean-up below
 * if empty.
 */
const MERGED: Record<string, string[]> = {
  Hackathon: ["Hackathon — Session 1", "Hackathon — Session 2"],
};

async function carryOver() {
  for (const [title, oldTitles] of Object.entries(MERGED)) {
    const olds = await prisma.session.findMany({ where: { title: { in: oldTitles } } });
    if (olds.length === 0) continue;

    let target = await prisma.session.findFirst({ where: { title } });
    if (!target) {
      target = await prisma.session.update({ where: { id: olds[0].id }, data: { title } });
      console.log(`renamed  ${olds[0].title} → ${title}`);
    }

    for (const old of olds.filter((o) => o.id !== target.id)) {
      const officers = await prisma.scannerAssignment.findMany({ where: { sessionId: old.id } });
      for (const a of officers) {
        await prisma.scannerAssignment.upsert({
          where: { scannerId_sessionId: { scannerId: a.scannerId, sessionId: target.id } },
          update: {},
          create: { scannerId: a.scannerId, sessionId: target.id },
        });
      }
      await prisma.scannerAssignment.deleteMany({ where: { sessionId: old.id } });
      if (officers.length) console.log(`moved    ${officers.length} officer(s) from ${old.title} to ${title}`);
    }
  }
}

async function main() {
  await carryOver();

  for (const s of SESSIONS) {
    const existing = await prisma.session.findFirst({ where: { title: s.title } });

    // Don't stomp on a status staff changed at the door.
    const rest = { ...s };
    delete rest.status;
    const saved = existing
      ? await prisma.session.update({
          where: { id: existing.id },
          // A session the programme gives no room loses any old one.
          data: { location: null, challenge: false, teamActivity: null, ...rest },
        })
      : await prisma.session.create({ data: { ...s, status: "Scheduled" } });

    console.log(
      `${existing ? "updated" : "created"}  ${saved.title.padEnd(50)} ${saved.status.padEnd(10)} ${saved.audience}`
    );
  }

  // Sessions in the database that are no longer in the programme (renamed or
  // dropped). Left Scheduled they would open by themselves at their old time
  // — and closing an old "everyone" session would charge everyone absent. So
  // an empty one (no scans, penalties, roster or officer) is deleted; one
  // holding any data is only listed, for a person to decide.
  const titles = SESSIONS.map((s) => s.title);
  const gone = await prisma.session.findMany({
    where: { title: { notIn: titles } },
    include: {
      _count: { select: { presences: true, penalties: true, expected: true } },
    },
  });
  const stray = [];
  for (const s of gone) {
    const officers = await prisma.scannerAssignment.count({ where: { sessionId: s.id } });
    const empty =
      s._count.presences + s._count.penalties + s._count.expected + officers === 0;
    if (empty) {
      await prisma.session.delete({ where: { id: s.id } });
      console.log(`removed  ${s.title.padEnd(50)} no longer in the programme (empty)`);
    } else {
      stray.push(s);
    }
  }

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
