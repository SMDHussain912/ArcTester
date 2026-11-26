# Animation Engine — R2 package delivery milestone

**Status:** Design locked; implementation not yet deployed. This document defines the next vertical slice and its acceptance gates.

## Goal

Publish a reviewed static lesson as an immutable, versioned package in Cloudflare R2; serve lightweight library summaries; fetch one exact package version on demand; preserve legacy PostgreSQL-backed lessons during migration.

No student-time LLM/TTS inference. No R2 secret or direct privileged object-storage credential in web/mobile clients.

## Existing baseline (verified 2026-11-23)

- PostgreSQL `LessonDraft` stores script/storyboard JSON and current DRAFT/PUBLISHED status.
- `POST /admin/lesson-drafts/import` imports locally authored JSON as DRAFT.
- Admin can edit, review and publish drafts.
- Per-scene audio upload exists at `POST /admin/lesson-drafts/:id/scenes/:sceneIndex/audio`.
- Audio currently resides in private Supabase Storage; `LessonAudioAsset` stores metadata, byte size, narration hash and storage path.
- Student route proxies verified audio from Supabase.
- `GET /lessons` currently parses and returns full script/storyboard for up to 100 records.
- Timeline runtime/validation has landed in web/mobile/API. Legacy scenes remain compatible.
- R2 package publishing, immutable version metadata, student package fetching, a complete audio authoring UI and rollback are not implemented.
- Do not remove Supabase audio support until migration and compatibility tests prove safe.

## Architecture decisions

1. Keep PostgreSQL as catalog, authorization, version metadata, progress and publication-pointer store.
2. Cloudflare R2 holds immutable package files and finalized media. R2 is private; student delivery uses the authenticated API as a proxy initially. A later signed-URL/CDN optimization requires explicit threat-model review.
3. Use S3-compatible API operations via an R2 SDK adapter on the API server. Store endpoint, bucket, access key and secret only in server environment variables.
4. Keep old `LessonDraft` rows and Supabase audio readable. Mark their source as legacy until backfilled; do not rewrite them in place.
5. Publish by writing and verifying all immutable objects first, then transactionally creating a published version and moving the lesson's active-version pointer. Failed uploads leave no active pointer.
6. Rollback only changes the active version pointer to a previously verified immutable version. Never overwrite or delete published version objects as part of rollback.

## Package layout

```text
lessons/{lessonId}/versions/{versionId}/manifest.json
lessons/{lessonId}/versions/{versionId}/scenes/{sceneId}.json
lessons/{lessonId}/versions/{versionId}/audio/{sceneId}-{sha256}.mp3
lessons/{lessonId}/versions/{versionId}/assets/{assetId}-{sha256}.{ext}
```

All keys are generated server-side from validated identifiers and content hashes. Reject path traversal, arbitrary bucket names, arbitrary object keys and executable HTML/JS assets.

Manifest fields:
- `packageSchemaVersion`, `lessonId`, `versionId`, `createdAt`
- `title`, `subject`, `topic`, `locale`, `durationMs`
- ordered scene descriptors with stable `sceneId`, object key, byte size, SHA-256, MIME type
- asset descriptors with stable ID, object key, byte size, SHA-256, MIME type, dimensions/duration where relevant, alt text and license/source metadata
- narration/caption metadata and timeline references
- validation summary and authoring provenance (exclude private reviewer notes and source secrets)

The manifest is schema-versioned, bounded in size, and must not contain arbitrary URLs. The server resolves keys; clients never choose object keys.

## Version/catalog data model

Add explicit models after checking current relations and migration conventions:
- `LessonVersion`: id, lessonDraftId/lesson identity, monotonically increasing version number or immutable UUID, package schema version, manifest key/hash/size, status (UPLOADING, READY, FAILED, RETIRED), createdBy, createdAt, validation metadata.
- `LessonDraft.activeVersionId` (nullable during legacy transition) or a separate publication pointer table with a unique lesson identity.
- `LessonVersionAsset`: version relation, stable asset ID, role, key, MIME, byte size, SHA-256, scene ID/index, narration hash, optional duration/codec/locale.
- Unique constraints: (lesson, version number), (version, asset ID), one active version per lesson.
- Preserve legacy `LessonAudioAsset` and storage fields until migration/backfill complete.

Do not add duplicate source-of-truth fields. Keep publication pointer changes transactional and use conditional updates to prevent concurrent publish/rollback races.

## API contract

Student:
- `GET /lessons`: summary only — lesson ID, title, subject, topic, duration, locale, active version ID, schema version, thumbnail/cover metadata, updated/published time.
- `GET /lessons/:id/versions/:versionId/manifest`: authenticated student-only access; only READY versions that are currently published or explicitly retained as accessible.
- `GET /lessons/:id/versions/:versionId/objects/:assetId`: authenticated, version-scoped asset streaming with content type, length, cache and nosniff headers; verify object metadata/hash policy. Do not accept raw storage paths from clients.
- Student must never request an unpublished DRAFT or a version belonging to another lesson.

