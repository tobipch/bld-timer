import { batch, createMemo, createRoot, createSignal } from "solid-js";
import { buffersFromNames } from "~/lib/engine/classify";
import { caseKey, makeOrientationMaps } from "~/lib/engine/present";
import { invertOuterMoves, outerMoveToString } from "~/lib/cube/alg";
import { TimerMachine, type SolveOutcome } from "~/lib/timer/machine";
import type { CubeIO } from "~/lib/cube-io/types";
import { VirtualCube } from "~/lib/cube-io/virtual";
import { createLocalStorageAdapter } from "~/lib/storage/local";
import { createRemoteAdapter, fetchServerStatus, type ServerStatus } from "~/lib/storage/remote";
import type { AlgExecution, Session, SolveRecord, StorageAdapter } from "~/lib/storage/types";
import { settings, setSettings } from "./settings";

/**
 * Client-side application store: wires the timer machine, the cube
 * connection, scramble generation and persistence together. Storage is the
 * Neon-backed API when the server has a database (logged in or guest
 * fallback), otherwise localStorage.
 */
function createApp() {
  let storage: StorageAdapter = createLocalStorageAdapter();

  // intrinsic-frame buffers derived from settings (user frame + orientation)
  const intrinsicBuffers = createMemo(() => {
    const maps = makeOrientationMaps(settings.orientation);
    const corners = settings.buffers.corners
      .map((n) => maps.cornerNameToIntrinsic(n))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const edges = settings.buffers.edges
      .map((n) => maps.edgeNameToIntrinsic(n))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { corners, edges };
  });

  const machine = new TimerMachine(intrinsicBuffers());

  const [tick, setTick] = createSignal(0);
  machine.subscribe(() => setTick((t) => t + 1));
  const snapshot = createMemo(() => {
    tick();
    machine.setBuffers(intrinsicBuffers());
    return machine.snapshot();
  });

  const [cube, setCube] = createSignal<CubeIO | null>(null);
  const [battery, setBattery] = createSignal<number | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [scrambleLoading, setScrambleLoading] = createSignal(false);

  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [solves, setSolves] = createSignal<SolveRecord[]>([]);
  const [executions, setExecutions] = createSignal<AlgExecution[]>([]);
  const [selectedSolveId, setSelectedSolveId] = createSignal<string | null>(null);
  const [server, setServer] = createSignal<ServerStatus | null>(null);
  const [storageMode, setStorageMode] = createSignal<"local" | "remote">("local");

  async function loadData() {
    const status = await fetchServerStatus();
    setServer(status);
    if (status?.db && (status.user || status.guestAllowed)) {
      storage = createRemoteAdapter();
      setStorageMode("remote");
    }
    const ss = await storage.listSessions();
    setSessions(ss);
    let sid = settings.sessionId;
    if (!sid || !ss.some((s) => s.id === sid)) {
      sid = ss[0].id;
      setSettings("sessionId", sid);
    }
    setSolves(await storage.listSolves());
    setExecutions(await storage.listExecutions());
  }

  const sessionSolves = createMemo(() =>
    solves()
      .filter((s) => s.sessionId === settings.sessionId)
      .sort((a, b) => a.startedAt - b.startedAt),
  );

  async function newScramble() {
    setScrambleLoading(true);
    try {
      const { randomScrambleForEvent } = await import("cubing/scramble");
      const alg = await randomScrambleForEvent("333bf");
      machine.setScramble(alg.toString());
    } catch (e) {
      setError(`scramble generation failed: ${e}`);
    } finally {
      setScrambleLoading(false);
    }
  }

  function wireCube(io: CubeIO) {
    io.onMove((m) => machine.onCubeMove(m.move, m.tLocal, m.tCube));
    io.onBattery?.((pct) => setBattery(pct));
    batch(() => {
      setCube(io);
      setError(null);
    });
    machine.connect();
    void newScramble();
  }

  async function connectSmart() {
    // btcube-web needs Web Bluetooth, which Firefox and Safari don't ship;
    // checking first also avoids their import-time crash of the module
    if (typeof navigator === "undefined" || !("bluetooth" in navigator) || !navigator.bluetooth) {
      setError("This browser has no Web Bluetooth — use Chrome or Edge to connect a smart cube.");
      return;
    }
    try {
      const { connectSmartCubeIO } = await import("~/lib/cube-io/smart");
      wireCube(await connectSmartCubeIO());
    } catch (e) {
      const msg = `${e}`;
      setError(
        /dynamically imported module|NotFoundError: .*chooser/i.test(msg)
          ? `${msg} — if this persists, make sure you're on Chrome or Edge with Bluetooth enabled.`
          : msg,
      );
    }
  }

  function connectVirtual() {
    wireCube(new VirtualCube());
  }

  function disconnect() {
    cube()?.disconnect();
    setCube(null);
    setBattery(null);
    machine.disconnect();
  }

  async function persistOutcome(outcome: SolveOutcome) {
    const sid = settings.sessionId;
    if (!sid) return;
    const useCube = outcome.moves.length > 0 && outcome.moves.every((m) => m.tCube !== undefined);
    const rec: Omit<SolveRecord, "id"> = {
      sessionId: sid,
      startedAt: Date.now() - outcome.totalMs,
      result: outcome.result,
      totalMs: outcome.totalMs,
      memoMs: outcome.memoMs,
      execMs: outcome.execMs,
      scramble: outcome.scramble,
      moves: outcome.moves.map((m) => ({
        m: outerMoveToString(m.move),
        t: (useCube ? m.tCube! : m.tLocal) | 0,
      })),
      reconstruction: outcome.reconstruction,
    };
    const execs = outcome.reconstruction.steps
      .filter((s) => s.kind === "case" && s.primitive)
      .map((s) => {
        // shared-setup cases: record the full standalone conjugate alg
        const moves = s.setupMoves
          ? [...s.setupMoves, ...s.moves, ...invertOuterMoves(s.setupMoves)]
          : s.moves;
        return {
          sessionId: sid,
          at: rec.startedAt,
          caseKey: caseKey(s.primitive!),
          primitive: s.primitive!,
          moves: moves.map(outerMoveToString).join(" "),
          execMs: s.execMs,
          recogMs: s.recogMs,
        };
      });
    try {
      const { solve: saved, executions: savedExecs } = await storage.addSolveWithExecutions(rec, execs);
      batch(() => {
        setSolves((xs) => [...xs, saved]);
        setExecutions((xs) => [...xs, ...savedExecs]);
        setSelectedSolveId(saved.id);
      });
    } catch (e) {
      setError(`saving solve failed: ${e}`);
    }
  }

  /** Space (or trigger button). Returns true when the event was consumed. */
  function trigger(): boolean {
    const phase = machine.phase;
    if (phase !== "ready" && phase !== "memo" && phase !== "exec") return false;
    machine.trigger(Math.round(performance.now()));
    if (machine.phase === "done" && machine.lastOutcome) {
      const outcome = machine.lastOutcome;
      void persistOutcome(outcome);
      machine.nextSolve();
      void newScramble();
    }
    return true;
  }

  async function deleteSolve(id: string) {
    await storage.deleteSolve(id);
    setSolves((xs) => xs.filter((s) => s.id !== id));
    setExecutions((xs) => xs.filter((e) => e.solveId !== id));
    if (selectedSolveId() === id) setSelectedSolveId(null);
  }

  async function deleteExecution(id: string) {
    await storage.deleteExecution(id);
    setExecutions((xs) => xs.filter((e) => e.id !== id));
  }

  async function addSession(name: string) {
    const s = await storage.addSession(name);
    setSessions((xs) => [...xs, s]);
    setSettings("sessionId", s.id);
  }

  void loadData();

  return {
    machine,
    snapshot,
    cube,
    battery,
    error,
    setError,
    scrambleLoading,
    sessions,
    solves,
    sessionSolves,
    executions,
    selectedSolveId,
    setSelectedSolveId,
    connectSmart,
    connectVirtual,
    disconnect,
    trigger,
    newScramble,
    deleteSolve,
    deleteExecution,
    addSession,
    intrinsicBuffers,
    server,
    storageMode,
  };
}

let instance: ReturnType<typeof createApp> | null = null;

export function useApp() {
  if (!instance) instance = createRoot(() => createApp());
  return instance;
}
