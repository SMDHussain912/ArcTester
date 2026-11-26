ALTER TABLE "StudyMaterial" ADD COLUMN "audienceScope" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "StudyMaterial" ADD COLUMN "targetCollegeCode" TEXT;
ALTER TABLE "StudyMaterial" ADD COLUMN "targetCollegeName" TEXT;
ALTER TABLE "StudyMaterial" ADD COLUMN "targetBranchCode" TEXT;
ALTER TABLE "StudyMaterial" ADD COLUMN "targetBranchName" TEXT;
CREATE INDEX "StudyMaterial_audience_target_idx" ON "StudyMaterial"("audienceScope", "targetCollegeCode", "targetBranchCode");

ALTER TABLE "LessonDraft" ADD COLUMN "audienceScope" TEXT NOT NULL DEFAULT 'ALL';
ALTER TABLE "LessonDraft" ADD COLUMN "targetCollegeCode" TEXT;
ALTER TABLE "LessonDraft" ADD COLUMN "targetCollegeName" TEXT;
ALTER TABLE "LessonDraft" ADD COLUMN "targetBranchCode" TEXT;
ALTER TABLE "LessonDraft" ADD COLUMN "targetBranchName" TEXT;
CREATE INDEX "LessonDraft_status_audienceScope_targetBranchCode_idx" ON "LessonDraft"("status", "audienceScope", "targetBranchCode");
