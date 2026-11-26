# ArcTester audit-log retention and access policy

## Scope
This is the engineering default for the student/admin audit trail. Confirm retention periods and student-notice wording with the organization’s privacy/legal reviewer before production use.

## Access and exports
- Audit timelines and exports are administrator-only API routes; students cannot query another account’s activity.
- Export only the selected student’s filtered events. CSV and JSON are supported; exports are capped at 10,000 rows per request.
- Every timeline view, export, and integrity check creates its own audit event.
- CSV values are quoted and spreadsheet formula prefixes are neutralized.
- The application does not collect IP addresses, device fingerprints, user-agent strings, cookies, bearer tokens, passwords, OTPs, recovery codes, or raw request bodies in this audit trail.

## Retention
- Default retention: 365 days.
- Configure `AUDIT_RETENTION_DAYS` to an integer from 30 through 3650.
- Schedule the API retention command as a managed cron job (for example, daily): `cd api && npm run audit:prune`.
- The pruning transaction takes the same PostgreSQL advisory lock as audit writes, creates a hash-chain checkpoint, then deletes expired audit-event rows. The checkpoint preserves chain continuity and lets the integrity verifier detect missing or altered retained records.
- The same scheduled command deletes login-history events older than the configured audit retention window (default 365 days) because those rows contain email, masked IP and user-agent metadata.
- It also deletes expired or revoked session-history rows older than 90 days. Recent session history remains available for account security.
- Pruned event details are deleted, not archived. Export records needed for a longer legal or operational retention period before they expire.

## Integrity and operations
- Events are server-generated and chained with SHA-256 hashes; a PostgreSQL advisory transaction lock serializes writes across API instances.
- Admins can run the audit integrity check. It verifies checkpoint hashes and the retained event chain.
- A hash chain is tamper-evident, not a substitute for restricted database access, backups, or externally stored signed checkpoints. Database administrators with write access can alter data and recompute hashes.
- Monitor the API log for the generic audit-persistence failure message and investigate database availability. Do not log event payloads or authentication secrets when troubleshooting.
