CREATE TABLE "ExamSessionAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "examQuestionId" TEXT NOT NULL,
    "selectedIndex" INTEGER,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ExamSessionAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ExamSessionAnswer_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamVersionQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ExamSessionAnswer_sessionId_examQuestionId_key" ON "ExamSessionAnswer"("sessionId", "examQuestionId");
CREATE INDEX "ExamSessionAnswer_examQuestionId_idx" ON "ExamSessionAnswer"("examQuestionId");
