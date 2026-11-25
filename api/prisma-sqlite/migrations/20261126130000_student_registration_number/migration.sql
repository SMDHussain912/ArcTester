ALTER TABLE "User" ADD COLUMN "registrationNumber" TEXT;
CREATE UNIQUE INDEX "User_registrationNumber_key" ON "User"("registrationNumber");
