import { batch, createMemo, createRoot, createSignal } from "solid-js";
import { buffersFromNames } from "~/lib/engine/classify";
import type { JudgeContext } from "~/lib/engine/judge";
import { caseKey, makeOrientationMaps } from "~/lib/engine/present";
import { invertOuterMoves, outerMoveToString } from "~/lib/cube/alg";
import { TimerMachine, type SolveOutcome } from "~/lib/timer/machine";
import type { CubeIO } from "~/lib/cube-io/types";
import { VirtualCube } from "~/lib/cube-io/virtual";
import { createLocalStorageAdapter } from "~/lib/storage/local";
import { createRemoteAdapter, fetchServerStatus, type ServerStatus } from "~/lib/storage/remote";
import { categoryIdsOf, DEFAULT_DNF_CATEGORIES } from "~/lib/dnf";
import { cleanScramble } from "~/lib/scramble";
import type {
  AlgExecution,
  DnfCategory,
  Session,
  SolvePatch,
  SolveRecord,
  StorageAdapter,
} from "~/lib/storage/types";
import { settings, setSettings } from "./settings";

/**
 * Client-side application store: wires the timer machine, the cube
 * connection, scramble generation and persistence together. Storage is the
 * Neon-backed API when the server has a database (logged in or guest
 * fallback), otherwise localStorage.
 */
function createApp() {
  let storage: StorageAdapter = createLocalStorageAdapter();

  // intrinsic-frame buffers derived from settings (user frame + orientation);
  // without floating, cycles are always labeled from the standard buffer
  const intrinsicBuffers = createMemo(() => {
    const maps = makeOrientationMaps(settings.orientation);
    const cornerNames = settings.profile.floating
      ? settings.buffers.corners
      : settings.buffers.corners.slice(0, 1);
    const edgeNames = settings.profile.floating
      ? settings.buffers.edges
      : settings.buffers.edges.slice(0, 1);
    const corners = cornerNames
      .map((n) => maps.cornerNameToIntrinsic(n))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    const edges = edgeNames
      .map((n) => maps.edgeNameToIntrinsic(n))
      .filter((r): r is NonNullable<typeof r> => r !== null);
    return { corners, edges };
  });

  const judgeContext = createMemo<JudgeContext>(() => {
    const maps = makeOrientationMaps(settings.orientation);
    const bufs = intrinsicBuffers();
    return {
      profile: { ...settings.profile },
      standardCorner: bufs.corners[0] ?? null,
      standardEdge: bufs.edges[0] ?? null,
      orozcoCornerHelper: maps.cornerNameToIntrinsic(settings.profile.orozcoCornerHelper),
      orozcoEdgeHelper: maps.edgeNameToIntrinsic(settings.profile.orozcoEdgeHelper),
    };
  });

  const machine = new TimerMachine(intrinsicBuffers(), judgeContext());

  const [tick, setTick] = createSignal(0);
  machine.subscribe(() => setTick((t) => t + 1));
  const snapshot = createMemo(() => {
    tick();
    machine.setBuffers(intrinsicBuffers(), judgeContext());
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
  const [dnfCategories, setDnfCategories] = createSignal<DnfCategory[]>([]);
  /** solve waiting to be tagged right after a DNF */
  const [pendingDnfId, setPendingDnfId] = createSignal<string | null>(null);

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
    await loadDnfCategories();
  }

  async function loadDnfCategories() {
    let cats = await storage.listDnfCategories();
    // first run gets a usable starting set; once seeded, an empty list is
    // the user's own doing and stays empty
    if (cats.length === 0 && !settings.dnfSeeded) {
      for (const [i, seed] of DEFAULT_DNF_CATEGORIES.entries()) {
        await storage.addDnfCategory({ name: seed.name, color: seed.color, sortIndex: i });
      }
      setSettings("dnfSeeded", true);
      cats = await storage.listDnfCategories();
    }
    setDnfCategories(cats);
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
      // about one in six 3BLD scrambles has its orientation suffix cancel
      // with the last move; draw again rather than hand out a wasted turn
      const alg = await cleanScramble(async () =>
        (await randomScrambleForEvent("333bf")).toString(),
      );
      machine.setScramble(alg);
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
        // a DNF asks for its reason straight away, while it is still fresh
        if (saved.result === "dnf") setPendingDnfId(saved.id);
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

  async function updateSolve(id: string, patch: SolvePatch) {
    // optimistic: the change is visible immediately, storage catches up
    setSolves((xs) => xs.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    try {
      await storage.updateSolve(id, patch);
    } catch (e) {
      setError(`saving solve failed: ${e}`);
    }
  }

  /** Add or remove one reason on a DNF; a solve can carry several. */
  async function toggleDnfCategory(id: string, categoryId: string) {
    const solve = solves().find((s) => s.id === id);
    if (!solve) return;
    const current = categoryIdsOf(solve);
    const next = current.includes(categoryId)
      ? current.filter((c) => c !== categoryId)
      : [...current, categoryId];
    if (next.length > 0 && pendingDnfId() === id) setPendingDnfId(null);
    await updateSolve(id, { result: "dnf", dnfCategoryIds: next, dnfCategoryId: null });
  }

  /** Flip a solve between OK and DNF after the fact. */
  async function setSolveResult(id: string, result: "ok" | "dnf") {
    // going back to OK drops the reason; going to DNF keeps whatever was set
    await updateSolve(
      id,
      result === "ok" ? { result, dnfCategoryIds: [], dnfCategoryId: null } : { result },
    );
    if (result === "dnf") setPendingDnfId(id);
    else if (pendingDnfId() === id) setPendingDnfId(null);
  }

  async function addDnfCategory(name: string, color: string): Promise<DnfCategory | null> {
    const sortIndex = Math.max(-1, ...dnfCategories().map((c) => c.sortIndex)) + 1;
    try {
      const cat = await storage.addDnfCategory({ name, color, sortIndex });
      setDnfCategories((xs) => [...xs, cat]);
      setSettings("dnfSeeded", true);
      return cat;
    } catch (e) {
      setError(`adding category failed: ${e}`);
      return null;
    }
  }

  async function updateDnfCategory(id: string, patch: Partial<Omit<DnfCategory, "id">>) {
    setDnfCategories((xs) => xs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    try {
      await storage.updateDnfCategory(id, patch);
    } catch (e) {
      setError(`saving category failed: ${e}`);
    }
  }

  async function deleteDnfCategory(id: string) {
    batch(() => {
      setDnfCategories((xs) => xs.filter((c) => c.id !== id));
      setSolves((xs) =>
        xs.map((s) =>
          categoryIdsOf(s).includes(id)
            ? { ...s, dnfCategoryIds: categoryIdsOf(s).filter((c) => c !== id), dnfCategoryId: null }
            : s,
        ),
      );
      setSettings("dnfSeeded", true);
    });
    try {
      await storage.deleteDnfCategory(id);
    } catch (e) {
      setError(`deleting category failed: ${e}`);
    }
  }

  async function deleteSolve(id: string) {
    await storage.deleteSolve(id);
    setSolves((xs) => xs.filter((s) => s.id !== id));
    setExecutions((xs) => xs.filter((e) => e.solveId !== id));
    if (selectedSolveId() === id) setSelectedSolveId(null);
    if (pendingDnfId() === id) setPendingDnfId(null);
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
    updateSolve,
    dnfCategories,
    pendingDnfId,
    setPendingDnfId,
    toggleDnfCategory,
    setSolveResult,
    addDnfCategory,
    updateDnfCategory,
    deleteDnfCategory,
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
