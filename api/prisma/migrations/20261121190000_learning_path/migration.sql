CREATE TABLE "PathUnit" (
  "id" SERIAL PRIMARY KEY,
  "subjectId" INTEGER NOT NULL REFERENCES "Subject"("id") ON DELETE CASCADE,
  "topicId" INTEGER NOT NULL REFERENCES "Topic"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL
);
CREATE UNIQUE INDEX "PathUnit_subjectId_topicId_key" ON "PathUnit"("subjectId","topicId");
CREATE UNIQUE INDEX "PathUnit_subjectId_position_key" ON "PathUnit"("subjectId","position");
CREATE INDEX "PathUnit_subjectId_idx" ON "PathUnit"("subjectId");

CREATE TABLE "PathLesson" (
  "id" SERIAL PRIMARY KEY,
  "unitId" INTEGER NOT NULL REFERENCES "PathUnit"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL,
  "title" TEXT NOT NULL
);
CREATE UNIQUE INDEX "PathLesson_unitId_position_key" ON "PathLesson"("unitId","position");
CREATE INDEX "PathLesson_unitId_idx" ON "PathLesson"("unitId");

CREATE TABLE "LessonQuestion" (
  "id" SERIAL PRIMARY KEY,
  "lessonId" INTEGER NOT NULL REFERENCES "PathLesson"("id") ON DELETE CASCADE,
  "questionId" INTEGER NOT NULL REFERENCES "Question"("id") ON DELETE CASCADE,
  "position" INTEGER NOT NULL
);
CREATE UNIQUE INDEX "LessonQuestion_lessonId_position_key" ON "LessonQuestion"("lessonId","position");
CREATE UNIQUE INDEX "LessonQuestion_questionId_key" ON "LessonQuestion"("questionId");
CREATE INDEX "LessonQuestion_lessonId_idx" ON "LessonQuestion"("lessonId");

CREATE TABLE "UserLessonProgress" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "lessonId" INTEGER NOT NULL REFERENCES "PathLesson"("id") ON DELETE CASCADE,
  "completedAt" TIMESTAMP(3),
  "bestScorePct" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "UserLessonProgress_userId_lessonId_key" ON "UserLessonProgress"("userId","lessonId");
CREATE INDEX "UserLessonProgress_userId_idx" ON "UserLessonProgress"("userId");

CREATE TABLE "UserUnitTestProgress" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "unitId" INTEGER NOT NULL REFERENCES "PathUnit"("id") ON DELETE CASCADE,
  "passedAt" TIMESTAMP(3),
  "bestScorePct" INTEGER NOT NULL DEFAULT 0,
  "attempts" INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX "UserUnitTestProgress_userId_unitId_key" ON "UserUnitTestProgress"("userId","unitId");
CREATE INDEX "UserUnitTestProgress_userId_idx" ON "UserUnitTestProgress"("userId");

CREATE TABLE "PathAnswer" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "questionId" INTEGER NOT NULL REFERENCES "Question"("id") ON DELETE CASCADE,
  "lessonId" INTEGER REFERENCES "PathLesson"("id") ON DELETE CASCADE,
  "unitId" INTEGER REFERENCES "PathUnit"("id") ON DELETE CASCADE,
  "scopeKey" TEXT NOT NULL,
  "response" TEXT NOT NULL DEFAULT 'null',
  "isCorrect" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX "PathAnswer_userId_scopeKey_questionId_key" ON "PathAnswer"("userId","scopeKey","questionId");
CREATE INDEX "PathAnswer_userId_lessonId_idx" ON "PathAnswer"("userId","lessonId");
CREATE INDEX "PathAnswer_userId_unitId_idx" ON "PathAnswer"("userId","unitId");
