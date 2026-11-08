PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AttemptAnswer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "attemptId" INTEGER NOT NULL,
    "questionId" INTEGER NOT NULL,
    "chosen" INTEGER,
    "isCorrect" BOOLEAN NOT NULL,
    "subjectSnapshot" TEXT NOT NULL DEFAULT '',
    "topicSnapshot" TEXT,
    "difficultySnapshot" TEXT NOT NULL DEFAULT 'medium',
    "textSnapshot" TEXT NOT NULL DEFAULT '',
    "optionsSnapshot" TEXT NOT NULL DEFAULT '[]',
    "correctIndexSnapshot" INTEGER NOT NULL DEFAULT 0,
    "explanationSnapshot" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "new_AttemptAnswer" (
  "id", "attemptId", "questionId", "chosen", "isCorrect",
  "subjectSnapshot", "topicSnapshot", "difficultySnapshot",
  "textSnapshot", "optionsSnapshot", "correctIndexSnapshot", "explanationSnapshot"
)
SELECT
  aa."id", aa."attemptId", aa."questionId", aa."chosen", aa."isCorrect",
  aa."subjectSnapshot",
  aa."topicSnapshot",
  aa."difficultySnapshot",
  q."text", q."options", q."correctIndex", q."explanation"
FROM "AttemptAnswer" aa
JOIN "Question" q ON q."id" = aa."questionId"
;

DROP TABLE "AttemptAnswer";
ALTER TABLE "new_AttemptAnswer" RENAME TO "AttemptAnswer";
CREATE INDEX "AttemptAnswer_attemptId_idx" ON "AttemptAnswer"("attemptId");
CREATE INDEX "AttemptAnswer_questionId_idx" ON "AttemptAnswer"("questionId");

CREATE TABLE "new_Stat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "questionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" DATETIME,
    CONSTRAINT "Stat_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Stat" ("id", "questionId", "userId", "seen", "wrong", "lastSeen")
SELECT "id", "questionId", "userId", "seen", "wrong", "lastSeen" FROM "Stat";
DROP TABLE "Stat";
ALTER TABLE "new_Stat" RENAME TO "Stat";
CREATE INDEX "Stat_questionId_idx" ON "Stat"("questionId");
CREATE UNIQUE INDEX "Stat_userId_questionId_key" ON "Stat"("userId", "questionId");

PRAGMA foreign_keys=ON;
