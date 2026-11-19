import type { PrismaClient } from "@prisma/client";

/** Queue only existing question IDs; duplicate IDs are removed and sorted. */
export async function queueQuestionEmbeddingJob(db: PrismaClient, questionIds: number[]): Promise<string | null> {
  const ids = [...new Set(questionIds.filter((id) => Number.isSafeInteger(id) && id > 0))].sort((a, b) => a - b);
  if (ids.length === 0) return null;
  const existing = await db.question.findMany({ where: { id: { in: ids } }, select: { id: true } });
  const validIds = existing.map((row) => row.id).sort((a, b) => a - b);
  if (validIds.length === 0) return null;
  const job = await db.questionEmbeddingJob.create({
    data: {
      status: "QUEUED",
      batchSize: 16,
      force: false,
      total: validIds.length,
      progress: 0,
      cursorQuestionId: 0,
      questionIdsJson: JSON.stringify(validIds),
    },
    select: { id: true },
  });
  return job.id;
}
