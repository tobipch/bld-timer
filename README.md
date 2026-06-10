# BLD Timer

A smart-cube timer for **3x3 blindfolded**. Connects to QiYi / MoYu smart cubes via
[btcube-web](https://github.com/simonkellly/btcube-web), splits every solve into **memo** and
**execution**, and — its defining feature — **reconstructs the solve**: every commutator, parity,
LTCT, flip and twist you execute is recognized from the cube state, lettered in your scheme, timed,
and collected into a **self-learning algorithm database**. On a DNF it shows exactly where the
solve went wrong.

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
never stops automatically). Solved at that moment = success, otherwise DNF.

## Deployment (Vercel + Neon)

1. Create a [Neon](https://neon.tech) Postgres database.
2. Run the migrations once: `DATABASE_URL=... npm run db:migrate`
3. Import the repo in Vercel (framework: SolidStart / Vite is auto-detected) and set the env vars
   from [.env.example](./.env.example): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
   `ALLOW_GUEST_FALLBACK`.

Accounts are email + password (better-auth). Without logging in, the app falls back to a shared
**guest** user (disable with `ALLOW_GUEST_FALLBACK=false`). Without `DATABASE_URL` the app runs
fully client-side with browser storage — handy for development.
