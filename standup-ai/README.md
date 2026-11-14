# StandUp AI

Prototype AI tutor for ACT/SAT prep, aimed at schools. Adaptive per-skill practice, a tutor that probes how each student thinks, and teacher dashboards.

## Setup

```bash
cp .env.example .env.local     # add ANTHROPIC_API_KEY
npm install
npm run db:up && npm run db:push && npm run db:seed   # Postgres in Docker, bound to localhost only
npm run dev                    # demo UI on mock data at http://localhost:3000
```

## Question pipeline

```bash
python3 -m venv scripts/verify/.venv && scripts/verify/.venv/bin/pip install -r scripts/verify/requirements.txt
npm run gen:questions -- --skill <skill-uuid> --n 20
```

Math answers are checked by sympy, English by an independent blind model answer. Questions land as `verified` or `draft`; a human promotes them to `live`.

## Other commands

- `npm test` runs engine, pipeline and retention tests (retention needs the DB running).
- `npm run db:retention` hard-deletes chat messages older than 45 days. Run it daily.
- `scripts/verify/.venv/bin/python scripts/verify/test_verify.py` runs the verifier tests.

## Student competition demo

The home page now opens the student MVP. No database or model calls are required.
See [DEMO.md](DEMO.md) for the walkthrough, official question sources, and optional live tutoring.
