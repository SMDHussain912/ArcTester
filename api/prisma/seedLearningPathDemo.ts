import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

/**
 * Idempotently create playable 10-question lessons from already-approved
 * questions. This script never changes reviewStatus or approves content.
 */
async function main() {
  const questions = await db.question.findMany({
    where: { reviewStatus: "APPROVED", topicId: { not: null } },
    orderBy: [{ subjectId: "asc" }, { topicId: "asc" }, { id: "asc" }],
    select: { id: true, subjectId: true, topicId: true, subject: { select: { name: true } }, topic: { select: { name: true } } },
  });
  const groups = new Map<number, typeof questions>();
  for (const question of questions) {
    if (question.topicId === null) continue;
    const group = groups.get(question.topicId) ?? [];
    group.push(question);
    groups.set(question.topicId, group);
  }

  let addedLessons = 0;
  let addedLinks = 0;
  await db.$transaction(async (tx) => {
    const nextPosition = new Map<number, number>();
    for (const group of groups.values()) {
      if (group.length < 10) continue;
      const subjectId = group[0]!.subjectId;
      const topicId = group[0]!.topicId!;
      let position = nextPosition.get(subjectId);
      if (position === undefined) {
        const last = await tx.pathUnit.findFirst({ where: { subjectId }, orderBy: { position: "desc" }, select: { position: true } });
        position = (last?.position ?? 0) + 1;
      }
      const unit = await tx.pathUnit.upsert({
        where: { subjectId_topicId: { subjectId, topicId } },
        create: { subjectId, topicId, position, title: group[0]!.topic!.name },
        update: {},
      });
      nextPosition.set(subjectId, Math.max(position + 1, unit.position + 1));

      const existingLessons = await tx.pathLesson.findMany({
        where: { unitId: unit.id }, orderBy: { position: "asc" }, include: { questions: { select: { questionId: true } } },
      });
      const linkedIds = new Set((await tx.lessonQuestion.findMany({ where: { questionId: { in: group.map((q) => q.id) } }, select: { questionId: true } })).map((row) => row.questionId));
      const available = group.filter((q) => !linkedIds.has(q.id)).map((q) => q.id);
      let lessonList = existingLessons;
      let lessonPosition = (lessonList.at(-1)?.position ?? 0) + 1;
      while (available.length >= 10) {
        let lesson = lessonList.find((item) => item.questions.length < 10);
        if (!lesson) {
          lesson = await tx.pathLesson.create({ data: { unitId: unit.id, position: lessonPosition, title: "Lesson " + lessonPosition }, include: { questions: { select: { questionId: true } } } });
          lessonPosition += 1;
          lessonList = [...lessonList, lesson];
          addedLessons += 1;
        }
        const freeSlots = 10 - lesson.questions.length;
        const selected = available.splice(0, Math.min(freeSlots, available.length));
        await tx.lessonQuestion.createMany({ data: selected.map((questionId, index) => ({ lessonId: lesson!.id, questionId, position: lesson!.questions.length + index + 1 })), skipDuplicates: true });
        addedLinks += selected.length;
        lesson = { ...lesson, questions: [...lesson.questions, ...selected.map((questionId) => ({ questionId }))] };
        lessonList = lessonList.map((item) => item.id === lesson!.id ? lesson! : item);
      }
    }
  });

  console.log(`Demo learning paths ready: ${addedLessons} lessons added, ${addedLinks} approved question links added. Unapproved questions were not touched.`);
}

main().catch((error) => {
  console.error("Demo path seed failed:", error);
  process.exitCode = 1;
}).finally(async () => db.$disconnect());
