-- Persist per-student acknowledgement so a notice is shown only once.
CREATE TABLE "AnnouncementRead" (
    "announcementId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "seenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId", "studentId"),
    CONSTRAINT "AnnouncementRead_announcementId_fkey"
      FOREIGN KEY ("announcementId") REFERENCES "Announcement" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AnnouncementRead_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "User" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "AnnouncementRead_studentId_seenAt_idx"
  ON "AnnouncementRead"("studentId", "seenAt");
