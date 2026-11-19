# ArcTester — Product Requirements & Engineering Baseline

**Product:** ArcTester  
**Primary audience:** AP ECET Computer Science Engineering diploma candidates  
**Primary mode:** Offline-first personal study and locally administered practice/examinations  
**Status:** Living requirements document. Existing functionality and planned work are deliberately distinguished.

## 1. Product objective

ArcTester helps students prepare for AP ECET CSE through subject-based practice, full mock papers, assigned examinations, reviewable results, and progress analytics. Administrators manage the reusable question bank, build and publish examination versions, assign candidates, communicate notices, and monitor examination sessions.

The application must remain usable on modest hardware (including 8 GB RAM systems), be responsive on phones and desktops, and continue to support local/offline operation after dependencies and question content are installed.

## 2. Roles and access boundaries

### Student
- Sign in using an account provisioned through the invitation flow.
- View the learning dashboard, available question-bank subjects, assigned examinations, and announcements.
- Create practice sessions by selecting one or more subjects. Topic filters are optional and must never replace subject selection.
- Take assigned examinations only when their publication and availability rules permit.
- Review submitted results and explanations where the examination policy allows it.
- Access only their own attempts, assignments, submissions, and progress.

### Administrator
- Manage subjects, topics, and the reusable question bank.
- Create, edit, version, publish, clone, and assign formal examinations.
- Manage invitations and announcements.
- Review exam analytics, candidate attendance, live sessions, and permanent audit trails.
- Pause, resume, or terminate an active candidate session with an auditable reason.
- Access administrative data only through authenticated, role-protected endpoints.

## 3. Practice and mock-paper requirements

1. Paper creation is subject-first: students select subjects before creating a paper.
2. Multiple subjects may be selected in one paper.
3. Topic selection is optional and independent per subject. For each selected subject, leaving all topics unchecked includes every topic in that subject; selecting one or more topics restricts only that subject. Subjects without a topic restriction remain unrestricted.
4. Support all-topic, include-selected-topic, and exclude-selected-topic modes where available.
5. Support configurable question count (1–200) and difficulty selection (any, easy, medium, hard). Distribute the requested count as evenly as possible across selected subjects, then report subject-level shortfalls.
6. Subject quotas must be explicit and validated; the AP ECET blueprint may be offered as a preset, not as a hard-coded restriction on custom papers.
7. If a subject/topic/difficulty pool cannot satisfy its requested quota, use the available questions and show a warning naming the affected subject and requested/available counts.
8. Switching application tabs must change the visible workspace. An in-progress practice session may remain in memory when navigating away and should reappear when returning to Practice; navigation must not silently force the test view over every other tab. Practice attempts must restore after a page reload, including locally backed-up answer selections.
9. Practice scoring and progress updates must be calculated by the server and persisted per user.
10. A submitted practice attempt must not be scored twice.

## 4. Question-bank requirements

- Support subjects, topics, question text, four options, correct answer, explanation, source, and difficulty.
- Provide create, edit, delete, search, subject filtering, bulk selection, bulk difficulty update, and bulk delete.
- Support CSV and JSON import. Excel import may be converted client-side to the supported import format.
- Always provide a preview/preflight step before importing.
- Report valid rows, duplicates, invalid rows, and row-level reasons.
- Reject malformed questions and prevent normalized duplicate question text at the database layer.
- Editing shared bank questions must not mutate already-published examination snapshots.

## 5. Formal examination lifecycle

1. Administrator creates a draft examination and selects questions from the question bank.
2. Administrator configures instructions, duration, marks, negative marks, question shuffling, and option shuffling.
3. Publishing creates an immutable version. Editing a published examination creates a new version; existing assignments retain their original snapshot.
4. Administrator assigns a published version to one or more students and may configure availability and due dates.
5. Student sees upcoming, available, submitted, or expired assignments with clear status and dates.
6. Starting an assigned examination must create or resume a server-owned session before the candidate enters the exam.
7. The server's recorded session start and deadline are authoritative. Browser clock values are informational only and must never extend an exam.
8. The candidate client sends a heartbeat every 15 seconds and reports focus loss, focus restoration, and reconnection events.
9. The client must reflect invigilator pause/resume state. A paused session must hold the candidate timer; the server remains authoritative for expiry.
10. Submission is accepted only for an active, valid session, is idempotent for retries using the same attempt identifier, and is graded on the server.
11. Suspicious timing/connectivity signals may mark a submission for review; they must not silently alter the candidate's answers or score.
12. Candidate-facing errors must explain what action is possible next (wait for invigilator, reconnect, or contact administrator).

## 6. Invigilation, attendance, and audit

- Live invigilation view lists active and paused sessions and distinguishes connected from stale candidates.
- Live status refreshes periodically without requiring a full page reload.
- Show candidate, exam/version, session state, last heartbeat, heartbeat count, focus-loss count, and reconnection count.
- Provide administrator pause, resume, and terminate actions with confirmation.
- Attendance register covers all assignments, including candidates who have not started.
- Permanent audit history records candidate and invigilator events, actor identity, timestamps, and event details.
- Audit history is read-only from the UI; records must not be silently overwritten or removed.
- A stale heartbeat is a connectivity signal, not proof of misconduct.

## 7. Announcements and student communication

