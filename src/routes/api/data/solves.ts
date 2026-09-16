import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";
import type { SolveRecord } from "~/lib/storage/types";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const rows = await db.select().from(schema.solve).where(eq(schema.solve.userId, userId));
    return json(
      rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        startedAt: r.startedAt,
        result: r.result,
        execMs: r.execMs,
        scramble: r.scramble,
        moves: r.moves,
      })),
    );
  });

export const POST = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const s = (await event.request.json()) as Omit<SolveRecord, "id">;
    const id = newId();
    await db.insert(schema.solve).values({
      id,
      userId,
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      result: s.result,
      execMs: s.execMs,
      scramble: s.scramble,
      moves: s.moves,
    });
    return json({ ...s, id });
  });
