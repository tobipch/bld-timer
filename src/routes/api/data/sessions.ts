import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";
import { isScrambleMode, MODE_LABEL, SCRAMBLE_MODES } from "~/lib/scramble";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    let rows = await db.select().from(schema.timerSession).where(eq(schema.timerSession.userId, userId));
    if (rows.length === 0) {
      // one session per scramble mode, so there is always somewhere to solve
      const seeded = SCRAMBLE_MODES.map((mode) => ({
        id: newId(),
        userId,
        name: MODE_LABEL[mode],
        createdAt: Date.now(),
        mode,
      }));
      await db.insert(schema.timerSession).values(seeded);
      rows = seeded;
    }
    return json(rows.map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, mode: r.mode })));
  });

export const POST = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const body = (await event.request.json()) as { name?: string; mode?: string };
    const name = (body.name ?? "").trim();
    if (!name) return json({ error: "name required" }, 400);
    if (!isScrambleMode(body.mode)) return json({ error: "unknown scramble mode" }, 400);
    const row = { id: newId(), userId, name, createdAt: Date.now(), mode: body.mode };
    await db.insert(schema.timerSession).values(row);
    return json({ id: row.id, name: row.name, createdAt: row.createdAt, mode: row.mode });
  });
