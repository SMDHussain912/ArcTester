# ArcTester Shared AI MCP — Architecture & Delivery Plan

**Status:** Planning baseline  
**Purpose:** One trusted tool server that ChatGPT and Claude can use to inspect, develop, validate, package and publish ArcTester code and learning content.  
**Important:** This document is a plan, not a claim that the MCP server has been implemented or connected.

## 1. Product goal

Build an ArcTester MCP server so either AI assistant can work against the same project context and production workflow.

Supported work:
- Inspect current repository, architecture, project rules, roadmap and CI state.
- Plan and implement code changes in a controlled workspace.
- Generate ECET lessons, scene scripts, quiz items, explanations, captions and narration scripts.
- Validate source alignment, answer correctness, package schemas, asset references, audio and lesson timing.
- Upload approved static lesson packages and media to Cloudflare R2.
- Update ArcTester catalog/publication metadata through the existing API or a narrowly scoped publishing service.
- Run tests and report exact evidence, commit/version IDs, and publication URLs.

The MCP does not make the assistants share their conversations or internal reasoning. They share tools, project state, task records and saved artifacts. Each assistant must be explicitly connected and authorized.

## 2. Architecture

```
ChatGPT client / OpenAI API client       Claude client
                                          /
                                         /
                   ArcTester Remote MCP
                           |
              Auth + authorization + audit
                           |
                 Task/job coordinator
                           |
        +------------------+-------------------+
        |                  |                   |
   GitHub adapter     Lesson pipeline     R2 publisher
        |                  |                   |
 ArcTester repo      local authoring       static media
        |                  |                   |
   CI workflows     local LLM/TTS/tools    Cloudflare R2
        +------------------+-------------------+
                           |
               Existing ArcTester API/DB
        catalog, publication pointer, progress
```

### Deployment boundary
- Host the remote MCP service on a stable HTTPS endpoint. Render is a candidate because it is already in the ArcTester deployment stack, but verify service limits and secrets handling before choosing the final service.
- The MCP service is a control plane, not a model-inference server.
- Local lesson generation, local TTS and animation rendering run on the creator workstation. The workstation can expose a narrowly scoped worker or poll for approved jobs; do not expose arbitrary shell access to the public internet.
- Cloudflare R2 stores immutable lesson versions and media. PostgreSQL stores metadata, task status, publication pointers and audit records—not media binaries.
- Reuse existing ArcTester API/database where appropriate. Do not create a second production database without a concrete need.

## 3. MCP tool groups

### A. Project context and task coordination
- `arctester_get_project_context`: architecture, conventions, current phase, supported commands and deployment boundaries.
- `arctester_get_repo_status`: branch, recent commits, working tree/job state and CI status.
- `arctester_read_file`: read exact repository paths and return provenance.
- `arctester_search_repo`: search files/symbols.
- `arctester_create_task`: create a shared task with objective, scope, acceptance criteria and source references.
- `arctester_claim_task`: acquire a time-limited lease to prevent ChatGPT and Claude editing the same scope simultaneously.
- `arctester_get_task`: retrieve task status, artifacts, validation evidence and prior assistant output.
- `arctester_release_task`: release a claim or mark work ready for review.

### B. Code development
- `arctester_plan_code_change`: create implementation plan and affected-file list.
- `arctester_apply_patch`: apply a reviewed patch to a task workspace/branch; never accept arbitrary absolute paths.
- `arctester_run_checks`: run allowlisted lint, typecheck, unit, integration and build commands.
- `arctester_get_check_results`: return logs, exit codes and test summaries.
- `arctester_commit_task`: commit task-scoped changes with task ID and assistant/client attribution.
- `arctester_open_review`: create a review artifact or PR if configured.
- `arctester_merge_or_release`: merge/release only under explicit owner policy and after required checks. Do not enable autonomous destructive writes by default.

