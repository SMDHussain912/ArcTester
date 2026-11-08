-- Generic exam management with immutable version snapshots and idempotent submissions.
CREATE TABLE "Exam" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" INTEGER NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Exam_createdById_status_idx" ON "Exam"("createdById","status");

CREATE TABLE "ExamVersion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "examId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "instructions" TEXT NOT NULL DEFAULT '',
  "durationMinutes" INTEGER NOT NULL,
  "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
  "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
  "publishedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamVersion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamVersion_examId_version_key" ON "ExamVersion"("examId","version");
CREATE INDEX "ExamVersion_examId_publishedAt_idx" ON "ExamVersion"("examId","publishedAt");

CREATE TABLE "ExamVersionQuestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "examVersionId" TEXT NOT NULL,
  "sourceQuestionId" INTEGER,
  "position" INTEGER NOT NULL,
  "subject" TEXT NOT NULL,
  "topic" TEXT,
  "text" TEXT NOT NULL,
  "options" TEXT NOT NULL,
  "correctIndex" INTEGER NOT NULL,
  "explanation" TEXT NOT NULL DEFAULT '',
  "marks" REAL NOT NULL DEFAULT 1,
  "negativeMarks" REAL NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExamVersionQuestion_examVersionId_fkey" FOREIGN KEY ("examVersionId") REFERENCES "ExamVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamVersionQuestion_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "Question" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamVersionQuestion_examVersionId_position_key" ON "ExamVersionQuestion"("examVersionId","position");
CREATE INDEX "ExamVersionQuestion_sourceQuestionId_idx" ON "ExamVersionQuestion"("sourceQuestionId");

CREATE TABLE "ExamAssignment" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "examVersionId" TEXT NOT NULL,
  "studentId" INTEGER NOT NULL,
  "assignedById" INTEGER NOT NULL,
  "assignedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "availableFrom" DATETIME,
  "dueAt" DATETIME,
  "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
  CONSTRAINT "ExamAssignment_examVersionId_fkey" FOREIGN KEY ("examVersionId") REFERENCES "ExamVersion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ExamAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamAssignment_examVersionId_studentId_key" ON "ExamAssignment"("examVersionId","studentId");
CREATE INDEX "ExamAssignment_studentId_status_idx" ON "ExamAssignment"("studentId","status");
CREATE INDEX "ExamAssignment_assignedById_idx" ON "ExamAssignment"("assignedById");

CREATE TABLE "ExamSubmission" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "assignmentId" TEXT NOT NULL,
  "attemptUuid" TEXT NOT NULL,
  "startedAt" DATETIME NOT NULL,
  "submittedAt" DATETIME NOT NULL,
  "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "status" TEXT NOT NULL DEFAULT 'RECEIVED',
  "score" REAL,
  "maximumScore" REAL,
  CONSTRAINT "ExamSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ExamAssignment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamSubmission_assignmentId_key" ON "ExamSubmission"("assignmentId");
CREATE UNIQUE INDEX "ExamSubmission_attemptUuid_key" ON "ExamSubmission"("attemptUuid");
CREATE INDEX "ExamSubmission_receivedAt_status_idx" ON "ExamSubmission"("receivedAt","status");

CREATE TABLE "ExamSubmissionAnswer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "submissionId" TEXT NOT NULL,
  "examQuestionId" TEXT NOT NULL,
  "selectedIndex" INTEGER,
  "isCorrect" BOOLEAN NOT NULL,
  "awardedMarks" REAL NOT NULL,
  CONSTRAINT "ExamSubmissionAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ExamSubmission" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ExamSubmissionAnswer_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamVersionQuestion" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ExamSubmissionAnswer_submissionId_examQuestionId_key" ON "ExamSubmissionAnswer"("submissionId","examQuestionId");
CREATE INDEX "ExamSubmissionAnswer_examQuestionId_idx" ON "ExamSubmissionAnswer"("examQuestionId");
