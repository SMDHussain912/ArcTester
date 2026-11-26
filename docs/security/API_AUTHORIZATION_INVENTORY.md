# API authorization inventory — Part 4

This inventory records the reviewed router mount points and server-side authorization boundaries. `api/tests/apiRouteAuthCoverage.test.ts` asserts authentication/admin/MCP-key middleware on all non-public route registrations; `api/tests/adminRouteGuards.test.ts` guards admin route registration. Ownership and audience tests are listed below.

## Router mount map

| Router | Main route families | Required boundary |
|---|---|---|
| authRouter | register, login, token, MFA, passkeys, sessions, devices | Public only for sign-in/bootstrap endpoints; authenticated self-service endpoints require session and current account status |
| sessionRouter | exam session, answer save/read, heartbeat, integrity | Authenticated student; assignment must belong to current student; admin audit/actions require admin |
| studentAuditRouter | student activity timeline/export, integrity verification | Admin-only |
| adminStudentRouter | student listing, approval, profile/account actions | Admin-only |
| examRouter | exam authoring/assignment/reports; student catalog/assigned package | Admin for administration; student package/results must be assignment-owned |
| questionRouter | official question bank and subject/topic administration | Admin-only |
| submissionRouter | official submissions/results/release | Admin for review/release; student submission/result must be assignment-owned |
| questionAdminRouter | review queue, bulk review, question edits/import, exam result/preview | Uses router-level `router.use("/admin", requireAuth, requireAdmin(db))` guard |
| announcementRouter | announcements and student notification preferences | Admin for create/list/delete; student preferences/read state must be current-user-owned |
| studyMaterialRouter | student material list/file; admin material CRUD/upload | Authenticated student; admin-only mutation; file access follows academic audience |
| conceptLibraryRouter | student concept library | Authenticated student; published/eligible content only |
| lessonGenerationRouter | student lessons/audio; admin draft/publish/import | Authenticated student; admin-only draft operations; lesson audience enforced |
| lessonCatalogRouter | lesson manifests/assets | Authenticated student; published and audience-eligible lesson version |
| lessonPackageAdminRouter | lesson package publish | Admin-only |
| learningPathRouter | student path/answers/completion; admin build | Authenticated student; path progress owned by current user; admin-only build |
| gamificationRouter / masteryRouter | goals, streaks, mastery, practice mistakes, badges | Authenticated student; all progress keyed to current user |
| studentMcpRouter | student key management and student MCP | Approved student; key owner + per-key scope; private resources scoped by key user ID |
| adminInstitutionRouter | institution administration | Admin-only |
| adminMcpRouter | admin key management and admin MCP/model tools | Approved current admin key; per-tool scope; current DB admin role and key revocation checked on each request |
| modelInferenceRouter | student model prediction | Authenticated student; model must be explicitly enabled; strict non-identifying feature schema |

## Confirmed controls/tests

- Admin routes use explicit `requireAuth` + `requireAdmin(db)` or a router-level admin guard; e.g. `questionAdminRouter` guards every `/admin` path with router middleware.
- Auth checks token signature/claims, session version, database session revocation, current email, and approved account status.
- Student MCP is bound to key owner and scopes; regression tests cover cross-student question access/edit, missing scope, role mismatch, and revoked key.
- Admin MCP re-checks key revocation and current admin role; regression tests cover missing scope, demotion, and revocation.
- Existing audience tests cover question and lesson college/branch/student eligibility.

## Remaining production verification

- [x] Review handler ownership predicates and role checks across student data routes; verify route middleware with static regression tests.
- [x] Existing regression tests cover exam/session/result ownership, analytics ownership, material file access, admin bulk actions, academic audience, and MCP cross-user access.
- [x] Confirm approved-account session auth precedes admin role checks; admin MCP additionally re-checks current DB role and key revocation.
- [ ] Configure and verify production proxy trust and exact CORS origins; rate limiting uses Express's resolved client IP.
- [ ] Confirm hosting-side operational log retention and residency independently of application audit retention.
