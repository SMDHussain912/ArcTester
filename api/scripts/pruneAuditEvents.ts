import { PrismaClient } from "@prisma/client";
import { pruneAuditEvents } from "../src/audit.js";

const db = new PrismaClient();
const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? "365");
pruneAuditEvents(db, retentionDays)
  .then(result => process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\\n"))
  .catch((error: unknown) => {
    process.stderr.write("Audit retention prune failed: " + (error instanceof Error ? error.message : String(error)) + "\\n");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
