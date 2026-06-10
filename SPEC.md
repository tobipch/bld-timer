# BLD Timer — Specification

A speedcubing timer for **3x3 blindfolded**, connected to a smart cube via
[btcube-web](https://github.com/simonkellly/btcube-web). Its defining feature: it
**reconstructs every solve** — recognizing each commutator, parity, flip, twist and LTCT you
execute — and **builds your personal algorithm database automatically from your solves**,
including how fast you execute each case on average.

---

## 1. BLD theory (shared understanding)

This is the model the reconstruction engine is built on.

### 1.1 Pieces, stickers, letters

- A 3x3 has 8 corners (3 stickers each → 24 corner stickers) and 12 edges (2 stickers each
  → 24 edge stickers). Centers are fixed and define the orientation frame.
- Every sticker gets a letter. Default: **Speffz** (A–X for edges, A–X for corners), fully
  customizable in settings (same UX as ltct-trainer's letter scheme editor, extended to edges).
- A *target* is a sticker, not just a position: the corner piece in position UBL has three
  targets (UBL = A, BUL = R, LUB = E in Speffz) — which one is "the" target depends on how the
  piece is twisted.

### 1.2 Solving method (3-style)

- **Buffers**: one corner buffer (main: UFR) and one edge buffer (main: UF). Memo traces
  cycles: "the piece in the buffer belongs to X, the piece at X belongs to Y, …" producing a
  sequence of letter targets, consumed two at a time as *letter pairs*.
- **Commutators** `[A, B] = A B A' B'` (usually with setup moves: `[S: [A, B]] = S A B A' B' S'`)
  cycle exactly **three pieces**: buffer → target1 → target2 → buffer. One commutator solves
  two targets and disturbs nothing else.
- **Floating buffers**: when a new cycle must be opened, instead of cycling through the main
  buffer one may use a different buffer (Tobias' buffer order — edges: UF, UB, UR, UL, LU, LF,
  LD, LB, FR, FD, DF, DB, DR, DL; corners: UFR, UBL, UFL, UBR, RDF, FDL). A floating-buffer
  commutator is still a clean 3-cycle, just not through UF/UFR.
- **Parity**: if the number of corner targets is odd, the number of edge targets is odd too.
  After all full pairs are solved, one corner target and one edge target remain. A parity
  algorithm performs a double 2-swap: buffer↔last corner target **and** two edges
  (e.g. UF↔UR) simultaneously — 2 corners + 2 edges change, nothing else.
- **Pseudo swap (common parity technique)**: instead of solving the final edge target
  separately and then fixing parity, the parity handling is built into the final edge target.
  The final target is solved while the piece currently occupying the target position is sent
  to UR — with UF as buffer this is the edge cycle **UF → target → UR**. Solvers typically
  memorize corners first; if parity exists, edges are then memorized and executed so that the
  solve ends with the UF and UR edges swapped, and the parity algorithm (buffer↔last corner
  target + UF↔UR) finishes everything. For the engine this final pseudo-swap commutator is
  still a clean edge 3-cycle (target, UR) — it is detected normally and labeled as a
  pseudo-swap when corner parity is pending and the cycle ends in the parity edge slot.
- **Flips**: an edge in its correct position but flipped is solved by a 2-flip algorithm:
  flips exactly two edges in place (permutation unchanged).
- **Twists**: a corner in its correct position but twisted is solved by a 2-twist (one cw +
  one ccw) or 3-twist (three corners, same direction net-zero twist) algorithm: orientation
  changes only.
- **LTCT** (Last Target + Corner Twist): when parity coincides with a twisted corner, one
  algorithm solves both: 2 corners swapped + 2 edges swapped + 1 corner twisted in place.

### 1.3 What this means for reconstruction

Every "unit of work" in a BLD solve transforms the cube state by exactly one of these
**primitives** (measured as a diff between two checkpoints, in a center-fixed frame):

| Primitive | Corner perm | Corner ori | Edge perm | Edge ori |
|---|---|---|---|---|
| Edge commutator | – | – | 3-cycle | any (carried by cycle) |
| Corner commutator | 3-cycle | any (carried by cycle) | – | – |
| Parity | 2-swap | any (carried) | 2-swap | any (carried) |
| 2-Flip | – | – | – | 2 edges flipped in place |
| 2-Twist / 3-Twist | – | 2 or 3 corners twisted in place, net 0 (mod 3) | – | – |
| LTCT | 2-swap | + 1 extra corner twisted in place | 2-swap | any (carried) |
| No-op | – | – | – | – |

The engine never needs to *know* the user's algorithms in advance — it detects primitives
purely from state diffs, derives the letter pair from the sticker mapping, and **records the
move sequence the user actually performed** as that case's algorithm.

---

## 2. Core solve flow (timer state machine)

```
IDLE ──connect──▶ AWAIT_SOLVED ──cube solved──▶ SCRAMBLING ──scramble matches──▶ READY
                                                     ▲                            │ space
                                                     │ (turn while READY:         ▼
                                                     │  back to SCRAMBLING       MEMO ─────────────┐
                                                     │  with corrections)         │ first turn     │
                                                     │                            ▼                │ space during MEMO
                                                     │                           EXEC              │ ⇒ DNF
                                                     │                            │ space          │
                                                     │                            ▼                ▼
        new scramble generated ◀──────────────────── DONE ◀── solved ⇒ success │ unsolved ⇒ DNF ◀──┘
```

- **AWAIT_SOLVED**: on connect (or after a DNF), if the cube isn't solved, show the live cube
  state and ask the user to solve it (or mark current state as solved — escape hatch for
  state desync, with a "reset cube state" action).
- **SCRAMBLING**: a **random-state scramble** (cubing.js `random-scramble-for-event("333")`,
  generated in a web worker) is shown. Follow-along exactly like ltct-trainer:
  - completed moves **green**, current move **bold**, pending moves **orange/bold**,
  - wrong moves produce **red bold correction moves**, simplified/merged when they cancel,
  - the engine re-plans: after wrong moves it computes the remaining sequence from the
    current state rather than forcing undo-everything.
- **READY**: cube matches scramble. Big "ready" indicator. Space (with configurable hold
  time, default 0 ms = instant) starts the solve.
- **MEMO**: timer runs, phase shown as MEMO. No cube moves expected. First cube move event →
  memo time is frozen (`memo = firstMoveTimestamp − startTimestamp`) and phase becomes EXEC.
  Pressing space during MEMO ends the solve as **DNF** (no execution).
- **EXEC**: timer continues. The solve **always ends with space — never automatically**,
  even if the cube reaches the solved state (matching real BLD, where you stop the timer
  yourself). When space is pressed, the cube state at that moment decides the result:
  solved (any whole-cube orientation) → **success**; not solved → **DNF**.
- **DONE**: result card + reconstruction shown, next scramble generated immediately.
- Timer display during MEMO/EXEC is configurable: full time / nothing (blind-friendly).
  Memo/exec split is always recorded.

Timing uses cube event timestamps (`cubeTimestamp`, falling back to `localTimestamp`) for
move-relative measurements (memo→exec boundary, per-case timing) and `performance.now()` for
space-key events.

---

## 3. Reconstruction engine

The heart of the app. Pure TypeScript, no UI dependencies, heavily unit-tested.

### 3.1 State tracking

- Cube state comes from btcube-web (`KPattern` on connect/state events) and is advanced
  move-by-move with cubing.js KPuzzle.
- All analysis happens on a **piece-level model** derived from the KPattern: corner
  permutation (8) + twist (mod 3), edge permutation (12) + flip (mod 2), **normalized to a
  center-fixed frame** (slice turns done physically arrive as outer-layer moves on
  gyro-less smart cubes; normalizing by center orientation makes M/S/E-based algs and the
  solved-in-any-orientation check work correctly).

### 3.2 Segmentation

Given the scrambled start state and the timestamped move sequence of the execution phase:

1. Walk the moves, maintaining the state. A move index `i` is a **checkpoint candidate** if
   `diff(state_at_last_checkpoint, state_at_i)` is one of the primitives in §1.3.
2. On solve completion, run a **dynamic-programming segmentation** over all candidates to
   pick the best full partition of the move sequence into primitives. Score: minimize
   unexplained moves, then prefer boundaries matching already-known algs from the database,
   then fewer segments. (Greedy alone can be fooled by an accidental clean state mid-alg.)
3. For each segment, derive its **case identity**:
   - find the buffer: the cycle position that appears earliest in the user's configured
     buffer priority order,
   - compute the letter pair at sticker level (where the buffer sticker went = first letter,
     where that sticker's content went = second letter),
   - classify: edge/corner commutator (+ which buffer), parity (+ which corner target & edge
     swap), 2-flip, 2/3-twist (+ stickers & directions), LTCT (+ targets & twist),
   - mark an edge commutator as **pseudo-swap** when the corner state still carries a pending
     parity 2-swap and the cycle's second target is the parity edge slot (UR for UF buffer) —
     displayed as "final target X (pseudo swap)" rather than a plain letter pair.
4. **DNF analysis**: if the solve ended unsolved (or segmentation cannot explain the full
   sequence), report the longest valid prefix segmentation, then show *where it broke*:
   the move index of the last good checkpoint, the moves after it, and the state diff that
   "didn't make sense" (which pieces were left broken). This is the "see where you went
   wrong" view.

### 3.3 Per-case timing

For each segment, record:

- **execution time** = timestamp(last move of segment) − timestamp(first move of segment),
- **recognition/think time** = timestamp(first move of segment) − timestamp(last move of
  previous segment) (for the first segment: − exec-phase start).

### 3.4 Output (per solve)

An ordered list of steps, e.g.:

```
1. Edge comm   UF: C→K→B   (R U' R' U, M')        rec 0.42s  exec 1.21s
2. Edge comm   UF: L→G→D   (…)                    rec 0.55s  exec 1.34s
3. Corner comm UFR: A→F→G  (…)                    rec 0.71s  exec 1.48s
4. Twist       cw P / ccw F (…)                   rec 0.62s  exec 1.90s
5. LTCT        LT: B, CT: R (…)                   rec 0.80s  exec 2.10s
✗ after step 5: 14 moves not forming any case — 2 corners broken (C, T). DNF point here.
```

Letter pairs always rendered through the user's letter scheme.

---

## 4. Self-learning algorithm database

**No Excel import.** The database is built exclusively from real solves:

- Every successfully classified segment is stored: case key (scheme-independent sticker IDs +
  type + buffer), exact move sequence (normalized: merged/cancelled rotations trimmed),
  exec time, recognition time, solve reference, date.
- Aggregation per case: occurrence count, distinct move-sequence **variants** with per-variant
  count/avg/best, overall avg/best exec time, avg recognition time, last seen.
- **Database views**:
  - per type: corner comms / edge comms (matrix view per buffer, like a spreadsheet grid:
    rows/cols are targets, cells show avg time and count; empty = never performed),
  - parity / flips / twists / LTCT lists,
  - case detail: all recorded variants, their times, and the solves they came from,
  - sortable "slowest cases" / "most inconsistent cases" tables — practice hints.
- Manual curation: a recorded segment can be deleted (e.g. a fumbled execution you don't want
  polluting the stats); variants can be labeled "main".

---

## 5. Statistics

Per session and all-time (sessions: simple named lists, default "Session 1", switchable):

- **Time list**: every solve with total / memo / exec, success or DNF, click → full
  reconstruction detail.
- **Time trend**: chart of solve times over time (total, with memo portion visually
  distinguished), plus rolling ao12 line. DNFs marked.
- **Success rate**: all-time, current session, last 50.
- **bo5 / ao5 / ao12**: current and personal best. WCA DNF rules: ao5/ao12 drop best+worst,
  one DNF counts as worst, ≥2 DNFs → DNF average; bo5 = best single of the last 5.
- Memo/exec averages (successful solves).

---

## 6. Settings

- **Letter scheme editor**: 24 corner stickers + 24 edge stickers, Speffz default, persisted;
  same interaction style as ltct-trainer's `LetterSchemeEditor`.
- **Cube orientation**: free-text rotation sequence (e.g. `x y`), exactly as in
  ltct-trainer's settings (`cubeOrientation`, default empty = white top / green front).
  Defines the frame in which letters, buffers, and the scramble display are interpreted —
  the reconstruction engine and scramble follow-along both work in this rotated frame.
- **Buffer priority order** (edges and corners) for floating-buffer labeling — defaults to
  Tobias' order from §1.2, reorderable.
- **Timer**: space hold duration (default 0 ms), show/hide running time, show time during
  memo y/n.
- **Display**: dark/light theme.
- All settings persisted locally.

---

## 7. Technical decisions

Chosen for performance (per Tobias: "most performant stack"):

| Concern | Choice | Why |
|---|---|---|
| UI framework | **SolidJS + TypeScript** | Fastest mainstream reactive framework (fine-grained reactivity, no VDOM) — ideal for high-frequency move events and a live ms timer |
| App framework | **SolidStart** (Vercel preset) | Keeps SolidJS while adding server functions/API routes needed for auth + database |
| Hosting | **Vercel** | As requested; SolidStart deploys via the Vercel preset |
| Database | **Neon Postgres** + **Drizzle ORM** | As requested; serverless driver fits Vercel functions, Drizzle is the lightest type-safe ORM |
| Auth | **better-auth** (email + password) | Framework-agnostic, stores users/sessions directly in Neon, works in SolidStart server functions; OAuth providers can be added later without migration |
| Build | **Vite** | Underlies SolidStart; same family as ltct-trainer, instant dev server |
| Cube logic | **cubing.js** (`kpuzzle`, `scramble`) | Already the state format btcube-web emits (`KPattern`); WCA-grade random-state scrambles in a worker |
| Smart cube | **btcube-web** | As requested (QiYi + MoYu); RxJS subscriptions |
| Charts | **uPlot** | Fastest tiny chart lib (~40 kB), perfect for time series |
| Styling | Plain CSS (CSS variables for theming) | Zero runtime cost, no framework lock-in |
| Tests | **Vitest** | Engine is pure functions → fixture-based tests with real solve sequences |

### 7.1 Accounts & persistence

- **Login**: email + password via better-auth (cookie sessions). Sign-up, login, logout,
  password change. OAuth providers are a later, migration-free addition.
- **Guest fallback (for testing)**: the app is fully usable without logging in —
  unauthenticated visitors transparently act as a shared **default user** (a real row in the
  database). A banner notes "using the app as guest — log in to keep your data personal".
  Controlled by an env flag (`ALLOW_GUEST_FALLBACK`, on by default for now).
- **Per-user data** (all keyed by user id): settings + letter scheme, timer sessions, solves
  (times, scramble, move log, reconstruction), learned alg cases and their recorded
  executions/timings.
- **Schema sketch**: `user` / `session` / `account` (better-auth managed), `timer_session`,
  `solve` (result, total/memo/exec ms, scramble, moves JSON, reconstruction JSON),
  `alg_case` (type, buffer, sticker-level targets), `alg_execution` (case ref, solve ref,
  move sequence, exec ms, recognition ms).
- **Data flow**: the timer itself is 100 % client-side (Bluetooth, state tracking,
  reconstruction — no latency on the hot path). After each solve, the result and its
  classified segments are written to the API in one request, optimistically, without
  blocking the next solve. History/stats/database views read from the API. No offline mode
  for now (future work).

**Virtual cube dev mode**: keyboard-driven simulated smart cube (keys → moves) behind a dev
flag, so the whole flow — scramble follow, memo/exec, reconstruction, learning DB — is fully
testable without Bluetooth hardware and in CI. Real-cube testing is done by Tobias.

**Solved check**: state equality modulo whole-cube orientation (WCA rule).

---

## 8. Milestones

1. **M1 — Skeleton + state machine**: SolidStart scaffold (Vercel-ready), virtual cube,
   timer state machine (§2) end-to-end with keyboard cube, memo/exec split.
2. **M2 — Scramble**: random-state generation, follow-along UI with corrections, READY gate.
3. **M3 — Reconstruction engine**: piece model, primitive detection, DP segmentation, DNF
   point-of-failure analysis. Full unit-test suite (this milestone is test-heavy on purpose).
4. **M4 — Persistence & accounts**: Neon + Drizzle schema, better-auth email/password,
   guest fallback to default user, solves stored server-side.
5. **M5 — Learning database**: per-case aggregation and timing, matrix/list views, case
   detail, curation.
6. **M6 — Statistics**: time list, trend chart, success rate, bo5/ao5/ao12, sessions.
7. **M7 — Settings**: letter scheme editor, orientation, buffer order, timer options,
   theming.
8. **M8 — Real hardware integration**: btcube-web wiring polish, connection UX, battery,
   state-desync recovery; production Vercel deployment checks.

Each milestone lands as working, committed increments on the feature branch.

---

## 9. Defaults chosen (flag if wrong)

- Space **hold 0 ms** to start, i.e. instant (configurable).
- Space during MEMO = DNF.
- The solve only ever ends with space; solved-in-any-orientation at that moment = success.
- Guest fallback enabled: without login, data goes to the shared default user.
- Sessions exist but a single default session is created; stats default to current session
  with an all-time toggle.
- English UI only for now (i18n structure kept simple enough to add DE later).
