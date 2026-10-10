/**
 * Manages scanner accounts in `checkin.scanners`.
 *
 *   npm run scanners -- list
 *   npm run scanners -- add <username> "<Display Name>" [--manager]
 *   npm run scanners -- reset-password <username>
 *   npm run scanners -- role <username> Scanner|Manager
 *   npm run scanners -- disable <username>
 *   npm run scanners -- enable <username>
 *
 * Passwords are generated, printed ONCE, and stored only as a scrypt hash.
 * Hand them over in person; they cannot be recovered, only reset.
 */
import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import type { ScannerRole } from "../generated/prisma/client";
import { generatePassword, hashPassword } from "../lib/password";

const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DIRECT_URL ?? process.env.DATABASE_URL,
  }),
});

const USAGE = `usage:
  npm run scanners -- list
  npm run scanners -- add <username> "<Display Name>" [--manager]
  npm run scanners -- reset-password <username>
  npm run scanners -- role <username> Scanner|Manager
  npm run scanners -- disable <username>
  npm run scanners -- enable <username>`;

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const normalize = (u: string) => u.trim().toLowerCase();

async function find(username: string | undefined) {
  if (!username) fail(USAGE);
  const scanner = await prisma.scanner.findUnique({
    where: { username: normalize(username) },
  });
  if (!scanner) fail(`no scanner "${normalize(username)}"`);
  return scanner;
}

function printPassword(username: string, password: string) {
  console.log(`\n  username: ${username}\n  password: ${password}\n`);
  console.log("Shown once — hand it over now. It cannot be recovered, only reset.");
}

async function main() {
  const [command, ...args] = process.argv.slice(2);

  switch (command) {
    case "list": {
      const all = await prisma.scanner.findMany({ orderBy: { username: "asc" } });
      if (all.length === 0) return console.log("no scanners yet");
      for (const s of all) {
        const state = !s.active
          ? "disabled"
          : s.lockedUntil && s.lockedUntil > new Date()
            ? "locked"
            : "active";
        console.log(
          `${s.username.padEnd(20)} ${s.role.padEnd(8)} ${state.padEnd(9)} ${s.displayName}` +
            (s.lastLoginAt ? `  (last sign-in ${s.lastLoginAt.toISOString()})` : "")
        );
      }
      return;
    }

    case "add": {
      const [raw, displayName] = args.filter((a) => !a.startsWith("--"));
      if (!raw || !displayName) fail(USAGE);
      const username = normalize(raw);
      if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
        fail("username: 3–32 characters, letters, digits, . _ -");
      }
      const role: ScannerRole = args.includes("--manager") ? "Manager" : "Scanner";
      if (await prisma.scanner.findUnique({ where: { username } })) {
        fail(`"${username}" already exists — use reset-password`);
      }

      const password = generatePassword();
      await prisma.scanner.create({
        data: {
          id: randomUUID(),
          username,
          displayName: displayName.trim(),
          passwordHash: await hashPassword(password),
          role,
        },
      });
      console.log(`created ${role} "${username}" (${displayName.trim()})`);
      return printPassword(username, password);
    }

    case "reset-password": {
      const scanner = await find(args[0]);
      const password = generatePassword();
      await prisma.scanner.update({
        where: { id: scanner.id },
        data: {
          passwordHash: await hashPassword(password),
          // Signs the old password's sessions out on every device.
          sessionVersion: { increment: 1 },
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      console.log(`reset "${scanner.username}" — signed out everywhere`);
      return printPassword(scanner.username, password);
    }

    case "role": {
      const scanner = await find(args[0]);
      const role = args[1];
      if (role !== "Scanner" && role !== "Manager") fail(USAGE);
      await prisma.scanner.update({ where: { id: scanner.id }, data: { role } });
      return console.log(`"${scanner.username}" is now ${role}`);
    }

    case "disable":
    case "enable": {
      const scanner = await find(args[0]);
      await prisma.scanner.update({
        where: { id: scanner.id },
        data: {
          active: command === "enable",
          ...(command === "enable" ? { failedLogins: 0, lockedUntil: null } : {}),
        },
      });
      return console.log(
        command === "disable"
          ? `"${scanner.username}" disabled — locked out on their next request`
          : `"${scanner.username}" enabled`
      );
    }

    default:
      fail(USAGE);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
