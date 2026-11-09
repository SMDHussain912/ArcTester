-- CreateTable
CREATE TABLE "Subject" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Topic" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "subjectId" INTEGER NOT NULL,

    CONSTRAINT "Topic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" SERIAL NOT NULL,
    "subjectId" INTEGER NOT NULL,
    "topicId" INTEGER,
    "text" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT '',
    "difficulty" TEXT NOT NULL DEFAULT 'medium',
    "questionHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attempt" (
    "id" SERIAL NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'mock',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadline" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expired" BOOLEAN NOT NULL DEFAULT false,
    "userId" INTEGER NOT NULL,

    CONSTRAINT "Attempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STUDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "deviceName" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Exam" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdById" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Exam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamVersion" (
    "id" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "instructions" TEXT NOT NULL DEFAULT '',
    "durationMinutes" INTEGER NOT NULL,
    "shuffleQuestions" BOOLEAN NOT NULL DEFAULT false,
    "shuffleOptions" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamVersionQuestion" (
    "id" TEXT NOT NULL,
    "examVersionId" TEXT NOT NULL,
    "sourceQuestionId" INTEGER,
    "position" INTEGER NOT NULL,
    "subject" TEXT NOT NULL,
    "topic" TEXT,
    "text" TEXT NOT NULL,
    "options" TEXT NOT NULL,
    "correctIndex" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL DEFAULT '',
    "marks" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "negativeMarks" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamVersionQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAssignment" (
    "id" TEXT NOT NULL,
    "examVersionId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "assignedById" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableFrom" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',

    CONSTRAINT "ExamAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSubmission" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "attemptUuid" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "score" DOUBLE PRECISION,
    "maximumScore" DOUBLE PRECISION,

    CONSTRAINT "ExamSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSubmissionAnswer" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "examQuestionId" TEXT NOT NULL,
    "selectedIndex" INTEGER,
    "isCorrect" BOOLEAN NOT NULL,
    "awardedMarks" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ExamSubmissionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttemptAnswer" (
    "id" SERIAL NOT NULL,
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

    CONSTRAINT "AttemptAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stat" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "seen" INTEGER NOT NULL DEFAULT 0,
    "wrong" INTEGER NOT NULL DEFAULT 0,
    "lastSeen" TIMESTAMP(3),

    CONSTRAINT "Stat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdById" INTEGER NOT NULL,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnnouncementRead" (
    "announcementId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnnouncementRead_pkey" PRIMARY KEY ("announcementId","studentId")
);

-- CreateTable
CREATE TABLE "ExamSession" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "startedAt" TIMESTAMP(3),
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3),
    "pausedAt" TIMESTAMP(3),
    "pausedDurationMs" INTEGER NOT NULL DEFAULT 0,
    "answersRevision" INTEGER NOT NULL DEFAULT 0,
    "endedAt" TIMESTAMP(3),
    "heartbeatCount" INTEGER NOT NULL DEFAULT 0,
    "focusLossCount" INTEGER NOT NULL DEFAULT 0,
    "disconnectCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSessionEvent" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "actorId" INTEGER,
    "type" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamSessionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamSessionAnswer" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "examQuestionId" TEXT NOT NULL,
    "selectedIndex" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExamSessionAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegisteredModel" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "algorithm" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "dataset" TEXT NOT NULL,
    "trainingDatasetId" TEXT,
    "artifactJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activatedAt" TIMESTAMP(3),

    CONSTRAINT "RegisteredModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelRegistryAudit" (
    "id" TEXT NOT NULL,
    "actorId" INTEGER,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelRegistryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelEvaluation" (
    "id" TEXT NOT NULL,
    "actorId" INTEGER,
    "modelId" TEXT NOT NULL,
    "candidateVersion" INTEGER NOT NULL,
    "baselineVersion" INTEGER NOT NULL,
    "datasetId" TEXT NOT NULL DEFAULT '',
    "evaluationDataset" TEXT NOT NULL,
    "datasetFingerprint" TEXT NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "metricsJson" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelDataset" (
    "id" TEXT NOT NULL,
    "createdById" INTEGER,
    "name" TEXT NOT NULL,
    "task" TEXT NOT NULL,
    "targetColumn" TEXT NOT NULL DEFAULT 'target',
    "featureSchemaJson" TEXT NOT NULL,
    "samplesJson" TEXT NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "sourceDescription" TEXT NOT NULL,
    "sourceAttested" BOOLEAN NOT NULL DEFAULT false,
    "datasetKind" TEXT NOT NULL DEFAULT 'synthetic',
    "fingerprint" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelDriftBucket" (
    "id" TEXT NOT NULL,
    "modelId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "featureName" TEXT NOT NULL,
    "bucket" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ModelDriftBucket_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subject_name_key" ON "Subject"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Topic_subjectId_name_key" ON "Topic"("subjectId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Question_questionHash_key" ON "Question"("questionHash");

-- CreateIndex
CREATE INDEX "Question_subjectId_idx" ON "Question"("subjectId");

-- CreateIndex
CREATE INDEX "Attempt_userId_idx" ON "Attempt"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_expiresAt_idx" ON "Invitation"("email", "expiresAt");

-- CreateIndex
CREATE INDEX "Invitation_createdById_idx" ON "Invitation"("createdById");

-- CreateIndex
CREATE INDEX "Device_userId_revokedAt_idx" ON "Device"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Device_userId_fingerprint_key" ON "Device"("userId", "fingerprint");

-- CreateIndex
CREATE INDEX "Exam_createdById_status_idx" ON "Exam"("createdById", "status");

-- CreateIndex
CREATE INDEX "ExamVersion_examId_publishedAt_idx" ON "ExamVersion"("examId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamVersion_examId_version_key" ON "ExamVersion"("examId", "version");

-- CreateIndex
CREATE INDEX "ExamVersionQuestion_sourceQuestionId_idx" ON "ExamVersionQuestion"("sourceQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamVersionQuestion_examVersionId_position_key" ON "ExamVersionQuestion"("examVersionId", "position");

-- CreateIndex
CREATE INDEX "ExamAssignment_studentId_status_idx" ON "ExamAssignment"("studentId", "status");

-- CreateIndex
CREATE INDEX "ExamAssignment_assignedById_idx" ON "ExamAssignment"("assignedById");

-- CreateIndex
CREATE UNIQUE INDEX "ExamAssignment_examVersionId_studentId_key" ON "ExamAssignment"("examVersionId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubmission_assignmentId_key" ON "ExamSubmission"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubmission_attemptUuid_key" ON "ExamSubmission"("attemptUuid");

-- CreateIndex
CREATE INDEX "ExamSubmission_receivedAt_status_idx" ON "ExamSubmission"("receivedAt", "status");

-- CreateIndex
CREATE INDEX "ExamSubmissionAnswer_examQuestionId_idx" ON "ExamSubmissionAnswer"("examQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSubmissionAnswer_submissionId_examQuestionId_key" ON "ExamSubmissionAnswer"("submissionId", "examQuestionId");

-- CreateIndex
CREATE INDEX "AttemptAnswer_attemptId_idx" ON "AttemptAnswer"("attemptId");

-- CreateIndex
CREATE INDEX "AttemptAnswer_questionId_idx" ON "AttemptAnswer"("questionId");

-- CreateIndex
CREATE INDEX "Stat_questionId_idx" ON "Stat"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Stat_userId_questionId_key" ON "Stat"("userId", "questionId");

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_expiresAt_idx" ON "Announcement"("publishedAt", "expiresAt");

-- CreateIndex
CREATE INDEX "Announcement_createdById_idx" ON "Announcement"("createdById");

-- CreateIndex
CREATE INDEX "AnnouncementRead_studentId_seenAt_idx" ON "AnnouncementRead"("studentId", "seenAt");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSession_assignmentId_key" ON "ExamSession"("assignmentId");

-- CreateIndex
CREATE INDEX "ExamSession_status_lastHeartbeatAt_idx" ON "ExamSession"("status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "ExamSession_studentId_status_idx" ON "ExamSession"("studentId", "status");

-- CreateIndex
CREATE INDEX "ExamSessionEvent_sessionId_createdAt_idx" ON "ExamSessionEvent"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ExamSessionEvent_actorId_idx" ON "ExamSessionEvent"("actorId");

-- CreateIndex
CREATE INDEX "ExamSessionAnswer_examQuestionId_idx" ON "ExamSessionAnswer"("examQuestionId");

-- CreateIndex
CREATE UNIQUE INDEX "ExamSessionAnswer_sessionId_examQuestionId_key" ON "ExamSessionAnswer"("sessionId", "examQuestionId");

-- CreateIndex
CREATE INDEX "RegisteredModel_modelId_isActive_idx" ON "RegisteredModel"("modelId", "isActive");

-- CreateIndex
CREATE INDEX "RegisteredModel_createdAt_idx" ON "RegisteredModel"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RegisteredModel_modelId_version_key" ON "RegisteredModel"("modelId", "version");

-- CreateIndex
CREATE INDEX "ModelRegistryAudit_modelId_version_createdAt_idx" ON "ModelRegistryAudit"("modelId", "version", "createdAt");

-- CreateIndex
CREATE INDEX "ModelRegistryAudit_actorId_createdAt_idx" ON "ModelRegistryAudit"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "ModelEvaluation_modelId_candidateVersion_evaluatedAt_idx" ON "ModelEvaluation"("modelId", "candidateVersion", "evaluatedAt");

-- CreateIndex
CREATE INDEX "ModelEvaluation_actorId_evaluatedAt_idx" ON "ModelEvaluation"("actorId", "evaluatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelDataset_fingerprint_key" ON "ModelDataset"("fingerprint");

-- CreateIndex
CREATE INDEX "ModelDataset_name_createdAt_idx" ON "ModelDataset"("name", "createdAt");

-- CreateIndex
CREATE INDEX "ModelDataset_createdById_createdAt_idx" ON "ModelDataset"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "ModelDriftBucket_modelId_version_periodStart_idx" ON "ModelDriftBucket"("modelId", "version", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ModelDriftBucket_modelId_version_featureName_bucket_periodS_key" ON "ModelDriftBucket"("modelId", "version", "featureName", "bucket", "periodStart");

-- AddForeignKey
ALTER TABLE "Topic" ADD CONSTRAINT "Topic_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "Subject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attempt" ADD CONSTRAINT "Attempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Exam" ADD CONSTRAINT "Exam_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamVersion" ADD CONSTRAINT "ExamVersion_examId_fkey" FOREIGN KEY ("examId") REFERENCES "Exam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamVersionQuestion" ADD CONSTRAINT "ExamVersionQuestion_examVersionId_fkey" FOREIGN KEY ("examVersionId") REFERENCES "ExamVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamVersionQuestion" ADD CONSTRAINT "ExamVersionQuestion_sourceQuestionId_fkey" FOREIGN KEY ("sourceQuestionId") REFERENCES "Question"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAssignment" ADD CONSTRAINT "ExamAssignment_examVersionId_fkey" FOREIGN KEY ("examVersionId") REFERENCES "ExamVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAssignment" ADD CONSTRAINT "ExamAssignment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAssignment" ADD CONSTRAINT "ExamAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubmission" ADD CONSTRAINT "ExamSubmission_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ExamAssignment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubmissionAnswer" ADD CONSTRAINT "ExamSubmissionAnswer_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "ExamSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSubmissionAnswer" ADD CONSTRAINT "ExamSubmissionAnswer_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamVersionQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttemptAnswer" ADD CONSTRAINT "AttemptAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stat" ADD CONSTRAINT "Stat_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stat" ADD CONSTRAINT "Stat_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_announcementId_fkey" FOREIGN KEY ("announcementId") REFERENCES "Announcement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnnouncementRead" ADD CONSTRAINT "AnnouncementRead_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "ExamAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSession" ADD CONSTRAINT "ExamSession_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSessionEvent" ADD CONSTRAINT "ExamSessionEvent_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSessionEvent" ADD CONSTRAINT "ExamSessionEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSessionAnswer" ADD CONSTRAINT "ExamSessionAnswer_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ExamSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamSessionAnswer" ADD CONSTRAINT "ExamSessionAnswer_examQuestionId_fkey" FOREIGN KEY ("examQuestionId") REFERENCES "ExamVersionQuestion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelRegistryAudit" ADD CONSTRAINT "ModelRegistryAudit_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelEvaluation" ADD CONSTRAINT "ModelEvaluation_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ModelDataset" ADD CONSTRAINT "ModelDataset_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