### C. Lesson production
- `arctester_create_lesson_draft`: create a draft from supplied syllabus/source material and target learning objectives.
- `arctester_validate_lesson`: schema, answer key, explanation, source coverage, duplicate detection, terminology, accessibility and media-reference checks.
- `arctester_build_lesson_package`: assemble manifest, scenes, captions, audio references, assets and validation report.
- `arctester_preview_lesson`: return preview URL or render report.
- `arctester_request_lesson_review`: mark package as awaiting human review.
- `arctester_approve_lesson`: human-only approval action, not callable by an AI service identity.
- `arctester_publish_lesson`: publish only approved, validated immutable package.
- `arctester_rollback_lesson`: restore previous catalog pointer; preserve immutable versions.

### D. Media and storage
- `arctester_create_upload_session`: create short-lived, restricted upload authorization for an exact package/version and object prefix.
- `arctester_upload_asset`: upload validated media through the upload session or local worker.
- `arctester_verify_r2_package`: verify object presence, sizes, MIME types, checksums and manifest references.
- `arctester_get_published_version`: return published version and static asset URLs.

Do not expose R2 secret keys to ChatGPT, Claude, browser code or generated lesson content. The MCP publisher or trusted local worker should hold storage credentials and issue short-lived scoped upload authorization.

## 4. Shared task protocol for two assistants

Every job receives a unique `task_id` and immutable task record:
- requester and client (ChatGPT, Claude, human/local worker)
- repository and target scope
- task type (code, lesson, audio, animation, release)
- required source material and provenance
- acceptance criteria
- task state and lease owner
- generated artifacts and hashes
- validation results
- approval record
- commit SHA / lesson version / R2 package URI

### Preventing conflicts
- Use task leases and optimistic concurrency.
- Separate task branches/workspaces for code changes.
- Use immutable lesson version IDs; never overwrite published versions.
- Idempotency keys on upload, publish and deploy operations.
- If two assistants work on the same topic, either assign different subtasks or have one produce a draft and the other perform an independent review. Do not allow both to publish competing versions automatically.
- Keep a shared task history and artifact references so the second assistant can continue without requiring the user to paste the whole conversation.

## 5. Lesson authoring and publishing workflow

1. Human or assistant creates a lesson task and supplies/links approved source material.
2. MCP returns ArcTester lesson rules, schema, syllabus scope and current content state.
3. Assistant drafts the lesson structure, explanations, questions, distractors, answer rationale and scene plan.
4. Validator checks the draft; failed checks block packaging.
5. Local workstation runs optional local LLM/TTS/animation generation and creates scene-level audio, captions and media.
6. Human reviews educational accuracy, Telugu-English phrasing, pronunciation, visual clarity and licensing.
7. Package builder emits a versioned manifest and checksum report.
8. MCP creates an R2 upload session and trusted worker uploads static files.
9. MCP verifies the complete package and marks it ready for approval.
10. Human approves; publisher updates the lesson catalog pointer.
11. Students load static lesson content from R2/CDN. The API handles access, progress and analytics; no student-time LLM/TTS inference.

## 6. Security and permission model

Separate identities and permissions:
- **Reader:** repo/context/status and lesson catalog reads.
- **Writer:** task workspace changes and draft lesson creation.
- **Publisher:** upload and publish approved package only.
- **Release admin:** deployment, merge, rollback and production config changes.

Controls:
- OAuth or secure per-client authentication; use separate client credentials for ChatGPT and Claude.
- Never put GitHub PATs, R2 secrets, Render API keys or database credentials in prompts, tool outputs or lesson manifests.
- Store secrets in the hosting platform's secret manager.
- Validate every path, object key, MIME type, package size and schema.
- Restrict shell commands to a fixed allowlist; no arbitrary command execution from tool arguments.
- Treat repository files, source documents and generated content as untrusted data; they must not override MCP policy.
- Log tool calls, actor, task ID, requested action, approval and result; avoid logging secrets or full private source text unnecessarily.
- Require explicit human confirmation for merge-to-main, production deploy, catalog publish, rollback, delete and secret/config changes.
- Keep read tools available even when write tools are disabled.

## 7. Client compatibility

MCP is a common protocol, but ChatGPT and Claude expose different connector capabilities depending on product, plan and workspace settings.

