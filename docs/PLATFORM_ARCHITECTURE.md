# Platform architecture

ArcTester is a mobile-first AP ECET CSE learning and practice platform.

## Applications

- **Android mobile:** Expo + React Native + TypeScript. Primary student learning experience.
- **Web:** React + TypeScript + Vite. Responsive student practice and administrator workspace.
- **API:** Node.js + Express + Prisma. PostgreSQL is the production database.
- **SQLite:** retained only for the one-time SQLite-to-PostgreSQL migration utility.
- **Desktop shell:** not a supported product; desktop packaging and native modules were removed.

## Data flow

The API is the source of truth for users, approved questions, practice attempts, question snapshots, progress and administrator-managed content. Students receive only human-approved questions. Question selection and study recommendations use transparent deterministic rules; there is no model training, inference, embedding service or AI provider in the application runtime.

Study resources are external HTTPS links. ArcTester stores the resource URL and metadata, not uploaded document bytes.

## Engineering constraints

- Keep the Android bundle and API dependencies small for low-end devices and free hosting.
- Preserve practice-attempt recovery and offline question-bank export.
- Keep administrator question review and mock-paper management on web.
- Maintain backward-compatible API contracts where possible; removals use an explicit database cleanup migration.
- GitHub Actions is the verification source. Never mark a phase complete before exact-head CI is green and the PR is merged.
