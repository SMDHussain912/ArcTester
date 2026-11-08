-- Expiring announcements and one-time-per-student popup tracking.
CREATE TABLE "Announcement" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "startsAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" INTEGER NOT NULL,
  CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Announcement_startsAt_expiresAt_idx" ON "Announcement"("startsAt", "expiresAt");
CREATE INDEX "Announcement_createdById_idx" ON "Announcement"("createdById");

CREATE TABLE "AnnouncementView" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "announcementId" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AnnouncementView_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnnouncementView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "AnnouncementView_announcementId_userId_key" ON "AnnouncementView"("announcementId", "userId");
CREATE INDEX "AnnouncementView_userId_seenAt_idx" ON "AnnouncementView"("userId", "seenAt");
