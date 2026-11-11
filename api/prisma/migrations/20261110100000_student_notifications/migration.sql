-- Persist explicit per-student announcement acknowledgement and in-app notifications.
ALTER TABLE "AnnouncementView"
ADD COLUMN "acknowledgedAt" TIMESTAMP(3);

CREATE TABLE "StudentNotification" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "href" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "StudentNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StudentNotification_dedupeKey_key"
ON "StudentNotification"("dedupeKey");

CREATE INDEX "StudentNotification_userId_readAt_createdAt_idx"
ON "StudentNotification"("userId", "readAt", "createdAt");

CREATE INDEX "StudentNotification_expiresAt_idx"
ON "StudentNotification"("expiresAt");

ALTER TABLE "StudentNotification"
ADD CONSTRAINT "StudentNotification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
