# ArcTester — Product Requirements

## Current delivery scope
ArcTester is a mobile-first AP ECET CSE study and practice app. Students use subject-first practice, one timed Full Mock Test, submitted results, progress analytics, announcements, and HTTPS study-resource links. Student assigned-exam and invigilation screens are not part of the learning client. See [ROADMAP.md](ROADMAP.md).

## Roles
- **Student:** dashboard, subject/topic practice, timed Full Mock Test, results/review, progress, announcements, and published study links.
- **Administrator (web):** manage subjects/topics/questions, review and publish question content, author/version/publish exams, manage invitations/announcements, and access existing administrative exam reports/attendance/live-session tools. Existing assignment/invigilation API and data remain for admin compatibility; they are not student navigation features.

## Practice and Full Mock Test
- Students choose one or more subjects before creating custom practice. Topic filters are optional and scoped to selected subjects.
- Custom papers support 1–200 questions and difficulty filters. Distribute questions across selected subjects and report shortages clearly.
- Keep one timed AP ECET Full Mock Test using the official 200-question subject distribution when the approved bank can support it; if the bank is short, use available approved questions and show subject shortfalls.
- Server owns scoring and progress. Prevent duplicate scoring; preserve active practice recovery and answer persistence.
- Question selection and weak-topic recommendations are transparent deterministic rules. Prioritize missed questions for revision; do not use ML inference or model training.

## Question content and administration
- Questions include subject/topic, text, four options, correct answer, explanation, source, difficulty, and review status.
- Admin can create/edit/delete, search/filter, bulk manage, and import CSV/JSON with preview, duplicate detection, and row-level validation.
- Students see approved content only. Draft/imported content remains unapproved until a human checks accuracy, explanation, and source.
- Published exam snapshots remain immutable when the reusable bank changes.

## Study resources and communications
- Study materials store metadata and validated HTTPS links only; do not store uploaded/base64 document bytes. Legacy resources require admin relinking and remain drafts until reviewed.
- Admin announcements support optional expiry. Students can acknowledge and revisit notices; notification counts reflect visible, non-expired notices.

## UX, accessibility, and performance
- Mobile is primary; web follows with responsive parity and web-only administration.
- Keep the app lightweight for low-end Android and free hosting. Use FOSS tools and avoid heavy runtime dependencies.
- Respect reduced motion; provide sound/haptics toggles. Keep animations brief and non-blocking, targeting smooth 60 FPS.
- Use accessible labels, keyboard/focus support, readable contrast, text scaling, clear loading/error/empty states, and confirmation for destructive actions.

## Architecture and trust
- Web: React + TypeScript + Vite. API: Node.js + Express. Data: Prisma + PostgreSQL; SQLite is retained only for migration tooling.
- No TensorFlow/Hugging Face stack, model registry/training/evaluation, embeddings, ML inference, or AI-provider runtime. No desktop app.
- Enforce auth/role checks server-side; never expose correct answers before submit, secrets, stack traces, or raw database errors. Preserve user progress and existing data through additive/safe migrations.

## Verification
Report only commands and CI checks actually run on the exact commit. Required gates: tests, lint, build, migration verification, mobile typecheck, Playwright practice + Full Mock Test, and installable Android APK build. Production migration/backup, hosted settings, physical-device performance, and user approval/relinking must be listed as NOT VERIFIED until manually performed.
