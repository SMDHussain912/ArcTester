-- Admin announcements synchronized to student devices.
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" DATETIME,
    "createdById" INTEGER NOT NULL,
    CONSTRAINT "Announcement_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User" ("id")
      ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "Announcement_publishedAt_expiresAt_idx"
  ON "Announcement"("publishedAt", "expiresAt");
CREATE INDEX "Announcement_createdById_idx"
  ON "Announcement"("createdById");
