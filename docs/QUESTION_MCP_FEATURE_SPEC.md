# ArcTester Admin MCP — Feature Specification

**Status:** Implementation specification  
**Target:** ArcTester API + admin web + standalone remote MCP service  
**Parent architecture:** `docs/ARCTESTER_SHARED_AI_MCP_PLAN.md`

## Objective

Provide an authorized ChatGPT, Claude, or other MCP client with a configurable ArcTester admin-assistant capability. Depending on the scopes granted by an administrator, it can create/upload questions, review and approve questions, create question papers, assign papers to students/groups, and create/publish announcements. All actions must use existing ArcTester services and be visible in the admin panel and audit log.

This is not unrestricted database, infrastructure, or secret access. The MCP must not expose student passwords, session tokens, internal server credentials, or raw API key values.

## Admin experience

### MCP Access and keys
Admin-only page provides:
- Remote MCP endpoint and client setup instructions.
- Named keys with key ID/prefix, scopes, created/expiry/last-used timestamps and active/revoked state.
- Create, rotate, disable and revoke.
- Display a generated secret only once; never recover or display it again.
- Copy-once connection configuration and safe troubleshooting status.

### Activity and audit logs
Searchable, paginated logs show timestamp, key label/id, client, tool/action, request/correlation ID, target IDs, counts, result, validation summary, duration and safe error message. Filters include date, key, action, result, subject/topic, batch, paper, assignment and announcement.

Never log raw keys, Authorization headers, passwords, tokens, database/R2 credentials, student PII, or full request bodies. Log minimal identifiers and structured summaries. Admin-only detailed question content belongs in content review, not operational logs.

### Admin review queue
MCP-created questions and batches appear in the existing Question Bank/review queue. Admins can inspect/edit question text, options, correct answer, explanation, subject/topic, difficulty and duplicates; approve/reject individually or in bulk by selected rows, subject, topic, batch and filters. Approval is available to an MCP key only when it has the explicit `questions:approve` scope. Approved content follows the same validation and publication rules as admin UI actions.

## MCP tools

### Questions and imports
- `arctester_validate_questions`: validate one or many questions.
- `arctester_create_question`: create a question draft.
- `arctester_create_question_batch`: create batch drafts from structured JSON.
- `arctester_upload_question_csv`: upload supported question CSV with row-level validation.
- `arctester_get_import_batch` / `arctester_list_import_batches`: inspect import status and results.
- `arctester_review_question`: retrieve a question and review details.
- `arctester_update_question`: edit a question before or after review, subject to current workflow rules.
- `arctester_approve_questions`: approve one or many validated questions; explicit scope required.
- `arctester_reject_questions`: reject selected questions with reason; explicit scope required.
- `arctester_bulk_review_questions`: review/approve/reject selected questions using filters and a bounded selection; approval/rejection scopes required.

### Question papers and assignments
- `arctester_create_question_paper`: create a paper using approved questions and a specified blueprint/preset, subject/topic quotas, order, duration, marks and negative marks.
- `arctester_preview_question_paper`: validate blueprint, question count, coverage, duplicates, availability and scoring before creation.
- `arctester_update_question_paper`: edit a draft paper.
- `arctester_publish_question_paper`: publish a paper when `papers:publish` scope is granted.
- `arctester_assign_question_paper`: assign a published paper to a selected student, cohort/class or allowed group, with schedule/deadline settings and explicit `exams:assign` scope.
- `arctester_get_assignment_status`: inspect assignment counts and safe status.
- `arctester_unassign_question_paper`: revoke/cancel an assignment only when supported by existing business rules and explicit `exams:manage_assignments` scope.

Paper creation must use approved questions only, honor configured ECET preset/blueprint order, subject quotas, marks, negative marks and time. Never silently substitute questions when a quota cannot be met; return a preview with shortages and require a revised selection or explicit user instruction.

### Announcements
- `arctester_create_announcement`: create a draft announcement with title/body, audience, and optional schedule.
- `arctester_preview_announcement`: preview audience and content.
- `arctester_publish_announcement`: publish immediately or schedule when supported; requires `announcements:publish`.
- `arctester_update_announcement` / `arctester_archive_announcement`: manage announcements within granted scopes.

