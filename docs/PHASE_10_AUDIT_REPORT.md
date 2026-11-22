# Phase 10 — Audit report (in progress)

Audit date: 2026-11-22

## Scope and status

This is a code and repository-state audit, not a claim that every production or physical-device condition has been verified. Phase 10 remains **IN PROGRESS** until Phase 9 is merged, exact-head Android artifact verification finishes, required hosted checks are run against the deployment, and the remaining manual acceptance items are completed or explicitly accepted as NOT VERIFIED.

## Phase status checked

- Phases 0–5: reported complete on main in the roadmap.
- Phase 6: PR #167 is merged. Offline/reconnect and device/account-isolation checks still require manual verification.
- Phase 7: PR #170 is merged. Keyboard/screen-reader and real-account lesson publishing checks remain manual.
- Phase 8: PRs #171–#174 are merged. Approved-bank readiness and physical-device verification remain NOT VERIFIED.
- Phase 9: PR #175 is open, not merged. Exact-head CI run #44967911502 passed all five jobs on commit `3bd15ab2a03101bb28fcb196b84a2f03186d4d16`. Exact-head Android Build run #44967911493 also passed and produced artifact `arctester-android-apk` (33,626,410 bytes; SHA-256 `21013f6276a117beff4588c9140dbb9832cecec62c790a710ce4fada4a79dd2d`). Hosted deployment smoke and physical-device checks remain NOT VERIFIED.
- Phase 10: audit/remediation underway; not complete.

## Lesson-generation cost and content audit

### Confirmed behavior

1. Students read published lesson script and storyboard JSON stored in `LessonDraft`; the student feed does not call `generateLessonContent`.
2. Admin AI generation is explicitly triggered by `POST /admin/lesson-drafts/generate` and makes two NVIDIA chat-completion requests: one for the script and one for the storyboard.
3. Student narration calls server-side TTS on demand. `api/src/lessonTts.ts` currently has only an in-process 20 MB LRU-like cache with a 30-minute TTL. Render restarts, cache eviction, and separate instances can cause repeated TTS provider requests.
4. Lesson Studio previously accepted source files for AI generation, but did not have a direct import path for a completed script + storyboard package.

### Audit remediation in this branch

- Add admin-only `POST /admin/lesson-drafts/import`.
- Validate imported metadata, script, and storyboard with existing strict Zod schemas.
- Save the imported package as a DRAFT with provider metadata `admin-upload/static-json-v1`; no NVIDIA lesson-generation call.
- Add a dedicated Lesson Studio JSON package import control (256 KB limit), keeping source-note upload and optional AI draft generation separate.
- Add backend and frontend tests plus a documented package format.

### Remaining lesson-system findings

- Published lesson feed currently returns up to 100 full script/storyboard objects at once. Consider a lightweight library-summary endpoint plus a per-lesson detail endpoint to reduce initial payload and improve low-end mobile performance.
- TTS cache is not durable. Evaluate object storage or a persistent database-backed audio asset record with an admin-controlled generation step. Do not store large audio blobs on Render's ephemeral filesystem.
- Student narration should remain optional; static text lessons work without TTS credentials.

## Release and manual verification checklist

- [x] Exact-head Phase 9 CI and Android APK artifact passed (#44967911502, #44967911493).
- [ ] Merge Phase 9 PR #175; hosted smoke and physical-device acceptance are still pending.
- [ ] Configure `ARCTESTER_WEB_URL` and `ARCTESTER_API_URL` repository Actions variables; run hosted smoke against the actual deployment.
- [ ] Install the generated APK on a real Android device; verify launch, lesson flow, offline/reconnect, and low-end responsiveness.
- [ ] Perform TalkBack/screen-reader and keyboard-only checks.
- [ ] Verify admin static JSON import, validation errors, draft editing, publish confirmation, and student visibility with real accounts.
- [ ] Verify lesson text remains available when NVIDIA lesson generation and TTS are unconfigured.
- [x] Phase 10 PR #176 exact-head CI run #44969090631 passed all five jobs on commit `1e74e20c9f44c62ad56887ca4654c1dea6324a22`.
- [x] Phase 10 exact-head Android build run #44969090601 passed and produced `arctester-android-apk` (33,626,409 bytes; SHA-256 `b1084a09bd67a75ba9e3fbe4da26a40a65401ecbce1d43be06e3d27d07a703bf`).

## Decision

Static lesson content is already persisted in PostgreSQL; it should not be moved to Render's local filesystem. The new direct JSON import provides a zero-AI-cost authoring path for prewritten content. AI lesson writing remains an optional admin authoring tool, and narration is a separate optional TTS feature.
