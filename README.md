# AP ECET (CSE) Mock-Test Platform — Offline

Offline-first mock-test platform for AP ECET CSE personal study. Portfolio-quality monorepo.

- `/web` — Next.js (App Router) + React + TypeScript (strict)
- `/api` — Node.js + TypeScript + Express + Prisma + SQLite + Zod
- Tests: Vitest · Lint/format: ESLint + Prettier
- Runs on `localhost` with **no internet after install**. Lightweight for 8 GB RAM.

## Exam pattern (APECET 2026 CSE)

200 questions, 3 hours: Maths 50, Physics 25, Chemistry 25, CSE 100.

CSE split: Digital Electronics 6, Software Engineering 6, Computer Organisation 8,
Data Structures 10, Computer Networks 6, Operating Systems 10, DBMS 8, Java 10,
Web Technologies 8, Big Data & Cloud 6, Android 6, IoT 8, Python 8.

> If the bank has fewer questions than required, the app uses what exists and shows a warning.

## Quickstart (offline, Linux)

```bash
# 0. one-time install (needs internet once)
npm install

# 1. API (http://localhost:4000)
cp api/.env.example api/.env
npm run dev:api
# health check:
curl http://localhost:4000/health

# 2. Web (http://localhost:3000) — new terminal
npm run dev:web
```

## Scripts (repo root)

| Command                | What it does                 |
| ---------------------- | ---------------------------- |
| `npm run dev`          | Run API + Web together       |
| `npm run dev:api`      | API dev server (`tsx watch`) |
| `npm run dev:web`      | Web dev server (`next dev`)  |
| `npm run build`        | Build both workspaces        |
| `npm run test`         | Vitest in both workspaces    |
| `npm run lint`         | ESLint in both workspaces    |
| `npm run format`       | Prettier write               |
| `npm run format:check` | Prettier check (CI-friendly) |

## Phases

- [x] **0. Scaffold** — monorepo, tooling, scripts, README skeleton (this step)
- [ ] **1. Prisma schema, migrations, seed, question import with tests**
- [ ] **2. Selection service with unit tests** (unseen → wrong → oldest-seen, shuffle in group)
- [ ] **3. Mock-test engine** (build test, timer, auto-submit, scoring)
- [ ] **4. UI** (home, test screen with palette, result review with explanations)
- [ ] **5. Analytics** (weak-topics report, score history, progress export/import)
- [ ] **6 (later).** auth (JWT), Dockerfile, GitHub Actions

Each phase: builds with no TS errors, tests pass, demoable locally.

## Project rules

- Validate all input with Zod. Keep routes, services, data access separate.
- Never expose raw errors to the UI. Use clear messages.
- Never delete files or run destructive commands without asking.
- Small commits with clear messages. Tests after every phase.

## Verify Phase 0

```bash
npm install
npm run build
npm run test
npm run lint
npm run format:check
npm run dev:api   # curl http://localhost:4000/health
npm run dev:web   # open http://localhost:3000
```
