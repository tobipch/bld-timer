#!/usr/bin/env node
/**
 * Applies the SQL migrations in ./drizzle to the Neon database.
 * Runs over HTTPS (Neon serverless driver), so it works without direct
 * Postgres TCP access. Tracks applied migrations like drizzle-kit does.
 *
 *   DATABASE_URL=postgres://... npm run db:migrate
 */
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { migrate } from "drizzle-orm/neon-http/migrator";

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("Set DATABASE_URL (or POSTGRES_URL) to the Neon connection string.");
  process.exit(1);
}

const db = drizzle(neon(url));
await migrate(db, { migrationsFolder: "./drizzle" });
console.log("✓ migrations applied");
