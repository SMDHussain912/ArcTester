CREATE TABLE "AuditEvent" (
  "id" TEXT NOT NULL,
  "actorId" INTEGER,
  "actorRole" TEXT NOT NULL DEFAULT 'UNKNOWN',
  "subjectUserId" INTEGER,
  "action" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL DEFAULT '',
  "resourceId" TEXT NOT NULL DEFAULT '',
  "requestId" TEXT NOT NULL,
  "previousHash" TEXT NOT NULL DEFAULT '',
  "eventHash" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "collegeCode" TEXT NOT NULL DEFAULT '',
  "branchCode" TEXT NOT NULL DEFAULT '',
  "contextJson" TEXT NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditEvent_eventHash_key" UNIQUE ("eventHash"),
  CONSTRAINT "AuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditEvent_subjectUserId_createdAt_idx" ON "AuditEvent"("subjectUserId", "createdAt");
CREATE INDEX "AuditEvent_actorId_createdAt_idx" ON "AuditEvent"("actorId", "createdAt");
CREATE INDEX "AuditEvent_action_createdAt_idx" ON "AuditEvent"("action", "createdAt");
CREATE INDEX "AuditEvent_outcome_createdAt_idx" ON "AuditEvent"("outcome", "createdAt");
CREATE INDEX "AuditEvent_requestId_idx" ON "AuditEvent"("requestId");