Admin:
- `POST /admin/lesson-drafts/:id/versions`: validate current reviewed draft snapshot, reserve a version and begin package publication.
- Use streaming/multipart or presigned R2 upload for large assets; do not base64-encode multi-megabyte media in JSON. For first vertical slice, API-proxied bounded streaming upload is acceptable if request limits are explicit.
- `POST /admin/lesson-drafts/:id/versions/:versionId/verify`: verify all expected objects, sizes and SHA-256 values and mark READY.
- `POST /admin/lesson-drafts/:id/versions/:versionId/publish`: atomically change active pointer only after READY and validation approval.
- `POST /admin/lesson-drafts/:id/rollback`: select a prior READY version; require explicit version ID and audit actor.
- Admin metadata must expose failed/incomplete assets and safe retry capability.

All routes require existing auth/admin middleware and strict Zod validation. No service credentials returned from API responses or logs.

## Authoring workflow

Local authoring workstation:
1. Create/edit lesson script and scene JSON.
2. Attach per-scene audio and captions.
3. Validate scene targets, cue ordering, duration bounds, audio format/duration, narration fingerprint, package schema, asset references and licenses.
4. Produce deterministic manifest and SHA-256 checksums.
5. Preview with same web/mobile timeline contracts.
6. Upload immutable version, verify all objects, then request publish.
7. Retain source package and validation report locally for reproducibility.

Admin Lesson Studio:
- Show draft and version history, per-scene narration status, voice/locale, duration, hash, upload progress, validation errors and preview.
- Allow replacing audio on DRAFT only; changing narration invalidates audio alignment/hash.
- Published version is read-only; edits create a new version.
- Show rollback target and confirmation with exact version.

## Compatibility and migration

- First release adds the version system alongside the existing legacy route.
- Student library uses summaries from both legacy published rows and new versioned lessons.
- When a lesson has an active version, fetch the R2 manifest/package; otherwise use the existing PostgreSQL lesson payload/audio path.
- Add idempotent backfill tooling that copies legacy content/audio to a version only after checking source hashes and object existence.
- Never switch a lesson's active pointer until every object verifies.
- Keep Supabase objects until backfill coverage and production access have been checked; cleanup is a separate explicit maintenance operation.

## Security and integrity

- R2 credentials server-only; least-privilege token scoped to one bucket.
- Private bucket, no public write, no unrestricted list endpoint.
- Validate MIME by file signatures and allowlist; enforce per-asset and total-package size caps.
- SHA-256 over exact stored bytes; validate length and checksum on upload and during verify.
- Use immutable keys containing version ID and content hash; reject overwrites.
- Do not store signed URLs as durable metadata.
- Prevent IDOR by checking lesson ownership/publication/version relationship after auth.
- Rate-limit admin upload/verify routes; bounded concurrency and upload timeouts.
- Treat package JSON as data; render allowlisted schema only, never HTML or JS from package.
- Exclude secrets/private source notes/reviewer notes from public manifest.
- Redact authorization headers and storage credentials from logs/errors.

## Test plan

Unit:
- manifest schema, deterministic serialization, key construction, MIME/signature, hashes, size caps, timeline compatibility, duplicate IDs, unsafe keys and schema migration.

Integration:
- upload/verify success; partial upload leaves no active pointer; retry is idempotent; checksum mismatch fails; failed storage operations do not publish; publish/rollback races; legacy Supabase and DB lessons still play; auth and IDOR rejection.

E2E:
- admin authors/imports lesson, uploads narration, validates, previews, publishes version 1; student sees only summary, fetches manifest/assets, plays/checkpoints and progress remains server-backed; author edits to version 2; rollback to version 1.

Operational:
- R2 unavailable, timeout, rate limit, corrupt object, missing object, stale cache, slow network, app background/resume, low storage and offline state.
- Physical Android performance/accessibility remain explicit release gates.

## Delivery slices

A. Schema + provider adapter + unit tests; no route behavior change.
B. Atomic immutable publisher + object verification + admin APIs.
C. Summary feed + versioned student manifest/asset delivery + legacy fallback.
D. Local package CLI and admin per-scene audio UI + preview/validation.
E. Version history, rollback, migration/backfill + end-to-end acceptance.

Do not combine all slices into one oversized commit. Each slice must pass exact-head CI before proceeding.

## Definition of done

One Stack/Queue lesson can be authored locally with at least 5 coherent scenes, narrated audio and captions; package validation catches invalid targets/timing/assets; publication writes an immutable version to R2, verifies checksums, and updates the catalog pointer atomically; student library loads only summaries; student opens and streams one exact published version; pause/seek/replay/checkpoints/progress work; rollback changes the pointer without overwriting objects; legacy lessons still work; CI is green; hosted and physical-device checks are accurately reported as verified or NOT VERIFIED.

## Explicit blocker

The repository connector confirms GitHub write access but no Cloudflare R2 connector or R2 credentials are available in this execution context. Implement the provider abstraction and tests without adding fake credentials or silently provisioning a substitute storage provider. Actual R2 integration/deployment requires configured server environment values and an R2 bucket.