- Administrators can publish a title and message with an optional expiry date/time.
- Expired announcements must not appear as active student notices.
- Each student sees a new announcement popup until they explicitly mark it as seen.
- Once acknowledged, the same announcement must not pop up again for that student.
- Students can open an announcements page to review notices and their seen/unread state.
- Announcement expiry and acknowledgement are separate states.

## 8. Results and analytics

- Student results show score, maximum score, subject breakdown, and question-level review with explanations.
- Administrative analytics distinguish assignments, submissions, graded results, and review-required submissions.
- Provide exam-level submission rates and average percentages where valid scores exist.
- Attendance and audit views supplement aggregate analytics; they must not be represented as interchangeable metrics.
- Empty and insufficient-data states must be explicit rather than displaying misleading zeroes.

## 9. UX and visual design requirements

- Use one consistent design system across student and admin workspaces: spacing, typography, surfaces, borders, buttons, form controls, badges, tables, and empty states.
- Keep student navigation simple and task-oriented; keep admin navigation grouped around operations and content management.
- Make the current location and selected navigation item obvious.
- Use clear page headings, concise supporting descriptions, and meaningful hierarchy.
- Forms need labels, inline validation, disabled/loading states, and clear success/error feedback.
- Destructive actions require confirmation.
- Tables must remain usable on narrow screens through responsive layouts or horizontal scrolling.
- Support light and dark themes with readable contrast in both.
- Respect keyboard navigation, visible focus states, semantic headings, and reduced-motion preferences.
- Avoid decorative UI that obscures the exam task. During an exam, prioritize question readability, answer selection, remaining time, progress, and submit controls.

## 10. Architecture and engineering constraints

- Web: React + TypeScript + Vite.
- API: Node.js + TypeScript + Express.
- Persistence: Prisma + PostgreSQL. The `api/prisma-sqlite` directory is retained only for the one-time SQLite-to-PostgreSQL migration; it is not the active application persistence path.
- Validation: Zod at API boundaries.
- Keep route handling, business rules, and data access separated as the codebase is modularized.
- Enforce authentication and role authorization on the server; hiding UI controls is not authorization.
- Never expose stack traces, raw database errors, secrets, or correct answers before submission.
- Use transactions for operations that must be atomic.
- Use immutable exam snapshots to protect published content.
- Prefer additive migrations and preserve existing user data.
- Keep the application local-first and avoid adding runtime cloud dependencies without a product requirement.

## 11. Current implementation notes and known technical debt

The current browser client is a single large `web/src/App.tsx` component with many unrelated state variables and conditional workspaces. This is a maintainability and regression risk. Refactor incrementally into feature components/hooks (auth, student dashboard, practice, assigned exam, question bank, exam authoring, invigilation, attendance, announcements) without changing behavior in one large rewrite.

The README and some historical phase notes have described an older Next.js UI. The active browser entry point is Vite (`web/src/main.tsx`, `web/vite.config.ts`) and must be documented as React + Vite.

The formal-exam session endpoints exist in the API. The browser client must use the server session start, heartbeat, and session deadline; client-generated timestamps are not authoritative. Practice-attempt recovery now uses the existing server restore endpoint plus a local browser answer backup. Assigned-exam answers use revisioned server autosave plus a synchronous local browser backup; recovery merges both and gives the local backup precedence because it may contain a selection made after the last debounced server save. This flow still requires end-to-end verification under reloads, offline periods, and concurrent submission.

Do not mark a feature complete solely because an endpoint or dashboard card exists. Verify the complete student/admin workflow and its failure states.

## 12. Verification checklist

Run from the repository root:

```bash
npm install
npm run test
npm run lint
npm run build
npm run format:check
```

Also verify manually:
- Student navigation while a practice attempt is active.
- Subject-first multi-subject practice with optional topic filters and named shortfall warnings.
- Exam authoring, version publishing, assignment, availability, candidate start, heartbeat, pause/resume, reconnect, submission, and result review.
- Candidate attendance and audit events, including a student who never starts.
- Announcement expiry and per-student acknowledgement.
- Light/dark theme, keyboard focus, phone-width layout, loading/error/empty states.

A verification result must state which commands were actually run. Never report tests or builds as passing unless they were executed against the commit being described.

## 13. Prioritized improvement roadmap

### P0 — Workflow correctness and trust
- Keep server session timing and invigilation connected to the real candidate UI.
- Ensure candidate navigation, timer, pause/resume, reconnect, and submission states are coherent.
- Cover these flows with API and UI tests.

### P1 — Admin operational experience
- Live invigilation, attendance register, audit timeline, and clear session actions.
- Reliable refresh/loading/error states and filters for larger candidate lists.
- Better exam-level analytics and review-required workflows.

### P2 — Student experience
- Clear dashboard summaries and upcoming assignments.
- Faster subject/topic discovery and configurable practice paper builder.
- Question palette, answer review, and accessible exam-taking layouts.

### P3 — Maintainability and resilience
- Split the monolithic app into feature-level components and hooks.
- Add route-level error boundaries and reusable loading/empty/error states.
- Add exam-session recovery and answer persistence where supported by the server contract.
- Keep README, migrations, tests, and this document synchronized with shipped behavior.

## 14. Scope discipline

This document describes the current product direction. A roadmap item is not a shipped feature. New functionality must preserve the offline-first AP ECET use case, existing student progress, published exam snapshots, and the documented role boundaries.
