# BLD Timer — Specification

A practice tool for **3x3 blindfolded**, connected to a smart cube via
[btcube-web](https://github.com/simonkellly/btcube-web). It does not time solves. It measures
**flow**: how much of an execution was spent turning rather than standing still.

Two things the tool is deliberately careful about:

- **What it shows is measured, not inferred.** The scramble and the timestamped move stream are
  known exactly; the flow value follows from them and nothing else.
- **Two numbers, two questions.** Flow says how fluently you execute. The success rate says how
  often the solve worked. Neither is allowed to hide inside the other.

---

## 1. Flow

An execution is a sequence of turns separated by gaps. Short gaps are turning; long gaps are
standing still — recall, recognition, a regrip.

```
flow = (execution - paused) / execution
```

- **execution** = timestamp of the last turn minus timestamp of the first turn. Memorisation is
  outside it by construction, and so is the pause before the stop key: the window ends with the
  last turn.
- **paused** = the sum, over all gaps, of the part of the gap above the pause threshold.

### 1.1 The pause threshold

```
threshold = max(floor, factor x median gap of this attempt)     default: 250 ms, 3x
```

- **Adaptive**, because a fixed value means different things at different speeds: 200 ms between
  turns is a pause for someone at 8 TPS and perfectly normal turning at 4. The floor keeps a very
  slow attempt from declaring its own crawl fluent.
- **Only the excess counts.** Counting the whole gap would put a cliff exactly where the
  measurement is least certain — a 249 ms gap free, a 251 ms gap a quarter second. Counting the
  excess makes the value continuous.
- Fewer than four gaps: no personal speed to compare against, so the floor decides alone.
- Turns less than 20 ms apart are one event. A gyro-less cube reports a slice as its two outer
  turns at the same timestamp, and those zero gaps would otherwise drag the median down.

Both numbers are settings. Flow is **never stored** — it is recomputed from the move timestamps,
so changing the threshold re-scores the whole history instead of leaving old attempts judged by
an old setting.

### 1.2 What a failed attempt scores

Its real flow. A DNF is a statement about the memo or the algorithms, not about how fluently the
hands moved; scoring it 0 would quietly turn the flow average into a success rate, which is
exactly what the success rate is for.

The one attempt that scores 0 is the one given up before the second turn: there was no execution
in it, so there is no flow to measure. Its flow is reported as "—" and it counts as 0 in the
averages.

---

## 2. Scramble modes

Three exercises. Each is a **separate session** — an edge-only execution and a full solve are not
comparable, and mixing them into one average would say nothing about either.

| Mode | State |
|---|---|
| **full** | WCA 3BLD scramble (cubing.js `random-scramble-for-event("333bf")`) |
| **edges** | corners solved, edges in any legal permutation and orientation |
| **corners** | edges solved, corners in any legal permutation and orientation |

The one-piece-type scrambles are built **as states, not as algorithms**: draw a random legal orbit
(permutation parity even, because the solved type is even; flips summing to 0 mod 2, twists to 0
mod 3), hand the pattern to cubing.js's two-phase solver and invert the solution. The result is a
scramble of normal length (about 19 moves) reaching exactly that state. Composing random
commutators instead would produce long, lopsided scrambles that give away what they contain.

### 2.1 Holding orientation

A smart cube reports turns in its own frame, which is fixed to the cube: the white face is always
U to the hardware, whichever way round it is being held. Scrambles are written in that same frame.

Someone who solves with a different pair of colours up and front would otherwise have to turn the
cube into the WCA orientation to scramble it and back again to solve it. Instead the scramble is
**displayed** in the frame they hold the cube in, derived from the two colours they pick in
settings: the letters change, the physical result does not. Outer and wide turns keep their
amount, since clockwise-seen-from-outside is the same motion whichever way the cube is held; a
slice or a rotation can flip, because it is named after a face that may now be on the other side
of its axis. Corrections are shown in the same frame.

Nothing else moves. The follower, the state tracking and the flow measurement all stay in the
cube's own frame, where the hardware speaks.

**Scramble hygiene (full mode).** 3BLD scrambles end with a random orientation written as wide
moves, and cubing.js does not check that suffix against the scramble it follows: about one in six
comes out like `L2 U2 L2 Rw' Dw`, where `Rw'` is `L' x'` and the `L2` merges with it into a single
`L`. Scrambles are translated into the outer turns the cube reports and redrawn when the same face
appears twice in a row.

---

## 3. Attempt flow (state machine)

```
disconnected ──connect──▶ scrambling ──scramble matches──▶ ready
                              ▲  ▲                           │ first turn
                              │  '── turn while ready         ▼
                              │      (back, with corrections) solving
                              │                               │ space
                        awaitSolved ◀── unsolved ── done ◀────┘
                              │                    │
                              └── cube solved ─────┘ (solved ⇒ next scramble)
```

- **There is no start key.** Nothing is timed until the hands move, so the first turn after the
  scramble opens the attempt. Memorisation takes as long as it takes.
- **The attempt only ever ends with space**, never automatically, even when the cube reaches the
  solved state — as in real BLD, where you stop the timer yourself. The cube state at that moment
  decides: solved (in any whole-cube orientation) → success, otherwise DNF.
- **Space before the first turn** records a give-up: a failed attempt with no execution.
- **Escape discards** a running attempt without recording it — an accidental turn is not a DNF.
- **AWAIT_SOLVED**: after a DNF the cube is not solved; the next scramble waits for it.
- **SCRAMBLING**: follow-along with the scramble — completed moves green, current bold, pending
  orange, wrong moves as red corrections, simplified where they cancel. Progress is judged by
  state, so any path to the scrambled position counts.
- **Reset gesture**: four quarter turns of U or D in the same direction declare the cube solved,
  which fixes a desync without reaching for the keyboard. Safe by construction: it returns the
  cube exactly where it was, and no scramble or algorithm contains it. It stays available after
  the first turn of an attempt, but only while the gesture is the whole attempt so far.

Timing uses the cube's own clock (`cubeTimestamp`) when every turn of the attempt carries one, and
the local clock otherwise — never a mix, which would invent gaps that never happened.

---

## 4. Statistics

Per session, and across all sessions of the same mode:

- **Success rate** and solved / attempts.
- **Current and best** ao5, ao12, ao50, ao100, and the best single.
- **Chart**: every attempt's flow with the rolling ao5 and ao12 over it.
- **Attempt list**: flow, number of pauses, execution length, DNF marker; an attempt can be
  flipped between success and DNF afterwards, or deleted.

Averages are trimmed means over the flow values: drop the best and the worst for ao5 and ao12, 5%
at each end (rounded up) for ao50 and ao100 — the convention every speedcubing timer uses. There
is no "DNF average": every attempt carries a number, so the average always exists.

---

## 5. Settings

- **Holding orientation**: which colours are up and front when you solve (§2.1).
- **Pause threshold**: floor in ms and multiple of the median gap.
- **Theme**: dark / light.

Sessions are added and switched on the timer page.

---

## 6. Technical decisions

| Concern | Choice | Why |
|---|---|---|
| UI framework | **SolidJS + TypeScript** | Fine-grained reactivity, no VDOM — ideal for high-frequency move events |
| App framework | **SolidStart** (Vercel preset) | Server functions / API routes for auth + database |
| Hosting | **Vercel** | SolidStart deploys via the Vercel preset |
| Database | **Neon Postgres** + **Drizzle ORM** | Serverless driver fits Vercel functions; Drizzle is the lightest type-safe ORM |
| Auth | **better-auth** (email + password) | Stores users/sessions directly in Neon, works in SolidStart server functions |
| Cube logic | **cubing.js** (`kpuzzle`, `search`, `scramble`) | The state format btcube-web emits, plus the two-phase solver the mode scrambles are built on |
| Smart cube | **btcube-web** | QiYi + MoYu; RxJS subscriptions |
| Charts | **uPlot** | ~40 kB, fast time series |
| Styling | Plain CSS (CSS variables for theming) | Zero runtime cost |
| Tests | **Vitest** | Flow, statistics, scrambles and the state machine are pure functions |

### 6.1 Accounts & persistence

- **Login**: email + password via better-auth (cookie sessions), plus WCA OAuth.
- **Guest fallback**: without logging in the app acts as a shared default user, controlled by
  `ALLOW_GUEST_FALLBACK`. Without a database it runs entirely on localStorage.
- **Per-user data**: sessions (name + mode) and attempts (result, execution length, scramble,
  timed moves).
- The timer itself is 100% client-side — Bluetooth, state tracking, flow — so nothing is on the
  hot path. The attempt is written to the API afterwards, optimistically, without blocking the
  next one.

**Virtual cube dev mode**: keyboard/button-driven simulated smart cube, so the whole flow is
testable without hardware.

**Solved check**: state equality modulo whole-cube orientation (WCA rule).
