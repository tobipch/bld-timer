import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export type Db = NeonHttpDatabase<typeof schema>;

let cached: Db | null | undefined;

/** Returns the Neon database, or null when no connection string is configured. */
export function getDb(): Db | null {
  if (cached !== undefined) return cached;
  // DATABASE_URL preferred; POSTGRES_URL is what some Vercel/Neon
  // integration setups inject instead
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    cached = null;
    return cached;
  }
  cached = drizzle(neon(url), { schema });
  return cached;
}

export { schema };
