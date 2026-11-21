# ArcTester — AP ECET CSE Learning & Practice

ArcTester is a mobile-first AP ECET Computer Science preparation app. Android is the primary student experience; responsive web provides practice and administration.

- `/mobile` — Expo + React Native + TypeScript (Android)
- `/web` — React + TypeScript + Vite
- `/api` — Node.js + Express + Prisma + PostgreSQL
- Tests: Vitest; lint: ESLint; formatting: Prettier

## Learning and practice

- Short subject/topic practice with immediate answer review.
- One timed 200-question AP ECET Full Mock Test using the CSE subject split.
- Practice mistakes, question history and transparent rule-based study recommendations.
- Student progress and question-bank export for offline practice.
- Administrator question review, source-required approval, question import and mock-paper management.
- Published study resources are HTTPS links. ArcTester stores the URL and metadata, not uploaded file bytes.

Only human-approved questions are served to students. Imported or newly drafted questions remain in review until an administrator approves them with a real source.

## AP ECET CSE paper pattern

200 questions, 3 hours: Mathematics 50, Physics 25, Chemistry 25, and CSE 100.

CSE split: Digital Electronics 6, Software Engineering 6, Computer Organisation and Microprocessors 8, Data Structures through C 10, Computer Networks 6, Operating Systems 10, DBMS 8, Java Programming 10, Web Technologies 8, Big-data & Cloud Computing 6, Android Programming 6, Internet of Things (IoT) 8, and Python Programming 8.

When the bank is short for a quota, the test uses available questions and reports the shortfall.

## Local development

Requirements: Node.js 20.9+, npm, PostgreSQL.

```bash
npm install
cp api/.env.example api/.env
# Set DATABASE_URL and a strong JWT_SECRET in api/.env.
npm run prisma:migrate --workspace=api
npm run prisma:seed --workspace=api

# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:web
```

Open `http://localhost:3000`; the API listens on `http://localhost:4000`. Set `VITE_API_URL` in `web/.env.local` if the API is elsewhere.

## Docker

```bash
cp .env.docker.example .env
# Replace JWT_SECRET and set the database credentials.
docker compose up --build -d
docker compose logs -f
docker compose down
```

PostgreSQL data is stored in the named `arc-tester-postgres` volume. `docker compose down -v` permanently removes it.

## Hosted deployment

### Vercel web

- Root directory: repository root.
- Install: `npm ci`.
- Build: `VITE_BASE_PATH=/ npm run build:web`.
- Output: `web/dist`.
- Environment: `VITE_API_URL=https://<your-api>.onrender.com`.

### Render API

Build from the repository root using `api/Dockerfile`. Configure `DATABASE_URL` (Render PostgreSQL internal URL with `?schema=public`), `JWT_SECRET`, exact `CORS_ORIGINS`, `COOKIE_SAME_SITE=None` for cross-site cookies, and `NODE_ENV=production`.

The API applies PostgreSQL migrations on startup. Do not run SQLite migrations against the hosted PostgreSQL database. Verify login, refresh, logout and protected calls in a real browser; CI cannot verify provider settings or third-party cookie behavior.

See `docs/PLATFORM_RELEASE_DEPLOYMENT.md`.

## Android

```bash
npm install --prefix mobile
npm run typecheck --prefix mobile
npm test --prefix mobile
```

Android build scripts are maintained in `mobile/package.json`. The release APK must be generated and installed on a physical device for release verification.

## Verification

```bash
npm test
npm run lint
npm run build
npm run typecheck --prefix mobile
npm test --prefix mobile
```

GitHub Actions is the project verifier. A phase is complete only after its full scope is merged with green CI on the exact PR head and reported. Current phase scope and status live in [`docs/ROADMAP.md`](docs/ROADMAP.md).

## SQLite migration utility

The legacy SQLite schema is retained in `api/prisma-sqlite/`. The one-time migration helper copies data into an empty, already-migrated PostgreSQL database and never modifies the SQLite source. Back up the source database first and follow `docs/SQLITE_TO_POSTGRES_MIGRATION.md`.
