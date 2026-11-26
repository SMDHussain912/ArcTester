ALTER TABLE "User" ADD COLUMN "fullName" TEXT;
ALTER TABLE "User" ADD COLUMN "collegeName" TEXT;
ALTER TABLE "User" ADD COLUMN "collegeCode" TEXT;
ALTER TABLE "User" ADD COLUMN "postalPin" TEXT;
ALTER TABLE "User" ADD COLUMN "branchName" TEXT;
ALTER TABLE "User" ADD COLUMN "branchCode" TEXT;
CREATE INDEX "User_collegeName_idx" ON "User"("collegeName");
CREATE INDEX "User_branchName_idx" ON "User"("branchName");
