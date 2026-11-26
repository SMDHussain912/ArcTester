ALTER TABLE "Question" ADD COLUMN "questionType" TEXT NOT NULL DEFAULT 'mcq';
ALTER TABLE "Question" ADD COLUMN "promptData" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Question" ADD COLUMN "answerData" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "AttemptAnswer" ADD COLUMN "questionTypeSnapshot" TEXT NOT NULL DEFAULT 'mcq';
ALTER TABLE "AttemptAnswer" ADD COLUMN "promptDataSnapshot" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "AttemptAnswer" ADD COLUMN "answerDataSnapshot" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "AttemptAnswer" ADD COLUMN "responseSnapshot" TEXT NOT NULL DEFAULT 'null';
