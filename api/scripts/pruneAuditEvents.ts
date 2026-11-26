import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { computeAuditCheckpointHash } from "../src/audit.js";

const db = new PrismaClient();
async function main() {
  const retentionDays = Number(process.env.AUDIT_RETENTION_DAYS ?? "365");
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 3650) {
    throw new Error("AUDIT_RETENTION_DAYS must be an integer from 30 to 3650.");
  }
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const result = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(73198412)`;
    const where = { createdAt: { lt: cutoff } };
    const deletedCount = await tx.auditEvent.count({ where });
    if (!deletedCount) return { deletedCount: 0, cutoff: cutoff.toISOString(), retentionDays };
    const last = await tx.auditEvent.findFirst({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { eventHash: true, createdAt: true } });
    if (!last) return { deletedCount: 0, cutoff: cutoff.toISOString(), retentionDays };
    const previous = await tx.auditCheckpoint.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { checkpointHash: true, createdAt: true } });
    const id = randomUUID();
    const createdAt = new Date(Math.max(Date.now(), last.createdAt.getTime() + 1, (previous?.createdAt.getTime() ?? 0) + 1));
    const fields = {
      id,
      lastEventHash: last.eventHash,
      lastEventCreatedAt: last.createdAt,
      deletedCount,
      previousCheckpointHash: previous?.checkpointHash ?? "GENESIS",
      createdAt,
    };
    const checkpointHash = computeAuditCheckpointHash(fields);
    await tx.auditCheckpoint.create({ data: { ...fields, checkpointHash } });
    const deleted = await tx.auditEvent.deleteMany({ where });
    return { deletedCount: deleted.count, cutoff: cutoff.toISOString(), retentionDays, checkpointId: id, checkpointHash };
  }, { timeout: 30000 });
  process.stdout.write(JSON.stringify({ ok: true, ...result }) + "\n");
}
main().catch((error: unknown) => {
  process.stderr.write("Audit retention prune failed: " + (error instanceof Error ? error.message : String(error)) + "\n");
  process.exitCode = 1;
}).finally(() => db.$disconnect());
