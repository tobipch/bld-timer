# BLD Timer

A smart-cube timer for **3x3 blindfolded**. Connects to QiYi / MoYu smart cubes via
[btcube-web](https://github.com/simonkellly/btcube-web) and splits every solve into **memo** and
**execution**.

Its defining feature is the **replay**: step through any solve move by move — manually or played
back with the exact timing your cube recorded — and see the cube, the pieces still unsolved, and
where your hands hesitated. That is how you find out what went wrong, without the tool having to
guess.

Every DNF gets **tagged with its reasons** in one keypress each — as many as apply — so the
stats answer both questions: how often do I DNF, and what do I DNF at.

Alongside that, the reconstruction engine still recognizes commutators, parities, LTCTs, flips and
twists to build a **self-learning algorithm database** with your own execution times — as an aid,
never as a verdict.

See [SPEC.md](./SPEC.md) for the full design.

## How it works

- The cube is tracked piece-level in a center-fixed frame, so slice/wide-move algs work exactly as
  the gyro-less hardware reports them.
- The reconstruction engine classifies state diffs into BLD primitives (3-cycles with floating
  buffers, 2c2e parity, LTCT, flips, 2/3-twists) and segments the move stream with a
  time-gap-aware dynamic program — no algorithm list needed up front.
- Every recognized case is stored with the exact moves you performed plus execution and
  recognition time; the Algs page aggregates them into matrices, case details with variants, and
  slowest-case practice hints.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine + machine test suite (incl. 3,000+ real-alg fixtures)
npm run typecheck
```

No Bluetooth needed for development: connect the **virtual cube** on the timer page and drive it
with buttons / alg input (the "Auto-scramble" button applies the displayed scramble instantly).

Solve flow: connect → follow the scramble (green done / bold current / orange pending, red
corrections) → **space** starts memo → first turn starts execution → **space** stops (the timer
never stops automatically). Solved at that moment = success, otherwise DNF — then pick the reason
with `1`–`9`, or open the replay to find it.

In the replay: `←` `→` step, `↑` `↓` jump between pauses, `space` plays, and the timeline curve is
your turning speed over the solve. Every position also gives you a scramble-length alg that
reproduces exactly that state, so you can put the cube back where it broke.

## Deployment (Vercel + Neon)

1. Create a [Neon](https://neon.tech) Postgres database.
2. Run the migrations once: `DATABASE_URL=... npm run db:migrate`
3. Import the repo in Vercel (framework: SolidStart / Vite is auto-detected) and set the env vars
   from [.env.example](./.env.example): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `ALLOW_GUEST_FALLBACK`.

Accounts are email + password (better-auth). Without logging in, the app falls back to a shared
**guest** user (disable with `ALLOW_GUEST_FALLBACK=false`). Without `DATABASE_URL` the app runs
fully client-side with browser storage — handy for development.
