-- Persist per-student in-app notification preferences.
CREATE TABLE "StudentNotificationPreference" (
  "id" TEXT NOT NULL PRIMARY KEY, "userId" INTEGER NOT NULL UNIQUE,
  "examAssignments" BOOLEAN NOT NULL DEFAULT 1, "examResults" BOOLEAN NOT NULL DEFAULT 1,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "StudentNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);