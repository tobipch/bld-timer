# BLD Timer

A smart-cube trainer for **3x3 blindfolded** that measures **flow** instead of time. Connects to
QiYi / MoYu smart cubes via [btcube-web](https://github.com/simonkellly/btcube-web).

There is no clock. What it measures is how much of an execution was actually spent turning:

```
flow = (execution - standing still) / execution
```

An execution with no hesitation is 100%. One where you stood still as long as you turned is 50%.
Memorisation is not measured at all, and neither is the pause before you stop the attempt — the
measured window is the first turn to the last.

Three exercises, each with its own sessions, because their numbers are not comparable:

| Mode | Scramble |
|---|---|
| **Full** | a WCA 3BLD scramble |
| **Edges** | corners stay solved |
| **Corners** | edges stay solved |

See [SPEC.md](./SPEC.md) for the full design.

## What counts as a pause

A gap between two turns counts as standing still once it is longer than **3x your own median gap
in that attempt**, but never below **250 ms**. Both are adjustable in Settings.

- The threshold scales with the solver: 200 ms between turns is a pause at 8 TPS and normal
  turning at 4.
- Only the part *above* the threshold is counted, so there is no cliff — a gap just over the line
  costs just over nothing.

Flow is never stored, only derived from the recorded move timestamps, so changing the threshold
re-scores the whole history rather than leaving old attempts judged by an old setting.

## Statistics

Success rate, current and best ao5 / ao12 / ao50 / ao100, best single, and a chart of every
attempt with its rolling ao5 and ao12. Averages are trimmed the usual way (best and worst out; 5%
at each end for the long ones).

**A failed attempt scores the flow of the execution it did have.** A DNF is a statement about the
memo or the algorithms, not about how fluently the hands moved; scoring it 0 would quietly turn
the flow average into a success rate. The success rate stands next to it as its own number, so
neither distorts the other. The one attempt that scores 0 is the one given up before the second
turn — there was no execution in it to measure.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test
npm run typecheck
```

No Bluetooth needed for development: connect the **virtual cube** on the timer page and drive it
with buttons / alg input (the "Auto-scramble" button applies the displayed scramble instantly).

Flow of an attempt: connect -> follow the scramble (green done / bold current / orange pending,
red corrections) -> memorise -> **the first turn starts the execution** -> **space** ends it (the
attempt never ends by itself, even with a solved cube). Solved at that moment = success, otherwise
DNF. `Escape` throws a running attempt away, space before the first turn records a give-up, and
four quarter turns of U or D in a row tell the app the cube is solved when tracking has drifted.

## Deployment (Vercel + Neon)

1. Create a [Neon](https://neon.tech) Postgres database.
2. Run the migrations once: `DATABASE_URL=... npm run db:migrate`
3. Import the repo in Vercel (framework: SolidStart / Vite is auto-detected) and set the env vars
   from [.env.example](./.env.example): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `ALLOW_GUEST_FALLBACK`.

Accounts are email + password (better-auth). Without logging in, the app falls back to a shared
**guest** user (disable with `ALLOW_GUEST_FALLBACK=false`). Without `DATABASE_URL` the app runs
fully client-side with browser storage — handy for development.
