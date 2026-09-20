import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 client (engine-less, driver adapter required).
 * Singleton so `next dev` hot reloads don't open a new pool each time.
 */
declare global {
  var prismaClient: PrismaClient | undefined;
}

function createClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

export const prisma = globalThis.prismaClient ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
