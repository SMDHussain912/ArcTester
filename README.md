# AP ECET (CSE) Mock-Test Platform — Offline

Offline-first mock-test platform for AP ECET CSE personal study. Portfolio-quality monorepo.

- `/web` — React + TypeScript + Vite (browser application)
- `/mobile` — Expo + React Native + TypeScript (Android/iOS; Android debug APK build is automated)
- `/desktop` — Electron (Windows installer)
- `/api` — Node.js + TypeScript + Express + Prisma + PostgreSQL + Zod
- Tests: Vitest · Lint/format: ESLint + Prettier
- Runs on `localhost` with **no internet after install**. Lightweight for 8 GB RAM.

## Exam pattern (APECET 2026 CSE)

200 questions, 3 hours: Maths 50, Physics 25, Chemistry 25, CSE 100.

CSE split: Digital Electronics 6, Software Engineering 6, Computer Organization and Microprocessors 8,
Data Structures through C 10, Computer Networks 6, Operating Systems 10, DBMS 8, Java Programming 10,
Web Technologies 8, Big Data & Cloud Computing 6, Android Programming 6, Internet of Things (IoT) 8, Python Programming 8.

> If the bank has fewer questions than required, the app uses what exists and shows a warning.

## Quickstart (offline, Linux)

```bash
# 0. one-time install (needs internet once)
npm install

# 1. API (http://localhost:4000)
cp api/.env.example api/.env
# Start PostgreSQL and ensure DATABASE_URL points to it.
npm run prisma:migrate --workspace=api
npm run prisma:seed --workspace=api
npm run dev:api
# health check:
curl http://localhost:4000/health

# 2. Web (http://localhost:3000) — new terminal
npm run dev:web
```

Open <http://localhost:3000>, create an account on **Sign in**, and start a
test. The API runs on :4000 and the web app talks to it at
`http://localhost:4000` (set in `web/.env.local`).

## Run with Docker

```bash
# Create your local Docker settings and replace the JWT secret.
cp .env.docker.example .env
# Start both services (the API applies migrations and seeds the starter bank).
docker compose up --build -d

# Follow logs or stop the services.
docker compose logs -f
docker compose down
```

Open <http://localhost:3000>. The API health endpoint is
<http://localhost:4000/health>. PostgreSQL data is stored in the named
`arc-tester-postgres` volume and survives container restarts. To remove the
database as well, use `docker compose down -v` (this permanently deletes
saved accounts and progress).

For phone access, set `VITE_API_URL` and `CORS_ORIGINS` in the root
`.env` file to your computer's LAN IP, then rebuild the web image with
`docker compose up --build -d`. See the LAN steps below.

## Hosted deployment: Vercel frontend + Render API

The current production frontend build is **Vite** (`npm run build:web`, output
`web/dist`). Keep the Vercel project rooted at the repository root so the npm workspaces and
root lockfile are available.

### Vercel (static web app)

- Root Directory: repository root (`.`).
- Install Command: `npm ci`.
- Build Command: `npm run build:web`.
- Output Directory: `web/dist`.
- Environment Variable: `VITE_API_URL=https://YOUR-API.onrender.com`.

`VITE_API_URL` is compiled into the static bundle at build time. Redeploy the
web app after changing it.

### Render (API service)

Create a Docker web service from the repository with the repository root as
the Docker build context and `api/Dockerfile` as the Dockerfile path. Do not set
the service root directory to `api`: the Dockerfile copies the root workspace
lockfile and both workspace manifests.

Configure these environment variables on Render:

- `DATABASE_URL`: the Render PostgreSQL **internal** connection URL, including
  `?schema=public`.
- `JWT_SECRET`: a random secret generated with `openssl rand -hex 32`.
- `CORS_ORIGINS`: the exact browser origin of the Vercel app, e.g.
  `https://your-app.vercel.app` (no trailing slash). Multiple exact origins
  can be comma-separated.
- `COOKIE_SAME_SITE=None`: required when the frontend and API are cross-site.
  The API sets `Secure` automatically when `NODE_ENV=production`.
