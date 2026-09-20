/**
 * Creates (or updates) the congress programme in `checkin.sessions`.
 * Safe to re-run: sessions are matched on title.
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

// Adjust to the real programme before the event.
const DAY = "2026-09-20";
const at = (time: string) => new Date(`${DAY}T${time}:00Z`);

const SESSIONS: Prisma.SessionCreateInput[] = [
  {
    title: "Opening Ceremony",
    location: "Main Hall",
    startsAt: at("09:00"),
    endsAt: at("11:00"),
    audience: "Everyone",
    mandatory: true,
    breakAllowanceMinutes: 15,
    penaltyPoints: 5,
    status: "Open",
  },
  {
    title: "Workshop A — Embedded Systems",
    location: "Room 1",
    startsAt: at("11:30"),
    endsAt: at("13:30"),
    audience: "Assigned",
    mandatory: true,
    breakAllowanceMinutes: 15,
    penaltyPoints: 5,
    status: "Scheduled",
  },
  {
    title: "Workshop B — Power & Energy",
    location: "Room 2",
    startsAt: at("11:30"),
    endsAt: at("13:30"),
    audience: "Assigned",
    mandatory: true,
    breakAllowanceMinutes: 15,
    penaltyPoints: 5,
    status: "Scheduled",
  },
  {
    title: "Closing Ceremony",
    location: "Main Hall",
    startsAt: at("17:00"),
    endsAt: at("18:30"),
    audience: "Everyone",
    mandatory: true,
    breakAllowanceMinutes: 15,
    penaltyPoints: 5,
    status: "Scheduled",
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
      : await prisma.session.create({ data: s });

    console.log(
      `${existing ? "updated" : "created"}  ${saved.title.padEnd(34)} ${saved.status.padEnd(10)} ${saved.audience}`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
