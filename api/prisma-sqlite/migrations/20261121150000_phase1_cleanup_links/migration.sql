-- Remove unused ML registry, training, drift, embedding and adaptive-decision persistence.
DROP TABLE IF EXISTS "QuestionEmbeddingJob";
DROP TABLE IF EXISTS "QuestionEmbedding";
DROP TABLE IF EXISTS "AdaptiveDecisionLog";
DROP TABLE IF EXISTS "ModelTrainingJob";
DROP TABLE IF EXISTS "ModelDriftBucket";
DROP TABLE IF EXISTS "ModelEvaluation";
DROP TABLE IF EXISTS "ModelRegistryAudit";
DROP TABLE IF EXISTS "RegisteredModel";
DROP TABLE IF EXISTS "ModelDataset";
-- Keep metadata, but require administrators to relink resources.
ALTER TABLE "StudyMaterial" ADD COLUMN "url" TEXT NOT NULL DEFAULT '';
UPDATE "StudyMaterial" SET "status" = 'DRAFT';
ALTER TABLE "StudyMaterial" DROP COLUMN "contentBase64";
ALTER TABLE "StudyMaterial" DROP COLUMN "fileName";
ALTER TABLE "StudyMaterial" DROP COLUMN "mimeType";
ALTER TABLE "StudyMaterial" DROP COLUMN "sizeBytes";
