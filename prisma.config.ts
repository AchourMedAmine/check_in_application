import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Only the Prisma CLI reads this (generate, studio, db execute). The app
    // itself builds its own connection in lib/db.ts.
    //
    // `prisma generate` runs during the Vercel build and does NOT connect to
    // anything, so it must not hard-fail when DATABASE_URL is absent — using
    // env() here would abort the whole build. Commands that really do connect
    // still fail loudly, with a connection error naming this placeholder.
    url: process.env.DATABASE_URL ?? "postgresql://unset",
  },
});
