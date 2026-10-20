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

- [x] **0. Scaffold** — monorepo, tooling, scripts, README skeleton
- [x] **1. Prisma schema, migrations, seed, question import with tests** (this step)
- [ ] **2. Selection service with unit tests** (unseen → wrong → oldest-seen, shuffle in group)
- [ ] **3. Mock-test engine** (build test, timer, auto-submit, scoring)
- [ ] **4. UI** (home, test screen with palette, result review with explanations)
- [ ] **5. Analytics** (weak-topics report, score history, progress export/import)
- [ ] **6 (later).** auth (JWT), Dockerfile, GitHub Actions

Each phase: builds with no TS errors, tests pass, demoable locally.

## Phase 1 — Question bank (Prisma + SQLite + Zod)

Why validated strings instead of Prisma enums: SQLite has no enum column type
(it would silently become plain text anyway), so `difficulty`/`source` are
`String` columns and Zod enforces the allowed values in code — one source of
truth, no false safety. Same reason options live in a JSON string column:
SQLite has no array type, so Zod enforces "exactly 4 non-empty strings" before
anything is stored.

Duplicates are blocked by a `UNIQUE` hash on the normalized question text
(lowercase, trimmed, collapsed spaces), so " WHAT is 2+2? " and
"what is 2+2?" count as the same question — at the database level.

### Database scripts

```bash
cp api/.env.example api/.env          # DATABASE_URL="file:./dev.db"
npm run prisma:generate --workspace=api
npm run prisma:migrate --workspace=api # creates + applies migration
npm run prisma:seed --workspace=api    # idempotent: 28 now, 0 on re-run
```

### Import formats

**JSON** — a list shaped like the legacy `BASE` array:

```json
[["Maths", "What is 2 + 2?", ["3", "4", "5", "6"], 1, "Basic addition."]]
```

Each item: `[subject, question, [optionA, optionB, optionC, optionD], correctIndex 0-3, explanation?]`.

**CSV** — header row required. Columns:

```text
subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty
```

Required: `subject, text, optionA, optionB, optionC, optionD, correctIndex`.
Optional (defaults): `topic` → `General`, `explanation` → `""`,
`source` → `csv`, `difficulty` → `medium` (must be `easy|medium|hard`).
Quoted fields may contain commas/newlines; `""` is an escaped quote.

Both imports run in **one transaction** (all valid rows land, or none do) and
return a report shaped like:

```json
{ "added": 2, "duplicates": 1, "total": 4, "invalid": [{ "row": 3, "reason": "…" }] }
```

Row numbers are 1-based (JSON counts from the first item; CSV counts the
header as row 1).

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
