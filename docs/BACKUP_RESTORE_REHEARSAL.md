# PostgreSQL backup and restore rehearsal

**Status: procedure and guarded script prepared; a real restore rehearsal is NOT VERIFIED.**

This rehearsal creates a custom-format PostgreSQL dump and restores it into a
separate, empty rehearsal database. It does not restore over the source database.

## Safety rules

- Keep the source `DATABASE_URL` read-only for the duration of the rehearsal;
  pause writes so row counts can be compared consistently.
- Create a separate empty database whose name contains `rehearsal`, and set
  `RESTORE_DATABASE_URL` to that database.
- The script refuses to continue if source and target resolve to the same
  database identity, if the target name does not contain `rehearsal`, or if
  the target already contains public tables.
- The script requires the explicit `--execute` argument. Without it, it only
  prints the planned actions.
- It does not create or drop databases, does not use `pg_restore --clean`,
  and does not delete or overwrite an existing backup file or follow a pre-existing backup-file symlink.
- Dumps contain account and student data. Restrict access, encrypt backups at
  rest and in transit, and follow the organization's retention policy.

## Prerequisites

- PostgreSQL client tools (`psql`, `pg_dump`, `pg_restore`) compatible with
  the server version.
- A source database URL in `DATABASE_URL`.
- A separate, newly created, empty rehearsal database URL in
  `RESTORE_DATABASE_URL`. Its database name must contain `rehearsal`.
- A maintenance window or paused writes while the source and restored row
  counts are compared.

Example target creation (choose a unique name and use the correct maintenance
connection for your environment):

```bash
createdb --maintenance-db="$DATABASE_URL" arctester_rehearsal_20261110
```

Do not point the restore URL at production. The script will not create the
target database for you.

## Run the rehearsal

First run the safe preview:

```bash
DATABASE_URL="$DATABASE_URL" \
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
scripts/backup-restore-rehearsal.sh
```

Then, after confirming both URLs and the empty rehearsal target:

```bash
DATABASE_URL="$DATABASE_URL" \
RESTORE_DATABASE_URL="$RESTORE_DATABASE_URL" \
BACKUP_DIR="$HOME/secure-backups/arctester" \
scripts/backup-restore-rehearsal.sh --execute
```

The script:

1. Confirms the source and target are different database identities.
2. Confirms the target database name contains `rehearsal` and has no public
   base tables.
3. Captures row counts for all public base tables in the source.
4. Creates a custom-format dump without ownership or ACL metadata.
5. Verifies the dump table of contents.
6. Restores into the empty rehearsal database without dropping existing objects.
7. Compares source and restored row counts for every public base table.

The backup path is printed on success. The script intentionally leaves both
the backup file and rehearsal database in place. Cleanup is a separate,
owner-approved operation and is not automated here.

## Post-restore application checks

- [ ] Connect a staging/local API instance to the restored rehearsal database.
- [ ] Confirm API health and Prisma model access.
- [ ] Verify representative accounts, subjects, questions, exams, assignments,
      submissions, sessions and announcements.
- [ ] Verify a student login and an administrator read-only workflow.
- [ ] Record dump size, dump duration, restore duration, row-count comparison,
      PostgreSQL versions and the person performing the rehearsal.
- [ ] Confirm the backup can be securely retained and recovered by the
      designated operator.

## NOT VERIFIED

- The script was not run against a real database in this PR.
- No production backup was created, downloaded or restored.
- Backup encryption, off-site retention, RPO/RTO and provider snapshots were
  not tested.
- No production failover, point-in-time recovery or real-device workflow was
  exercised.
