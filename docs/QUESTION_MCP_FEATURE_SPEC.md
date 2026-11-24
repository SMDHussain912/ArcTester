# ArcTester Question MCP — Feature Specification

**Status:** Implementation specification  
**Target:** ArcTester API + admin web + standalone remote MCP service  
**Parent architecture:** `docs/ARCTESTER_SHARED_AI_MCP_PLAN.md`

## Objective

Allow ChatGPT, Claude, and other authorized MCP clients to create and upload ArcTester question drafts directly to the existing API. Every submission must be visible in the admin Question Bank / review queue and remain unpublished until a human admin approves it.

This is a question-content capability, not permission to access student accounts, exam attempts, production secrets, or arbitrary server operations.

## User experience

### Admin: MCP access
Add an admin-only **MCP Access** area with:
- MCP endpoint URL and client setup instructions.
- Named API keys with creation date, key ID/prefix, scopes, enabled/revoked state, last-used time, and expiry.
- Create, revoke, and rotate actions.
- Copy the generated secret once at creation/rotation. Never retrieve or show the full secret again.
- Clear status if a key has expired, been revoked, or exceeded its usage limit.

### Admin: MCP activity
Show a searchable, paginated audit table with:
- timestamp, key label/key ID, client name, tool/action, request/correlation ID;
- submitted batch ID and created question IDs/count;
- success/failure, validation summary, duration, and safe error details;
- filters by date, key, action, status, subject/topic and batch.

Logs must redact authorization headers, raw API keys, passwords, connection strings, R2 credentials, student PII and full request bodies. Question text may be shown only in the question-management view, not copied into operational logs by default.

### AI client workflow
1. Admin creates a scoped key and configures it in the MCP client as a secret.
2. AI calls validation before upload, or uploads a batch and receives per-row validation results.
3. Valid questions are stored as `DRAFT` and grouped under an MCP import batch.
4. Admin opens the batch in the Question Bank, filters by subject/topic, edits, approves/rejects, or bulk-approves selected items.
5. Only approved questions become available to student/exam selection.

## MCP tools (initial write MVP)

- `arctester_validate_questions`: validate one or many questions without writing.
- `arctester_create_question`: create one draft question.
- `arctester_create_question_batch`: create a batch of drafts from structured JSON.
- `arctester_upload_question_csv`: upload supported ArcTester question CSV; return row-level validation and import status.
- `arctester_get_import_batch`: retrieve status and created IDs for a batch owned by the authenticated key.
- `arctester_list_import_batches`: list the authenticated key's recent batches.
- `arctester_get_mcp_activity`: read only redacted activity records permitted to that key/admin.

Do not expose approve, publish, delete, or student-facing exam assignment tools to the MCP writer role in the MVP. Human approval stays in the admin panel.

## Service architecture

- Standalone TypeScript/Node remote MCP service, deployed as a separate Render web service with HTTPS and Streamable HTTP transport.
- MCP service authenticates each request using an ArcTester-issued key and calls the existing ArcTester API through a private server-to-server route.
- Reuse the existing question schema, subject/topic mapping, duplicate hash, import service, review status, and DB. Do not introduce a second question database or bypass the existing import pipeline.
- Admin key and log endpoints live in the existing API; the MCP adapter should be thin and share the same validated service layer.
- Add a dedicated MCP batch/import entity to associate source key, request id, counts, status and question IDs. Keep key ownership and audit records relationally enforced.
- Use idempotency keys for writes so client retries do not create duplicate questions.

## API key handling

- Generate high-entropy random secrets (minimum 256 bits); display the full secret only once.
- Persist only a strong one-way hash (e.g. SHA-256 of a sufficiently random secret, with a key identifier/prefix for lookup); never persist plaintext.
- Store the hash and key metadata in PostgreSQL. Use constant-time hash comparison where applicable.
- Scopes are least-privilege and explicit: `questions:validate`, `questions:create`, `questions:batch`, `imports:read`, `activity:read`.
- Revoke/rotate immediately; enforce expiry, rate limits, batch size and request-size limits.
- The MCP service's internal API credential belongs in Render environment secrets, not in source code, admin frontend bundles, logs or tool outputs.
- Never return secret values from list/detail/log endpoints. Admin may see key name, ID/prefix, scopes, status, timestamps and last-used time only.

## Data and validation rules

- Reuse `QuestionInputSchema`, `importFromJson`, `importFromCsv`, and existing import services.
- Validate subject and topic against ArcTester canonical records.
- Validate question type, options/answer shape, correct answer, explanation, difficulty, source and required fields.
- Detect exact/normalized duplicates using the existing question hash and report duplicates instead of silently duplicating.
- Default every MCP-created question to `DRAFT`; do not accept client-supplied `APPROVED` status.
- Return safe row-level errors with row index, field, code and message.
- Support preview/validate first, then submit with a batch id and idempotency key.

## Required tests

- Key creation returns secret once; list/detail cannot recover it.
- Correct key works; malformed, expired, revoked and wrong-scope keys are denied.
- Key rotation/revocation invalidates the old credential.
- Raw secrets and sensitive headers never appear in logs or error responses.
- Validation rejects malformed question types/options/answer data and invalid subject/topic.
- Duplicate and idempotent retry behavior is deterministic.
- MCP imports always create drafts and never bypass admin approval.
- Batch ownership prevents one key/client from reading another key's private batch details.
- Admin logs are paginated, filtered, access-controlled and redacted.

## Delivery order

1. Audit existing question import routes/services and admin navigation; identify reusable code.
2. Add Prisma models + migration for MCP keys, import batches and audit events.
3. Add admin-only key management and activity-log APIs/UI.
4. Add internal authenticated batch-import API using existing validation/import pipeline.
5. Implement and test remote MCP server/tools.
6. Add setup documentation and Render service configuration (no secret values committed).
7. Run full CI, review the PR, then deploy the API and MCP service in controlled order.

## Acceptance criteria

- An authorized MCP client can validate and submit a single or batch of questions directly to ArcTester.
- Every accepted question appears as a draft in admin and requires human approval.
- Admin can create, inspect metadata, revoke and rotate keys.
- Admin can view filtered activity logs and safe validation details.
- No API key secret can be retrieved after one-time display; secrets are absent from logs.
- CI passes and both ChatGPT/Claude-compatible connection instructions are documented.
