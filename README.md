# ArcTester

**Mobile-first AP ECET Computer Science preparation and assessment platform.**

ArcTester helps students prepare for the Andhra Pradesh Engineering Common Entrance Test (AP ECET) through structured practice, timed full-length mock exams, exam-result analytics, and a reviewed question bank. Android is the primary student experience, supported by a responsive web application and an administration portal.

## Product overview

- **Practice:** subject- and topic-based questions, immediate answer review, question history, and practice-mistake review.
- **Full mock exams:** timed 200-question AP ECET practice using the configured CSE paper structure.
- **Performance analytics:** separate reporting for practice attempts, completed full mocks, and graded assigned exams.
- **Question bank:** import and manage questions, track review status, and require administrator approval before publication.
- **Administration:** manage question content, mock papers, assigned exams, and result review.
- **Study resources:** publish external HTTPS resource links with supporting metadata.

Only approved questions are available to students. Imported or drafted content remains in review until an administrator approves it. Performance Analytics reports exam outcomes; learning progress and study guidance are maintained separately.

## Technology stack

| Component | Technologies |
| --- | --- |
| Android app | Expo, React Native, TypeScript |
| Web application | React, TypeScript, Vite |
| API | Node.js, Express |
| Data layer | Prisma ORM, PostgreSQL |
| Testing | Vitest, Playwright |
| Quality checks | ESLint, TypeScript, production builds |

Repository structure:

- `/mobile` — Android student application
- `/web` — responsive student and administration web application
- `/api` — backend API and Prisma schema
- `/docs` — project roadmap, deployment guidance, and migration documentation

## AP ECET CSE mock-paper structure

The configured full mock contains **200 questions over 3 hours**:

| Section | Questions |
| --- | ---: |
| Mathematics | 50 |
| Physics | 25 |
| Chemistry | 25 |
| Computer Science & Engineering | 100 |
| **Total** | **200** |

The CSE allocation is: Digital Electronics (6), Software Engineering (6), Computer Organisation and Microprocessors (8), Data Structures through C (10), Computer Networks (6), Operating Systems (10), DBMS (8), Java Programming (10), Web Technologies (8), Big-data & Cloud Computing (6), Android Programming (6), Internet of Things (8), and Python Programming (8).

When the question bank cannot satisfy a configured subject quota, the mock uses available questions and reports the shortfall rather than silently claiming a complete quota.

## Getting started

### Prerequisites

- Node.js 20.9 or later
- npm
- PostgreSQL

### Install and configure

From the repository root:

```bash
npm install
cp api/.env.example api/.env
```

Set the required database connection and a strong `JWT_SECRET` in `api/.env`. Then prepare the database:

```bash
npm run prisma:migrate --workspace=api
npm run prisma:seed --workspace=api
```

Start the API and web application in separate terminals:

```bash
npm run dev:api
```

```bash
npm run dev:web
```

The web application is available at `http://localhost:3000`; the API listens on `http://localhost:4000`. If the API runs at a different address, configure `VITE_API_URL` in `web/.env.local`.

## Docker

The repository includes a Docker Compose setup for local PostgreSQL-backed development:

```bash
cp .env.docker.example .env
# Set secure local credentials and JWT_SECRET.
docker compose up --build -d
docker compose logs -f
```

Stop the services with:

```bash
docker compose down
```

PostgreSQL data is persisted in the `arc-tester-postgres` volume. **Do not use `docker compose down -v` unless you intend to permanently delete the local database volume.**

## Testing and verification

Run the repository checks from the root:

```bash
npm test
npm run lint
npm run build
npm run typecheck --prefix mobile
npm test --prefix mobile
```

GitHub Actions is the authoritative CI verification. A change should be considered complete only when all required checks pass on the exact pull-request head commit.

## Deployment

### Web application — Vercel

Recommended project configuration:

- Root directory: repository root
- Install command: `npm ci`
- Build command: `VITE_BASE_PATH=/ npm run build:web`
- Output directory: `web/dist`
- Environment variable: `VITE_API_URL` set to the deployed API URL

### API — Render

Build the API from the repository root using `api/Dockerfile`. Configure the PostgreSQL `DATABASE_URL`, a strong `JWT_SECRET`, exact `CORS_ORIGINS`, and `NODE_ENV=production`. For cross-site cookie deployments, configure `COOKIE_SAME_SITE=None` and ensure the cookie security settings match the HTTPS deployment.

The API applies PostgreSQL migrations on startup. Do not run the legacy SQLite migration utility against the hosted PostgreSQL database. After deployment, verify authentication and protected API flows in a real browser; CI cannot validate provider configuration or third-party cookie behavior.

See [Platform and Release Deployment](docs/PLATFORM_RELEASE_DEPLOYMENT.md) for the detailed release procedure.

## Android builds

Install the mobile dependencies and run local checks:

```bash
npm install --prefix mobile
npm run typecheck --prefix mobile
npm test --prefix mobile
```

Release build scripts are maintained in `mobile/package.json`. Validate a release APK by installing and testing it on a physical Android device before distribution.

## Data migration

The legacy SQLite schema is retained in `api/prisma-sqlite/`. The one-time migration utility copies data into an empty, already-migrated PostgreSQL database and leaves the SQLite source unchanged. Back up the source database before migration and follow [SQLite to PostgreSQL Migration](docs/SQLITE_TO_POSTGRES_MIGRATION.md).

## Project status

The active implementation scope and milestone status are maintained in [the project roadmap](docs/ROADMAP.md). Changes are developed through pull requests and verified by CI before merge.

### Contribution workflow

Use a feature branch and open a pull request against `main`. Review the changed files, confirm that the required GitHub Actions checks pass on the current PR head, and merge only after the implementation and verification are complete. Avoid committing secrets, production credentials, or real student records.
