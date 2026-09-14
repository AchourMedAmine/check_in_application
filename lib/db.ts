import { PrismaClient } from "@prisma/client";

/**
 * Instantiate Prisma Client with singleton pattern
 * Prevents multiple instances in development (hot reload)
 */
declare global {
  var prismaClient: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaClient ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.prismaClient = prisma;
}
