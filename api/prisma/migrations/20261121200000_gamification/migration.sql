CREATE TABLE "UserGamification" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "totalXp" INTEGER NOT NULL DEFAULT 0,
  "xpBalance" INTEGER NOT NULL DEFAULT 0,
  "currentStreak" INTEGER NOT NULL DEFAULT 0,
  "longestStreak" INTEGER NOT NULL DEFAULT 0,
  "lastActivityDate" DATE,
  "dailyGoalXp" INTEGER NOT NULL DEFAULT 50,
  "streakFreezeInventory" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserGamification_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "XpLedger" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "eventKey" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "XpLedger_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "GamificationDay" (
  "id" SERIAL NOT NULL,
  "userId" INTEGER NOT NULL,
  "date" DATE NOT NULL,
  "xpEarned" INTEGER NOT NULL DEFAULT 0,
  "lessonsCompleted" INTEGER NOT NULL DEFAULT 0,
  "unitTestsPassed" INTEGER NOT NULL DEFAULT 0,
  "practiceTestsDone" INTEGER NOT NULL DEFAULT 0,
  "goalReachedAt" TIMESTAMP(3),
  "freezeUsed" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "GamificationDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserGamification_userId_key" ON "UserGamification"("userId");
CREATE UNIQUE INDEX "XpLedger_userId_eventKey_key" ON "XpLedger"("userId", "eventKey");
CREATE INDEX "XpLedger_userId_createdAt_idx" ON "XpLedger"("userId", "createdAt");
CREATE UNIQUE INDEX "GamificationDay_userId_date_key" ON "GamificationDay"("userId", "date");
CREATE INDEX "GamificationDay_userId_date_idx" ON "GamificationDay"("userId", "date");
ALTER TABLE "UserGamification" ADD CONSTRAINT "UserGamification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpLedger" ADD CONSTRAINT "XpLedger_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GamificationDay" ADD CONSTRAINT "GamificationDay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