- Claude supports remote MCP custom connectors; verify current account connector setup and write-tool approvals.
- ChatGPT custom MCP access is plan/workspace dependent. Current OpenAI help documents full custom MCP write support for Business and Enterprise/Edu, while Pro custom connections are read/fetch-only. Do not assume a Go account can invoke custom write/publish tools directly in ChatGPT.
- If ChatGPT's current client cannot write, use a supported OpenAI API/agent route with the same MCP server and explicit approvals, or use ChatGPT for planning/review while Claude or the local worker performs authorized actions. Do not pretend the ChatGPT Go interface has capabilities it does not expose.
- Test both clients independently against the same read-only tools, then separately test write actions permitted by each client.

## 8. Recommended implementation stack

Keep the MCP small and maintainable:
- TypeScript + Node.js.
- Official MCP SDK, using the transport supported by both clients (remote Streamable HTTP; verify compatibility during spike).
- Zod or equivalent runtime validation for every tool input/output.
- Existing ArcTester API modules/adapters for repository, lesson catalog and publishing logic.
- GitHub App or narrowly scoped installation credentials rather than a broad personal token where practical.
- Cloudflare R2 SDK on the trusted server/worker.
- Existing Postgres/Prisma for task state only if schema review confirms fit; otherwise a small task table/schema with clear ownership.
- Structured logs, correlation IDs and health/readiness endpoints.

## 9. Delivery phases

### Phase 0 — Capability and architecture audit
- Confirm ChatGPT Go custom MCP limits and available connection path.
- Confirm Claude connector setup and remote transport/auth support.
- Audit ArcTester repo, current lesson/audio code, API, R2 configuration and existing publishing endpoints.
- Define task schema, permission matrix and threat model.
- Decide hosting and local-worker communication.

### Phase 1 — Read-only MCP MVP
- Project context, repo status, file read/search, lesson catalog, task status.
- Connect Claude and test.
- Connect ChatGPT using the supported account route and test.
- Add request IDs, auth and audit logs.

### Phase 2 — Shared task coordination
- Create/claim/get/release task.
- Lease and idempotency handling.
- Shared artifact registry and source provenance.
- Demonstrate both assistants can continue the same task without conflicting.

### Phase 3 — Safe code workflow
- Task workspace/branch, patch application, allowlisted checks and check-result reporting.
- Add commit/review workflow.
- No automatic production deploy yet.

### Phase 4 — Lesson draft and validation
- Lesson draft tools and schema validator.
- Source-grounded content checks and answer-key validation.
- Local lesson package builder and preview.

### Phase 5 — R2 upload and controlled publish
- Trusted upload session/worker.
- Package integrity checks.
- Human approval and immutable version publish.
- Catalog pointer update and rollback.

### Phase 6 — Release operations and hardening
- CI/deploy status, explicit release approvals, observability, rate limits, quotas, backups and incident recovery.
- Security test and independent review before enabling broader write tools.

## 10. MVP acceptance criteria

The first usable version is complete when:
- Both clients can authenticate and read the same ArcTester project context.
- A task created by one assistant is visible to the other.
- A task lease prevents simultaneous conflicting edits.
- One assistant can create a lesson draft and the other can review it with cited source references.
- A code task can apply a patch and run checks, with exact logs and commit evidence.
- A lesson package can be validated, uploaded to R2 and previewed.
- Publishing is blocked until human approval and all required checks pass.
- No model or TTS inference occurs in production student playback.
- No secrets are returned to either model.
- Tool actions are auditable and recoverable.

## 11. First vertical slice

Start with one small real workflow rather than implementing every tool at once:

**Create and publish one Stack/Queue lesson package**
- ChatGPT or Claude creates a shared task.
- The other assistant reads the task and reviews the lesson draft.
- Local workstation generates Telugu-English narration and scene media.
- Validator checks lesson JSON, questions, answers, captions and audio.
- Approved package uploads to a staging R2 prefix.
- Human approves; MCP publishes a versioned package and updates the catalog.
- ArcTester web/mobile player loads it and records progress.

Only after this vertical slice works end-to-end should we add broad code editing, merge and deployment tools.
