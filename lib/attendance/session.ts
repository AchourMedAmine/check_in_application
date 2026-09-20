import { prisma } from "@/lib/db";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Session } from "@/generated/prisma/client";

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
