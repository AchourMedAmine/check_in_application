import type { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { readSession, SESSION_COOKIE } from "@/lib/auth";
import { verifyAgainstDummy, verifyPassword } from "@/lib/password";
import {
  ForbiddenError,
  TooManyRequestsError,
  UnauthorizedError,
} from "@/lib/errors";
import type { Scanner, ScannerRole } from "@/generated/prisma/client";
import type { ScannerProfile } from "@/lib/types";

/** Wrong passwords in a row before an account is locked. */
export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;

/** What the browser may know about the signed-in account. */
export const toProfile = ({
  id,
  username,
  displayName,
  role,
}: Scanner): ScannerProfile => ({ id, username, displayName, role });

export const normalizeUsername = (u: string) => u.trim().toLowerCase();

/**
 * Checks a username + password. Returns the account on success; throws
 * UnauthorizedError (one message for every kind of miss, so it doesn't say
 * which usernames exist) or TooManyRequestsError while locked.
 */
export async function authenticate(
  username: string,
  password: string,
  now: Date = new Date()
): Promise<Scanner> {
  const wrong = new UnauthorizedError("Wrong username or password");

  const scanner = await prisma.scanner.findUnique({
    where: { username: normalizeUsername(username) },
  });

  if (!scanner || !scanner.active) {
    await verifyAgainstDummy(password);
    throw wrong;
  }

  const locked = (until: Date | null) => {
    const minutes = until
      ? Math.max(1, Math.ceil((until.getTime() - now.getTime()) / 60_000))
      : LOCKOUT_MINUTES;
    return new TooManyRequestsError(
      `Too many wrong passwords. Try again in ${minutes} min, or ask a manager.`
    );
  };

  // Count the attempt BEFORE checking the password, in one atomic statement.
  // Checking first and counting after would let a burst of parallel guesses
  // all slip past the lock; this way at most MAX_FAILED_LOGINS passwords are
  // ever tried per lockout window, however many requests arrive at once.
  const [attempt] = await prisma.$queryRaw<{ failed_logins: number }[]>`
    UPDATE checkin.scanners
       SET failed_logins = failed_logins + 1
     WHERE id = ${scanner.id}
       AND (locked_until IS NULL OR locked_until <= (now() AT TIME ZONE 'UTC'))
    RETURNING failed_logins`;

  if (!attempt) throw locked(scanner.lockedUntil);

  const lock = () =>
    prisma.scanner.update({
      where: { id: scanner.id },
      data: {
        failedLogins: 0,
        lockedUntil: new Date(now.getTime() + LOCKOUT_MINUTES * 60_000),
      },
    });

  if (attempt.failed_logins > MAX_FAILED_LOGINS) {
    await lock();
    throw locked(null);
  }

  if (!(await verifyPassword(password, scanner.passwordHash))) {
    if (attempt.failed_logins >= MAX_FAILED_LOGINS) await lock();
    throw wrong;
  }

  return prisma.scanner.update({
    where: { id: scanner.id },
    data: { failedLogins: 0, lockedUntil: null, lastLoginAt: now },
  });
}

/**
 * The signed-in scanner, re-read from the database on every API call: a
 * disabled account, a reset password or a changed role applies at once,
 * not when the cookie expires. Pass `role: "Manager"` for manager-only work.
 */
export async function requireScanner(
  req: NextRequest,
  { role }: { role?: ScannerRole } = {}
): Promise<Scanner> {
  const claim = await readSession(req.cookies.get(SESSION_COOKIE)?.value);
  if (!claim) throw new UnauthorizedError("Not signed in");

  const scanner = await prisma.scanner.findUnique({ where: { id: claim.sid } });
  if (!scanner || !scanner.active || scanner.sessionVersion !== claim.v) {
    throw new UnauthorizedError("Your session has ended — sign in again");
  }

  if (role === "Manager" && scanner.role !== "Manager") {
    throw new ForbiddenError("Only a manager can do this");
  }

  return scanner;
}

/**
 * The sessions this account works: every session for a Manager, only the
 * assigned ones for an officer. Null means "all".
 */
export async function sessionScope(scanner: Scanner): Promise<string[] | null> {
  if (scanner.role === "Manager") return null;
  const rows = await prisma.scannerAssignment.findMany({
    where: { scannerId: scanner.id },
    select: { sessionId: true },
  });
  return rows.map((r) => r.sessionId);
}

/**
 * Refuses an officer working a session they are not assigned to — scanning,
 * reading its roster, marking it started. Enforced here, on the server, not
 * only by what the screen shows.
 */
export async function requireAssigned(scanner: Scanner, sessionId: string): Promise<void> {
  if (scanner.role === "Manager") return;
  const assigned = await prisma.scannerAssignment.findUnique({
    where: { scannerId_sessionId: { scannerId: scanner.id, sessionId } },
  });
  if (!assigned) {
    throw new ForbiddenError("You are not assigned to this session — ask a manager");
  }
}