### Logs and status
- `arctester_get_mcp_activity`: retrieve redacted activity permitted to the caller.
- `arctester_get_operation_status`: inspect status of a long-running operation by request ID.

## Permission scopes

Use least-privilege, independently revocable scopes:
- `questions:validate`
- `questions:create`
- `questions:edit`
- `questions:approve`
- `questions:reject`
- `imports:read`
- `papers:create`
- `papers:edit`
- `papers:publish`
- `exams:assign`
- `exams:manage_assignments`
- `announcements:create`
- `announcements:edit`
- `announcements:publish`
- `activity:read`

Admin selects scopes when creating a key and can update/revoke them. A key with all requested scopes can complete the full workflow; limited keys must receive clear scope-denied errors. Never make broad admin access the default.

## Confirmation and safe execution

The MCP is allowed to perform the actions explicitly granted to its key. For irreversible or broad-impact actions, return a concise preview and require an explicit confirmation step in the MCP interaction before execution: bulk approval above configured threshold, assigning to an entire cohort, publishing an announcement to all students, or cancelling assignments. Support bounded selection, dry-run/preview, idempotency and operation status. Do not require confirmation for harmless validation or draft creation.

## Architecture

- Standalone TypeScript/Node remote MCP service on a separate Render web service with HTTPS and Streamable HTTP transport.
- Authenticate MCP requests with ArcTester-issued scoped keys; use a private authenticated server-to-server API route to the existing ArcTester backend.
- Reuse current question validation/import, approval, paper generation, assignment and announcement services. MCP must not bypass business rules or create a second database.
- Add relational records for MCP key metadata, import batches, operation records and audit events. Store question/paper/assignment/announcement identifiers and safe summaries.
- Use idempotency keys, request size limits, rate limits, pagination and ownership checks.

## API key handling

- Generate high-entropy random secrets (minimum 256 bits).
- Store only a one-way hash and lookup key ID/prefix; compare securely.
- Show secret once at creation/rotation; never return it in list/detail/log endpoints.
- Internal service credentials live only in Render environment secrets.
- Revoke/rotate immediately; enforce expiry, scopes, rate limits and usage limits.
- Never put MCP keys in source, web/mobile bundles, prompts, logs or generated question content.

## Data rules

- Reuse existing schemas and canonical subject/topic records.
- Validate question type, options/answer, explanation, difficulty, source and required fields.
- Detect duplicates and report them; use idempotency to avoid duplicate writes on retry.
- Default new questions to draft. MCP may approve only with explicit `questions:approve` scope and normal validation.
- Papers contain approved questions only and respect blueprint/preset constraints.
- Assignments and announcements use existing audience/role/eligibility checks; return safe previews and counts.
- Return structured, row-level errors without leaking internal stack traces or secrets.

## Required tests

- Key one-time reveal, hashing, rotation/revocation, expiry and scope enforcement.
- Redaction of credentials and PII in logs/errors.
- Question validation, duplicates, idempotency and review/approval audit trail.
- Paper blueprint/order/scoring/coverage and approved-question-only constraints.
- Assignment audience authorization, cohort limits, deadlines and duplicate assignment handling.
- Announcement audience validation, draft/publish permissions and schedule behavior.
- Bulk operation preview, confirmation thresholds and partial failure reporting.
- All operations visible in admin activity logs; CI passes.

## Delivery order

1. Audit current question, approval, paper, assignment and announcement services/routes.
2. Add MCP key, operation, import-batch and audit models/migrations.
3. Implement admin key/scope management and activity-log UI.
4. Implement internal authenticated APIs reusing existing service layer.
5. Implement remote MCP server and tools.
6. Add end-to-end tests, docs and Render service configuration (no secrets committed).
7. Review PR, pass CI, then deploy API and MCP service in controlled order.

## Acceptance criteria

- Authorized MCP client can create/upload, review, approve/reject questions within granted scopes.
- Authorized MCP client can create/publish question papers, assign them, and create/publish announcements within granted scopes.
- Admin can manage scoped keys, review content, inspect operation/audit logs, and revoke access.
- All operations obey existing validation and business rules, are idempotent where applicable, and are auditable.
- Secrets are one-time displayed, never retrievable, and never logged.
- ChatGPT/Claude setup instructions are documented; CI passes before deployment.
