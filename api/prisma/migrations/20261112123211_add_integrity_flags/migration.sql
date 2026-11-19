-- CreateTable
CREATE TABLE "IntegrityFlag" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentIdA" INTEGER NOT NULL,
    "studentIdB" INTEGER NOT NULL,
    "studentEmailA" TEXT NOT NULL,
    "studentEmailB" TEXT NOT NULL,
    "sharedWrong" INTEGER NOT NULL,
    "totalWrongA" INTEGER NOT NULL,
    "totalWrongB" INTEGER NOT NULL,
    "threshold" INTEGER NOT NULL,
    "sameIp" BOOLEAN NOT NULL,
    "fastAnswers" BOOLEAN NOT NULL,
    "flaggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "dismissedBy" INTEGER,

    CONSTRAINT "IntegrityFlag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "IntegrityFlag_assignmentId_idx" ON "IntegrityFlag"("assignmentId");

-- CreateIndex
CREATE INDEX "IntegrityFlag_studentIdA_studentIdB_idx" ON "IntegrityFlag"("studentIdA", "studentIdB");
