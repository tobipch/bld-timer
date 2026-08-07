import type { APIEvent } from "@solidjs/start/server";
import { eq } from "drizzle-orm";
import { schema } from "~/server/db";
import { handle, json, newId, requireUser } from "~/server/api";
import type { AlgExecution, SolveRecord } from "~/lib/storage/types";

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
        totalMs: r.totalMs,
        memoMs: r.memoMs,
        execMs: r.execMs,
        scramble: r.scramble,
        moves: r.moves,
        reconstruction: r.reconstruction,
        dnfCategoryId: r.dnfCategoryId,
        note: r.note,
        confirmedFindings: r.confirmedFindings,
      })),
    );
  });

interface PostBody {
  solve: Omit<SolveRecord, "id">;
  executions: Omit<AlgExecution, "id" | "solveId">[];
}

export const POST = (event: APIEvent) =>
  handle(async () => {
    const { db, userId } = await requireUser(event.request);
    const body = (await event.request.json()) as PostBody;
    const s = body.solve;
    const solveId = newId();
    await db.insert(schema.solve).values({
      id: solveId,
      userId,
      sessionId: s.sessionId,
      startedAt: s.startedAt,
      result: s.result,
      totalMs: s.totalMs,
      memoMs: s.memoMs,
      execMs: s.execMs,
      scramble: s.scramble,
      moves: s.moves,
      reconstruction: s.reconstruction,
      dnfCategoryId: s.dnfCategoryId ?? null,
    });
    const execs = (body.executions ?? []).map((e) => ({
      id: newId(),
      userId,
      solveId,
      sessionId: e.sessionId,
      at: e.at,
      caseKey: e.caseKey,
      primitive: e.primitive,
      moves: e.moves,
      execMs: e.execMs,
      recogMs: e.recogMs,
    }));
    if (execs.length > 0) await db.insert(schema.algExecution).values(execs);
    return json({
      solve: { ...s, id: solveId },
      executions: execs.map(({ userId: _u, ...e }) => e),
    });
  });
