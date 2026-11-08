CREATE TABLE "ExamSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assignmentId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "startedAt" DATETIME,
  "lastHeartbeatAt" DATETIME,
  "lastActivityAt" DATETIME,
  "endedAt" DATETIME,
  "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
  "focusLossCount" INTEGER NOT NULL DEFAULT 0,
  "disconnectCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ExamAssignment" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamSession_assignmentId_key" ON "ExamSession"("assignmentId");
CREATE INDEX "ExamSession_status_lastHeartbeatAt_idx" ON "ExamSession"("status","lastHeartbeatAt");
CREATE INDEX "ExamSession_studentId_status_idx" ON "ExamSession"("studentId","status");

CREATE TABLE "ExamSessionEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "detail" TEXT NOT NULL DEFAULT '',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ExamSessionEvent_sessionId_createdAt_idx" ON "ExamSessionEvent"("sessionId","createdAt");
