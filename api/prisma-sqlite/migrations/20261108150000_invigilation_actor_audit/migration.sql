ALTER TABLE "ExamSessionEvent" ADD COLUMN "actorId" INTEGER;
CREATE INDEX "ExamSessionEvent_actorId_idx" ON "ExamSessionEvent"("actorId");
CREATE TABLE "new_ExamSessionEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "actorId" INTEGER,
  "type" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamSessionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ExamSessionEvent" ("id", "sessionId", "actorId", "type", "detail", "createdAt")
SELECT "id", "sessionId", "actorId", "type", "detail", "createdAt" FROM "ExamSessionEvent";
DROP TABLE "ExamSessionEvent";
ALTER TABLE "new_ExamSessionEvent" RENAME TO "ExamSessionEvent";
CREATE INDEX "ExamSessionEvent_sessionId_createdAt_idx" ON "ExamSessionEvent"("sessionId","createdAt");
CREATE INDEX "ExamSessionEvent_actorId_idx" ON "ExamSessionEvent"("actorId");