- `NODE_ENV=production` (Render's Node/Docker runtime normally sets this).

The API entrypoint applies Prisma migrations before starting the server. Do not
manually run SQLite migrations against the PostgreSQL service.

### Browser cookie warning

Vercel's default `*.vercel.app` domain and Render's default `*.onrender.com`
domain are different sites. `SameSite=None; Secure` permits the cross-site
cookie, but browser privacy settings can still block third-party cookies.
For reliable browser sessions, use custom domains under the same registrable
domain (for example `app.example.com` and `api.example.com`) and keep the
API's CORS origin set to the exact app origin. A same-origin API proxy is
another option, but is not configured by this repository yet.

After deploying, verify login, page refresh, logout, and a protected API request
in at least one desktop browser and one mobile browser. CI does not prove the
provider-side environment variables or real-browser cookie behavior.

## Move existing SQLite data to PostgreSQL

The previous SQLite schema and migration history are preserved in
`api/prisma-sqlite/`. The main application now uses PostgreSQL. The one-time
migration helper copies existing rows and IDs into an **empty, already-migrated**
PostgreSQL schema; it never modifies the SQLite source.

1. Back up your SQLite database file first.
2. If the SQLite database is not at the latest legacy schema, apply the
   preserved SQLite migrations first:
   `DATABASE_URL="file:/absolute/path/to/arc-tester.db" npx prisma migrate deploy --schema=api/prisma-sqlite/schema.prisma`.
3. Configure `.env` with `POSTGRES_USER`, `POSTGRES_PASSWORD`, and
   `POSTGRES_DB`, then start only PostgreSQL:
   `docker compose up -d postgres`.
4. Apply the PostgreSQL schema from the host, using the local port:
   `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DB?schema=public" npx prisma migrate deploy --schema=api/prisma/schema.prisma`.
5. Install the one-time migration dependency:
   `python -m pip install -r requirements-migrate.txt`.
6. Copy the data (change the source path if your SQLite file is elsewhere):
   `DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/DB?schema=public" python scripts/migrate_sqlite_to_postgres.py --sqlite api/prisma/dev.db`.
7. Check the printed row counts, then start the app:
   `docker compose up --build -d`.

For a previous Docker volume, find its exact name with
`docker volume ls --format '{{.Name}}' | grep arc-tester-data`, then copy it:
`docker run --rm -v ACTUAL_VOLUME_NAME:/old -v "$PWD":/backup alpine cp /old/arc-tester.db /backup/arc-tester-old.db`.
Pass that copied file with `--sqlite arc-tester-old.db`.

The target tables must be empty before importing. Do not start the API container
before importing an old database: its entrypoint seeds starter questions.
For a fresh installation with no SQLite data to preserve, skip this section
and use `docker compose up --build -d` directly.

### Running on a phone (same Wi-Fi)

Both servers bind to all interfaces by default, so a phone on the same
network can reach them. The API allows localhost origins by default; add
your web app's LAN origin to `CORS_ORIGINS` to allow a phone to connect.
The web app's API URL defaults to `localhost:4000`, so set it to your
computer's LAN IP when opening the web app from a phone.

To make it work from a real device:

1. Find your machine's LAN IP: `hostname -I` (e.g. `192.168.1.5`).
2. In `web/.env.local`, point the app at the LAN IP:
   `VITE_API_URL=http://192.168.1.5:4000`.
3. Add the web origin to `CORS_ORIGINS` in `api/.env`:
   `CORS_ORIGINS=http://192.168.1.5:3000`. Multiple origins can be
   comma-separated. Localhost origins remain allowed by default.
4. Open `http://192.168.1.5:3000` on the phone.

For a native app, no cookie is needed: use `POST /auth/token` and send
`Authorization: Bearer <jwt>` (see "Mobile app" below).

## Scripts (repo root)

| Command                | What it does                 |
| ---------------------- | ---------------------------- |
| `npm run dev`          | Run API + Web together       |
| `npm run dev:api`      | API dev server (`tsx watch`) |
| `npm run dev:web`      | Web dev server (Vite)  |
| `npm run build`        | Build both workspaces        |
| `npm run test`         | Vitest in both workspaces    |
| `npm run lint`         | ESLint in both workspaces    |
| `npm run format`       | Prettier write               |
| `npm run format:check` | Check Prettier formatting |
| `npm run dev:mobile`   | Expo development server |
| `npm run dev:desktop`  | Electron desktop shell |
| `npm run build:mobile` | Export Expo app bundles |
| `EXPO_PUBLIC_API_URL=https://YOUR-API npm run build:mobile:android` | Build a standalone Android APK signed with the debug keystore (JDK 17 + Android SDK required) |
| `npm run build:desktop:win` | Package Windows installer (after web build) |

Question bank (run from the repo root):

| Command                                              | What it does                       |
| ---------------------------------------------------- | ---------------------------------- |
| `npm run import:questions --workspace=api -- <file>` | Import questions from CSV or JSON  |
| `npm run import:questions --workspace=api`           | Seed the starter bank (idempotent) |
| `npm run prisma:migrate --workspace=api`             | Create/apply migrations            |

## Product requirements

The maintained product and engineering baseline is in [`docs/PRODUCT_REQUIREMENTS.md`](docs/PRODUCT_REQUIREMENTS.md). The consolidated 16-phase master roadmap, phase-by-phase acceptance criteria, progress audit and current completion estimate are in [`docs/ARC_TESTER_16_PHASE_MASTER_ROADMAP.md`](docs/ARC_TESTER_16_PHASE_MASTER_ROADMAP.md). It defines role boundaries, subject-first practice, the formal examination lifecycle, invigilation, attendance, announcements, UX standards, verification requirements, and the prioritized roadmap. Treat roadmap items as planned until their end-to-end workflow is implemented and verified.

## Architecture and status

The maintained application is a multi-platform monorepo:

- **Web:** React + TypeScript + Vite in `/web`.
- **API:** Node.js + TypeScript + Express + Prisma + PostgreSQL in `/api`.
- **Mobile:** Expo + React Native + TypeScript in `/mobile`.
- **Desktop:** Electron shell in `/desktop`.

The CI workflow checks API/web tests, lint and production builds, mobile typechecking,
SQLite-to-PostgreSQL migration utility tests, and privacy-safe TensorFlow dataset
preparation tests. A successful commit or pull request must be confirmed from its
actual Actions run; a local edit or push alone is not verification.

Current phase scores, acceptance criteria, dependencies and open work are maintained
only in [the 16-phase master roadmap](docs/ARC_TESTER_16_PHASE_MASTER_ROADMAP.md).
This README intentionally does not mark any phase complete.

## Mobile app

The API is already usable from a native client — a native app has no cookie
jar, so it exchanges credentials for a bearer token once and sends it on
every request:

```bash
# 1. get a token (returns { token, tokenType: "Bearer", expiresIn, user })
curl -X POST http://localhost:4000/auth/token \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"yourpassword"}'

# 2. use it
curl -X POST http://localhost:4000/tests \
  -H 'content-type: application/json' \
  -H 'authorization: Bearer <token>' \
  -d '{"mode":"practice","subject":"Java","count":5}'
```

`requireAuth` accepts **either** the cookie **or** `Authorization: Bearer
<jwt>`. The cookie wins when both are present, so the web app is never
downgraded to a weaker transport by accident.

For a real device, the API must be reachable over the LAN and the CORS
allowlist widened beyond `localhost` — see "Running on a phone" above.
A React Native / Expo client can reuse the same endpoints with no new
server-side work.

## Project rules

- Validate all input with Zod. Keep routes, services, data access separate.
- Never expose raw errors to the UI. Use clear messages.
- Never delete files or run destructive commands without asking.
- Small commits with clear messages. Tests after every phase.

## Local verification

```bash
npm install
npm run build
npm run test
npm run lint
npm run format:check
npm run dev:api   # curl http://localhost:4000/health
npm run dev:web   # open http://localhost:3000
```


## Multi-platform clients

The React + Vite web client is the default browser app. The Expo app in `/mobile` uses the existing `POST /auth/token` bearer-token flow and stores its token with Expo SecureStore. The Electron shell in `/desktop` packages the web production build for Windows.

Install the client dependencies separately:

```bash
npm run install:mobile
npm run install:desktop
npm run dev:mobile
```

For a phone on your Wi-Fi, set `EXPO_PUBLIC_API_URL` in `mobile/.env` to your computer's LAN IP (for example `http://192.168.1.5:4000`). Set `VITE_API_URL` for the web build to the same reachable API address.
