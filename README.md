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
- [x] **1. Prisma schema, migrations, seed, question import with tests**
- [x] **2. Selection service with unit tests** (pure functions, no routes/DB)
- [x] **3. Mock-test engine** (build test, timer, auto-submit, scoring) — API only
- [x] **4. UI** (home, test screen with palette, result review with explanations)
- [x] **5. Analytics** (weak-topics report, score history, progress export/import)
- [ ] **6 (later).** auth (JWT), Dockerfile, GitHub Actions

Each phase: builds with no TS errors, tests pass, demoable locally.

## Phase 3 — Mock-test engine (`api/src/testService.ts` + `testRoutes.ts`)

API only, no UI. Routes validate with Zod and pass errors to a friendly
error middleware (`api/src/errors.ts`): Zod → 400 with per-field reasons,
app errors → their status, anything else → generic 500 (raw errors are never
leaked to the UI). Tests run on a temp SQLite DB served over a real port —
no new libraries (plain `fetch`, no supertest).

- `POST /tests` — `{mode: "mock"|"practice"|"mistakes", subject?, count?}`.
  Builds the set with the Phase 2 selector, persists an `Attempt` with
  `startedAt` + `deadline` (mock = 180 min; else 0.9 min/question, min 5).
  Returns questions **without** `correctIndex`/`explanation` plus
  `warnings[]` (one per shortfall).
- `POST /tests/:id/submit` — `{answers: [{questionId, selectedIndex|null}]}`.
  Scores server-side, persists `AttemptAnswer`s and updates `Stat`s via
  `nextStat` in ONE transaction. 409 on a second submit; 400 for answers
  outside that attempt; unanswered counts as wrong. A submit after the
  deadline is still accepted but marked `expired: true`.
- `GET /tests/:id/result` — score, per-subject breakdown, and per-question
  `correctIndex` + `explanation`; 403 until the test is submitted.
- `GET /tests/:id` — in-progress attempt for **restore-on-refresh**: sanitized
  questions, `deadline`, `serverNow`, and the saved selections. 404 if the
  attempt does not exist; **409** once submitted (with a pointer to the result).
- `GET /bank` — per-subject question counts + `total` for the home page.

CORS: the API allows `http://localhost:*` / `127.0.0.1` origins only (hand-rolled
8-line middleware — no `cors` package, so no new dependency).

## Phase 4 — UI (`/web`, Next.js App Router)

Plain CSS in one global stylesheet (`web/app/globals.css`) — no UI libraries.
Light/dark follows `prefers-color-scheme`; every control is keyboard reachable
with a visible focus ring; labels wrap every input; mobile-friendly at 360px.

- **Home** (`/`) — mode picker (mock / practice / mistakes), subject + count
  for practice, live bank counts, shortfall warnings, friendly error banner.
- **Test** (`/test/[id]`) — one question at a time, option select, clear answer,
  mark for review, palette (answered / marked / unanswered / current), countdown
  computed from the **server** deadline minus **elapsed client time** (so a wrong
  system clock cannot extend a paper), auto-submit at the deadline, confirm
  before manual submit, `beforeunload` warning, and **restore on refresh** via
  `GET /tests/:id` + `sessionStorage`.
- **Result** (`/result/[id]`) — score, per-subject table, wrong-answer review
  with the correct option and explanation; expired attempts get a warning.
- **API client** (`web/lib/api.ts`) — typed, base URL from
  `NEXT_PUBLIC_API_URL` (see `web/.env.local.example`), every failure becomes a
  friendly sentence (never raw error text).
- **Tests** — pure helpers only, node env, no jsdom:
  `lib/timer.test.ts` (9), `lib/palette.test.ts` (5), `lib/answers.test.ts` (6).

## Phase 2 — Selection service (pure functions, `api/src/selection.ts`)

No Prisma, no I/O, no hidden `Math.random`. The caller passes in candidates +
stats + a random function, so tests inject a fixed/seeded source and stay
deterministic. Phase 3 will wire this to the DB + routes without touching it.

- `selectQuestions(candidates, stats, requested, random)` → unseen first
  (shuffled), then wrong with higher `wrong` first (shuffled within equal
  counts), then the rest by oldest `lastSeen` (strict, never shuffled).
  Dedupes by id, never returns more than requested, rejects negative counts.
- `selectMockTest(candidates, stats, random)` → applies the 16 official quotas
  (Maths 50 … Python 8 = 200) in paper order and returns
  `{ questions, shortfalls: [{ subject, requested, available }] }`. Thin banks
  contribute what exists; the UI will render each shortfall as a warning.
- `nextStat(prev, outcome, now)` → `seen + 1`, `lastSeen = now`; `correct`
  heals `wrong - 1` (floor 0), `wrong`/`unanswered` hurt `wrong + 1`.
- Helpers: `shuffleArray` (Fisher-Yates, pure), `createSeededRandom`
  (mulberry32, no deps), `MOCK_QUOTAS` / `MOCK_TOTAL` (= 200).

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

## Phase 5 — Analytics (`api/src/analytics.ts` + `analyticsRoutes.ts`)

No UI yet — API endpoints only, same Zod validation + friendly-error middleware.

- `GET /analytics/weak-topics` — per-subject (and per-topic) rows
  `{ subject, topic, seen, wrong, accuracy }` sorted weakest-first
  (lowest accuracy; ties by most wrong). Includes `weakest` — the single
  weakest subject, or `null` when nothing has been seen yet.
- `GET /analytics/history` — submitted attempts newest first:
  `{ attemptId, mode, startedAt, finishedAt, score, total, expired }`.
- `GET /analytics/export` — full personal backup:
  `{ exportedAt, stats[{questionId, seen, wrong, lastSeen}],
attempts[...], answers[{attemptId, questionId, chosen, isCorrect}] }`.
  Download this file; it's your offline progress snapshot.
- `POST /analytics/import` — restore a backup. Validates strictly with Zod,
  rejects references to unknown questions (import never invents questions),
  merges stats additively (seen/wrong stack; lastSeen keeps the newer),
  skips duplicate attempt ids, and re-links answers only to attempts that
  exist. Returns `{ addedStats, updatedStats, addedAttempts, skippedDuplicates }`.

All endpoints live under `/analytics/*` behind the same hand-rolled CORS
(localhost origins only) and error middleware. Tests cover weakest-first
ordering, history sorting, export round-trip into a fresh test server, bad
payloads, unknown question rejection, and duplicate-id idempotency
(`api/tests/analytics.test.ts`).

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
