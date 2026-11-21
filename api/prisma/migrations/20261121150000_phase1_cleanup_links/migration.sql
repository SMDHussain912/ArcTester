-- Phase 1 removes unused ML registry, training, drift, embedding and adaptive-decision persistence.
DROP TABLE IF EXISTS "QuestionEmbeddingJob" CASCADE;
DROP TABLE IF EXISTS "QuestionEmbedding" CASCADE;
DROP TABLE IF EXISTS "AdaptiveDecisionLog" CASCADE;
DROP TABLE IF EXISTS "ModelTrainingJob" CASCADE;
DROP TABLE IF EXISTS "ModelDriftBucket" CASCADE;
DROP TABLE IF EXISTS "ModelEvaluation" CASCADE;
DROP TABLE IF EXISTS "ModelRegistryAudit" CASCADE;
DROP TABLE IF EXISTS "RegisteredModel" CASCADE;
DROP TABLE IF EXISTS "ModelDataset" CASCADE;
-- Keep metadata, but stop storing file bytes. Existing resources become drafts
-- until an administrator supplies a shareable HTTPS URL.
ALTER TABLE "StudyMaterial" ADD COLUMN "url" TEXT NOT NULL DEFAULT '';
UPDATE "StudyMaterial" SET "status" = 'DRAFT';
ALTER TABLE "StudyMaterial" DROP COLUMN "contentBase64";
ALTER TABLE "StudyMaterial" DROP COLUMN "fileName";
ALTER TABLE "StudyMaterial" DROP COLUMN "mimeType";
ALTER TABLE "StudyMaterial" DROP COLUMN "sizeBytes";
