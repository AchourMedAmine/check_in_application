import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Session } from "@/generated/prisma/client";
import { lockSession, TX_OPTIONS } from "./locks";

/**
 * Fallback for scans that carry no sessionId. Workshops can run in parallel,
 * so this only works when exactly one session is Open — otherwise the caller
 * must say which one, rather than have us guess.
 */
export async function getActiveSession(): Promise<Session> {
  const open = await prisma.session.findMany({
    where: { status: "Open" },
    orderBy: { startsAt: "asc" },
  });

  if (open.length === 0) {
    throw new NotFoundError("Open session");
  }

  if (open.length > 1) {
    throw new ValidationError(
      `${open.length} sessions are open — the scan must name one`
    );
  }

  return open[0];
}

export async function getSessionOrThrow(id: string): Promise<Session> {
  const session = await prisma.session.findUnique({ where: { id } });
  if (!session) throw new NotFoundError("Session");
  return session;
}

/** Doors open this long before a session's scheduled start. */
export const AUTO_OPEN_MINUTES = 30;

/**
 * Opens every Scheduled session whose doors are due: from 30 minutes before
 * its scheduled start until its scheduled end. Run whenever the sessions are
 * listed, so no scheduler is needed and volunteers never wait for a manager.
 *
 * A session whose whole slot passed while still Scheduled stays Scheduled:
 * opening it late would let a close charge everyone absent for a session
 * nobody scanned. Closing is never automatic.
 */
export async function openDueSessions(now: Date = new Date()): Promise<number> {
  const { count } = await prisma.session.updateMany({
    where: {
      status: "Scheduled",
      startsAt: { lte: new Date(now.getTime() + AUTO_OPEN_MINUTES * 60_000) },
      endsAt: { gt: now },
    },
    data: { status: "Open", openedAt: now },
  });
  return count;
}

/**
 * Records that the session really began (the moderator or instructor
 * started). Only the first tap counts; lateness is measured from it. Under
 * the exclusive lock so no scan is half-way through when it lands.
 */
export async function markStarted(id: string, now: Date = new Date()): Promise<Session> {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, id, "exclusive");
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundError("Session");
    if (session.status !== "Open") {
      throw new ValidationError(`Session "${session.title}" is not open`);
    }
    if (session.startedAt) return session; // a second tap changes nothing
    return tx.session.update({ where: { id }, data: { startedAt: now } });
  }, TX_OPTIONS);
}

/**
 * Takes back a start tapped by mistake, and with it every Late penalty it
 * caused. Exclusive lock: a scan cannot add a Late penalty after they are
 * removed.
 */
export async function undoStart(id: string): Promise<{ session: Session; removed: number }> {
  return prisma.$transaction(async (tx) => {
    await lockSession(tx, id, "exclusive");
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) throw new NotFoundError("Session");
    if (session.status === "Closed") {
      throw new ValidationError(`Session "${session.title}" is already closed`);
    }
    const { count: removed } = await tx.penalty.deleteMany({
      where: { sessionId: id, reason: "Late" },
    });
    const updated = await tx.session.update({ where: { id }, data: { startedAt: null } });
    return { session: updated, removed };
  }, TX_OPTIONS);
}
