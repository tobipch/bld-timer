import { batch, createMemo, createRoot, createSignal } from "solid-js";
import { outerMoveToString } from "~/lib/cube/alg";
import { TimerMachine, type SolveOutcome } from "~/lib/timer/machine";
import type { CubeIO } from "~/lib/cube-io/types";
import { VirtualCube } from "~/lib/cube-io/virtual";
import { createLocalStorageAdapter } from "~/lib/storage/local";
import { createRemoteAdapter, fetchServerStatus, type ServerStatus } from "~/lib/storage/remote";
import { generateScramble } from "~/lib/scramble";
import type { Session, SolveRecord, StorageAdapter } from "~/lib/storage/types";
import { settings, setSettings } from "./settings";

/**
 * Client-side application store: wires the timer machine, the cube
 * connection, scramble generation and persistence together. Storage is the
 * Neon-backed API when the server has a database (logged in or guest
 * fallback), otherwise localStorage.
 */
function createApp() {
  let storage: StorageAdapter = createLocalStorageAdapter();

  const machine = new TimerMachine();

  const [tick, setTick] = createSignal(0);
  machine.subscribe(() => setTick((t) => t + 1));
  const snapshot = createMemo(() => {
    tick();
    return machine.snapshot();
  });

  const [cube, setCube] = createSignal<CubeIO | null>(null);
  const [battery, setBattery] = createSignal<number | null>(null);
  const [error, setError] = createSignal<string | null>(null);
  const [scrambleLoading, setScrambleLoading] = createSignal(false);

  const [sessions, setSessions] = createSignal<Session[]>([]);
  const [solves, setSolves] = createSignal<SolveRecord[]>([]);
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
    try {
      const ss = await storage.listSessions();
      setSessions(ss);
      if (!settings.sessionId || !ss.some((s) => s.id === settings.sessionId)) {
        setSettings("sessionId", ss[0]?.id ?? null);
      }
      setSolves(await storage.listSolves());
    } catch (e) {
      // without sessions nothing can be saved, and silently ending up with
      // an empty screen is the worst way to find that out. The usual cause
      // is a database still waiting for the latest migration.
      setError(
        `Could not load your sessions (${e}). Nothing will be saved until this works — ` +
          `if the app was just updated, the database migration is probably still pending ` +
          `(npm run db:migrate).`,
      );
    }
  }

  const currentSession = createMemo(
    () => sessions().find((s) => s.id === settings.sessionId) ?? sessions()[0] ?? null,
  );
  const sessionSolves = createMemo(() =>
    solves()
      .filter((s) => s.sessionId === settings.sessionId)
      .sort((a, b) => a.startedAt - b.startedAt),
  );

  async function newScramble() {
    setScrambleLoading(true);
    try {
      machine.setScramble(await generateScramble());
    } catch (e) {
      setError(`scramble generation failed: ${e}`);
    } finally {
      setScrambleLoading(false);
    }
  }

  function wireCube(io: CubeIO) {
    io.onMove((m) => {
      const before = machine.phase;
      machine.onCubeMove(m.move, m.tLocal, m.tCube);
      // the solving turn ends the attempt on its own
      if (before === "solving" && machine.phase === "done") finishAttempt();
    });
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
    // the move clocks are the cube's, not the wall's; anchoring the record on
    // "now minus the execution" keeps the list in order without pretending
    // the two clocks are the same one
    const rec: Omit<SolveRecord, "id"> = {
      sessionId: sid,
      startedAt: Date.now() - Math.round(outcome.execMs),
      result: outcome.result,
      execMs: Math.round(outcome.execMs),
      scramble: outcome.scramble,
      moves: outcome.moves.map((m) => ({ m: outerMoveToString(m.m), t: m.t })),
    };
    try {
      const saved = await storage.addSolve(rec);
      batch(() => {
        setSolves((xs) => [...xs, saved]);
        setSelectedSolveId(saved.id);
      });
    } catch (e) {
      setError(`saving attempt failed: ${e}`);
    }
  }

  /** Space (or the trigger button). Returns true when the event was consumed. */
  function trigger(): boolean {
    const phase = machine.phase;
    if (phase !== "ready" && phase !== "solving") return false;
    machine.trigger(Math.round(performance.now()));
    if (machine.phase === "done") finishAttempt();
    return true;
  }

  /** Save the attempt that just ended and line up the next one. */
  function finishAttempt() {
    if (!machine.lastOutcome) return;
    void persistOutcome(machine.lastOutcome);
    machine.nextSolve();
    void newScramble();
  }

  /** Throw away a running attempt — an accidental turn is not a DNF. */
  function discard() {
    if (machine.phase !== "ready" && machine.phase !== "solving") return;
    machine.discard();
    void newScramble();
  }

  async function updateSolve(id: string, result: "ok" | "dnf") {
    // optimistic: the change is visible immediately, storage catches up
    setSolves((xs) => xs.map((s) => (s.id === id ? { ...s, result } : s)));
    try {
      await storage.updateSolve(id, { result });
    } catch (e) {
      setError(`saving attempt failed: ${e}`);
    }
  }

  async function deleteSolve(id: string) {
    await storage.deleteSolve(id);
    setSolves((xs) => xs.filter((s) => s.id !== id));
    if (selectedSolveId() === id) setSelectedSolveId(null);
  }

  /** Delete every attempt of the current session. */
  async function clearSession() {
    const sid = settings.sessionId;
    if (!sid) return;
    try {
      await storage.clearSession(sid);
      batch(() => {
        setSolves((xs) => xs.filter((s) => s.sessionId !== sid));
        setSelectedSolveId(null);
      });
    } catch (e) {
      setError(`resetting the session failed: ${e}`);
    }
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
    currentSession,
    solves,
    sessionSolves,
    selectedSolveId,
    setSelectedSolveId,
    connectSmart,
    connectVirtual,
    disconnect,
    trigger,
    discard,
    newScramble,
    deleteSolve,
    updateSolve,
    addSession,
    clearSession,
    server,
    storageMode,
  };
}

let instance: ReturnType<typeof createApp> | null = null;

export function useApp() {
  if (!instance) instance = createRoot(() => createApp());
  return instance;
}
