import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import migration0000 from "../../../drizzle/0000_absent_forgotten_one.sql?raw";
import migration0001 from "../../../drizzle/0001_common_skreet.sql?raw";

export type Db = NeonHttpDatabase<typeof schema>;

/** Embedded migrations so serverless deployments self-migrate on startup. */
const MIGRATIONS: { tag: string; sqlText: string }[] = [
  { tag: "0000_absent_forgotten_one", sqlText: migration0000 },
  { tag: "0001_common_skreet", sqlText: migration0001 },
];

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

let migrating: Promise<void> | null = null;

/** Like getDb, but guarantees pending migrations have been applied. */
export async function getDbReady(): Promise<Db | null> {
  const db = getDb();
  if (!db) return null;
  migrating ??= applyMigrations(db).catch((e) => {
    migrating = null; // allow a retry on the next request
    throw e;
  });
  await migrating;
  return db;
}

/** "already exists" Postgres codes — another instance won the startup race. */
const BENIGN = new Set(["42P07", "42710", "42P06", "23505"]);

async function applyMigrations(db: Db) {
  await db.execute(
    sql`CREATE TABLE IF NOT EXISTS "__app_migrations" ("tag" text PRIMARY KEY, "applied_at" timestamptz DEFAULT now())`,
  );
  const done = await db.execute(sql`SELECT "tag" FROM "__app_migrations"`);
  const doneTags = new Set(done.rows.map((r) => r.tag as string));
  for (const m of MIGRATIONS) {
    if (doneTags.has(m.tag)) continue;
    for (const stmt of m.sqlText.split("--> statement-breakpoint")) {
      const text = stmt.trim();
      if (!text) continue;
      try {
        await db.execute(sql.raw(text));
      } catch (e) {
        const code = (e as { cause?: { code?: string } }).cause?.code ?? (e as { code?: string }).code;
        if (!code || !BENIGN.has(code)) throw e;
      }
    }
    await db
      .execute(sql`INSERT INTO "__app_migrations" ("tag") VALUES (${m.tag}) ON CONFLICT DO NOTHING`);
  }
}

export { schema };
