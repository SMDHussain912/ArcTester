-- AlterTable
ALTER TABLE "ExamSession" ADD COLUMN     "clientKind" TEXT,
ADD COLUMN     "deviceId" TEXT,
ADD COLUMN     "integrityFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "ipAddress" TEXT,
ADD COLUMN     "userAgent" TEXT,
ADD COLUMN     "violationCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ExamVersion" ADD COLUMN     "autoTerminate" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "integrityLevel" TEXT NOT NULL DEFAULT 'BASIC',
ADD COLUMN     "maxViolations" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "requireSecureClient" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sebKeys" TEXT[];

-- CreateIndex
CREATE INDEX "ExamSession_deviceId_idx" ON "ExamSession"("deviceId");
