# Phase 10 — Audit report (in progress)

Audit date: 2026-11-23

## Scope and status

This is a repository/code audit. It does not claim production deployment health, physical-device acceptance, or accessibility verification that has not been performed.

- Phase 9 PR #175 is merged (merge commit `c45c2c21b85f82054fe728197eb1fa4fb7288383`).
- Phase 10 PR #176 is merged (merge commit `e13e5d4246fccaf1e811447424111fc4bd171ef3`).
- Phase 9 exact-head CI #44967911502 and Android build #44967911493 passed; the APK checksum is recorded in the Phase 9 release report.
- Phase 10 exact-head CI #44969600169 and Android build #44969600269 passed.
- Audit-fix code commit `c28d21d7889df73d88f938a28b358fa3511c7215` passed all five CI jobs in run #45070131635: 64 web test files / 220 tests, 59 API test files / 316 tests, lint/build, Playwright E2E, mobile typecheck, PostgreSQL backup/restore, and SQLite migration utility checks.
- Hosted deployment smoke and physical-device checks remain NOT VERIFIED.

## Lesson content and cost audit

### Confirmed current behavior

1. Published lesson script and storyboard content is stored in PostgreSQL `LessonDraft`; student lesson-open requests read saved content rather than invoking a lesson-writing model.
2. The current admin authoring path is local static-package generation followed by authenticated JSON import. There is no `POST /admin/lesson-drafts/generate` API route.
3. Student narration is pre-prepared audio. Admin upload stores scene audio in a private Supabase Storage bucket and records metadata/hash/size in `LessonAudioAsset`; the authenticated student route verifies the narration hash and proxies the stored bytes. No student-time TTS synthesis is wired into the current lesson routes.
4. The legacy `api/src/lessonTts.ts` helper and tests remain in the repository, but the current lesson router does not call that helper.
5. Lesson Studio imports a completed JSON package, opens drafts, supports review/edit/preview, and requires explicit publish confirmation. It does not call a hosted model provider.

### Bugs found and fixed during this audit

- **Prisma P1012:** removed an invalid `Invitation.audioAssets` relation; retained the valid `LessonDraft.audioAssets` relation. Prisma generation and clean PostgreSQL migrations passed afterward.
- **Audio upload body parsing:** the audio-upload path had been skipped by the global JSON parser, leaving `req.body` undefined. It now uses an 18 MiB parser, with a regression test for a request larger than the default 1 MiB limit.
- **Study-material filenames:** an over-escaped CR/LF sanitizer removed ordinary `n` and `r` characters (for example, `notes.pdf` became `otes.pdf`). Both filename sanitizers were corrected and a download-header regression assertion was added.
- **Offline package type:** the frontend type incorrectly described `subjects` as objects and omitted the returned `questions` payload, leading to explicit `any`. The type now matches the API response and a package-download regression test verifies the question payload is preserved.
- **Broken Lesson Studio generation control:** the UI called a nonexistent server route and its test mocked that missing route. The dead remote-generation UI/handler was removed; admins use local static generation and import the package.
- **Test-only Blob compatibility:** the download test now reads the generated Blob with `FileReader`, supported by the CI jsdom environment.

## Remaining findings and release gates

- **Hosted smoke configuration:** hosted smoke run #45017484276 failed because the required repository Actions URL variables were not configured. Set `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL`, then rerun the hosted smoke workflow against the current deployment. The failure is configuration-related; it is not a successful health check.
- **Lesson feed payload:** the published lesson feed can return up to 100 full script/storyboard objects. The animation-engine phase should use a lightweight library summary and fetch a single immutable lesson package on demand.
- **Audio authoring UI:** the API supports admin scene-audio upload, but the current Lesson Studio does not yet provide a complete per-scene audio authoring/upload/review UI. Add this in the local animation/lesson authoring workflow.
- **Offline question bank:** the current downloadable practice package contains prompts/options but no answer key or explanation. If self-grading offline is required, define a practice-only answer-key contract and keep published exam snapshots excluded.
- **Manual verification:** physical Android install/startup, low-end-device cold start/memory/frame rate, TalkBack, keyboard/focus/contrast, and real-account lesson publish/student visibility are NOT VERIFIED.

## Manual acceptance checklist

- [ ] Configure `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL`; run hosted smoke successfully against the actual deployment.
- [ ] Install the verified APK on a physical Android device; verify launch, sign-in, lesson/practice flow, offline/reconnect, and low-end responsiveness.
- [ ] Perform TalkBack/screen-reader, keyboard-only, focus traversal, and contrast checks on real flows.
- [ ] Verify admin JSON import, validation errors, draft editing, publish confirmation, and student visibility with real accounts.
- [ ] Decide whether offline practice needs answer keys/explanations and implement only after confirming the practice-only security boundary.

## Decision

The existing CI blockers have been repaired and the audit-fix code commit is green. The next implementation sequence is the animated static lesson engine (local authoring, versioned static packages, storage/playback, validation and review), followed by the shared ChatGPT/Claude MCP. Keep hosted checks and physical-device acceptance explicitly pending until verified.
