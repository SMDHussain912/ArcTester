-- Preserve the classification used when a practice attempt was created.
ALTER TABLE "AttemptAnswer" ADD COLUMN "subjectSnapshot" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AttemptAnswer" ADD COLUMN "topicSnapshot" TEXT;
ALTER TABLE "AttemptAnswer" ADD COLUMN "difficultySnapshot" TEXT NOT NULL DEFAULT 'medium';

UPDATE "AttemptAnswer"
SET
  "subjectSnapshot" = COALESCE((
    SELECT "Subject"."name"
    FROM "Question"
    JOIN "Subject" ON "Subject"."id" = "Question"."subjectId"
    WHERE "Question"."id" = "AttemptAnswer"."questionId"
  ), ''),
  "topicSnapshot" = (
    SELECT "Topic"."name"
    FROM "Question"
    LEFT JOIN "Topic" ON "Topic"."id" = "Question"."topicId"
    WHERE "Question"."id" = "AttemptAnswer"."questionId"
  ),
  "difficultySnapshot" = COALESCE((
    SELECT "Question"."difficulty"
    FROM "Question"
    WHERE "Question"."id" = "AttemptAnswer"."questionId"
  ), 'medium');
