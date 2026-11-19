CREATE TABLE "StudentNotificationPreference" (
  "id" TEXT NOT NULL, "userId" INTEGER NOT NULL,
  "examAssignments" BOOLEAN NOT NULL DEFAULT TRUE, "examResults" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "StudentNotificationPreference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StudentNotificationPreference_userId_key" ON "StudentNotificationPreference"("userId");
ALTER TABLE "StudentNotificationPreference" ADD CONSTRAINT "StudentNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;