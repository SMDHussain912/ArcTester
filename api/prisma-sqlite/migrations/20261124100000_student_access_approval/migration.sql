ALTER TABLE "User" ADD COLUMN "accessStatus" TEXT NOT NULL DEFAULT 'APPROVED';
CREATE INDEX "User_role_accessStatus_idx" ON "User"("role", "accessStatus");
