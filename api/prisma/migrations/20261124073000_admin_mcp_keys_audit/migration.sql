CREATE TABLE "AdminMcpKey" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "AdminMcpKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminMcpKey_keyHash_key" ON "AdminMcpKey"("keyHash");
CREATE INDEX "AdminMcpKey_userId_revokedAt_idx" ON "AdminMcpKey"("userId","revokedAt");
ALTER TABLE "AdminMcpKey" ADD CONSTRAINT "AdminMcpKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AdminMcpAuditLog" (
  "id" TEXT NOT NULL,
  "actorId" INTEGER NOT NULL,
  "tool" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "summary" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminMcpAuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AdminMcpAuditLog_actorId_createdAt_idx" ON "AdminMcpAuditLog"("actorId","createdAt");
CREATE INDEX "AdminMcpAuditLog_createdAt_idx" ON "AdminMcpAuditLog"("createdAt");
ALTER TABLE "AdminMcpAuditLog" ADD CONSTRAINT "AdminMcpAuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
