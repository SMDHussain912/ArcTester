-- Keep the legacy SQLite import schema aligned with server notification data.
ALTER TABLE "AnnouncementRead" ADD COLUMN "acknowledgedAt" DATETIME;

CREATE TABLE "StudentNotification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" DATETIME,
    "expiresAt" DATETIME,
    CONSTRAINT "StudentNotification_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "StudentNotification_dedupeKey_key"
  ON "StudentNotification"("dedupeKey");
CREATE INDEX "StudentNotification_userId_readAt_createdAt_idx"
  ON "StudentNotification"("userId", "readAt", "createdAt");
CREATE INDEX "StudentNotification_expiresAt_idx"
  ON "StudentNotification"("expiresAt");
