CREATE TABLE "StudentPrivateQuestion" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "topic" TEXT NOT NULL DEFAULT 'General',
  "text" TEXT NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "correctIndex" INTEGER NOT NULL DEFAULT 0,
  "explanation" TEXT NOT NULL DEFAULT '',
  "difficulty" TEXT NOT NULL DEFAULT 'medium',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentPrivateQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StudentPrivateQuestion_userId_subject_topic_idx" ON "StudentPrivateQuestion"("userId","subject","topic");
CREATE INDEX "StudentPrivateQuestion_userId_updatedAt_idx" ON "StudentPrivateQuestion"("userId","updatedAt");
ALTER TABLE "StudentPrivateQuestion" ADD CONSTRAINT "StudentPrivateQuestion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StudentPracticeSet" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "durationMinutes" INTEGER NOT NULL DEFAULT 20,
  "questions" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentPracticeSet_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StudentPracticeSet_userId_updatedAt_idx" ON "StudentPracticeSet"("userId","updatedAt");
ALTER TABLE "StudentPracticeSet" ADD CONSTRAINT "StudentPracticeSet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "StudentMcpKey" (
  "id" TEXT NOT NULL,
  "userId" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "scopes" TEXT[] NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastUsedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  CONSTRAINT "StudentMcpKey_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentMcpKey_keyHash_key" ON "StudentMcpKey"("keyHash");
CREATE INDEX "StudentMcpKey_userId_revokedAt_idx" ON "StudentMcpKey"("userId","revokedAt");
ALTER TABLE "StudentMcpKey" ADD CONSTRAINT "StudentMcpKey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
