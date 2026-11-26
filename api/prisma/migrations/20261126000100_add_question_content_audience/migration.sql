ALTER TABLE "Question"
  ADD COLUMN "audienceScope" TEXT NOT NULL DEFAULT 'ALL',
  ADD COLUMN "targetCollegeCode" TEXT,
  ADD COLUMN "targetCollegeName" TEXT,
  ADD COLUMN "targetBranchCode" TEXT,
  ADD COLUMN "targetBranchName" TEXT,
  ADD COLUMN "targetStudentIdsJson" TEXT NOT NULL DEFAULT '[]',
  ADD COLUMN "createdById" INTEGER;

CREATE INDEX "Question_reviewStatus_audienceScope_subjectId_idx"
  ON "Question"("reviewStatus", "audienceScope", "subjectId");
CREATE INDEX "Question_createdById_idx" ON "Question"("createdById");
ALTER TABLE "Question"
  ADD CONSTRAINT "Question_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "StudyMaterial"
  ADD COLUMN "targetStudentIdsJson" TEXT NOT NULL DEFAULT '[]';

ALTER TABLE "LessonDraft"
  ADD COLUMN "targetStudentIdsJson" TEXT NOT NULL DEFAULT '[]';
