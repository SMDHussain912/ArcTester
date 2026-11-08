/*
  Scopes progress rows to their owner:
  - Attempt.userId becomes required (ON DELETE CASCADE)
  - Stat becomes one row per (userId, questionId) instead of one per question

  Data note: before this migration, Stat rows were GLOBAL (one row per
  question, shared by every user) and Attempt rows could have no owner.
  Neither can be attributed to a specific user, so the orphaned progress is
  deleted here rather than silently assigned to an arbitrary account.
  The shared question bank (Question/Subject/Topic) is untouched.
*/

-- Drop progress that has no owner. AttemptAnswer rows go with their attempt
-- (ON DELETE CASCADE). Old global Stat rows have no owner column at all.
DELETE FROM "AttemptAnswer" WHERE "attemptId" IN (SELECT "id" FROM "Attempt" WHERE "userId" IS NULL);
DELETE FROM "Attempt" WHERE "userId" IS NULL;
DELETE FROM "Stat";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Attempt" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mode" TEXT NOT NULL DEFAULT 'mock',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" DATETIME,
    "finishedAt" DATETIME,
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,
    CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Attempt" ("deadline", "expired", "finishedAt", "id", "mode", "startedAt", "userId") SELECT "deadline", "expired", "finishedAt", "id", "mode", "startedAt", "userId" FROM "Attempt";
DROP TABLE "Attempt";
ALTER TABLE "new_Attempt" RENAME TO "Attempt";
CREATE INDEX "Attempt_userId_idx" ON "Attempt"("userId");
CREATE TABLE "new_Stat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" DATETIME,
    CONSTRAINT "Stat_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Stat" ("id", "lastSeen", "questionId", "seen", "wrong") SELECT "id", "lastSeen", "questionId", "seen", "wrong" FROM "Stat";
DROP TABLE "Stat";
ALTER TABLE "new_Stat" RENAME TO "Stat";
CREATE INDEX "Stat_questionId_idx" ON "Stat"("questionId");
CREATE UNIQUE INDEX "Stat_userId_questionId_key" ON "Stat"("userId", "questionId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
