import type { APIEvent } from "@solidjs/start/server";
import { asc, eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";
import { isScrambleMode, MODE_LABEL } from "~/lib/scramble";
import { missingModes, sessionMode } from "~/lib/sessions";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    // ordered, because the client falls back to the first session: an
    // unordered select would hand out a different one on every load
    const stored = (
      await db
        .select()
        .from(schema.timerSession)
        .where(eq(schema.timerSession.userId, userId))
        .orderBy(asc(schema.timerSession.createdAt))
    ).map((r) => ({ id: r.id, name: r.name, createdAt: r.createdAt, mode: sessionMode(r.mode) }));

    // every mode gets a session, including for an account that was already
    // practising before the modes existed — otherwise its mode switch has
    // nowhere to go
    const missing = missingModes(stored).map((mode) => ({
      id: newId(),
      userId,
      name: MODE_LABEL[mode],
      createdAt: Date.now(),
      mode,
    }));
    if (missing.length > 0) await db.insert(schema.timerSession).values(missing);

    return json([
      ...stored,
      ...missing.map(({ userId: _u, ...s }) => s),
    ]);
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
