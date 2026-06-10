import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, requireUser } from "~/server/api";

export const GET = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const rows = await db.select().from(schema.algExecution).where(eq(schema.algExecution.userId, userId));
    return json(
      rows.map((r) => ({
        id: r.id,
        solveId: r.solveId,
        sessionId: r.sessionId,
        at: r.at,
        caseKey: r.caseKey,
        primitive: r.primitive,
        moves: r.moves,
        execMs: r.execMs,
        recogMs: r.recogMs,
      })),
    );
  });
