import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";

const DATABASE_NAME = "arctester-offline.db";

export type ExamPackageQuestion = {
  id: string;
  position: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
  marks: number;
  negativeMarks: number;
};

export type ExamPackage = {
  assignmentId: string;
  examId: string;
  title: string;
  description: string;
  version: number;
  instructions: string;
  durationMinutes: number;
  availableFrom: string | null;
  dueAt: string | null;
  serverTime: string;
  questions: ExamPackageQuestion[];
};

export type CachedExam = {
  package: ExamPackage;
  sha256: string;
  downloadedAt: string;
  serverOffsetMs: number;
};

export type OfflineAnswer = {
  examQuestionId: string;
  selectedIndex: number | null;
};

export type PendingSubmission = {
  assignmentId: string;
  attemptUuid: string;
  startedAt: string;
  submittedAt: string;
  answers: OfflineAnswer[];
};

export type StoredOfflineAttempt = {
  assignmentId: string;
  attemptUuid: string;
  startedAt: string;
  submittedAt: string | null;
  answers: OfflineAnswer[];
  syncStatus: "IN_PROGRESS" | "PENDING" | "SYNC_ERROR" | "SYNCED";
  lastError: string | null;
};

type AttemptRow = {
  assignment_id: string;
  attempt_uuid: string;
  started_at: string;
  submitted_at: string | null;
  answers_json: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | undefined;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS exam_packages (
          assignment_id TEXT PRIMARY KEY NOT NULL,
          package_json TEXT NOT NULL,
          sha256 TEXT NOT NULL,
          downloaded_at TEXT NOT NULL,
          server_offset_ms REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS offline_attempts (
          assignment_id TEXT PRIMARY KEY NOT NULL,
          attempt_uuid TEXT UNIQUE NOT NULL,
          started_at TEXT NOT NULL,
          submitted_at TEXT,
          answers_json TEXT NOT NULL DEFAULT '[]',
          sync_status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
          server_submission_id TEXT,
          last_error TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return databasePromise;
}

export async function verifyExamPackage(
  examPackage: ExamPackage,
  expectedSha256: string
): Promise<boolean> {
  const actual = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    JSON.stringify(examPackage)
  );
  return actual.toLowerCase() === expectedSha256.toLowerCase();
}

export async function cacheExamPackage(
  examPackage: ExamPackage,
  expectedSha256: string
): Promise<CachedExam> {
  if (!(await verifyExamPackage(examPackage, expectedSha256))) {
    throw new Error("The downloaded exam package failed its integrity check.");
  }

  const downloadedAt = new Date().toISOString();
  const serverOffsetMs = new Date(examPackage.serverTime).getTime() - Date.now();
  if (!Number.isFinite(serverOffsetMs)) {
    throw new Error("The exam package contains an invalid server timestamp.");
  }

  const db = await database();
  await db.runAsync(
    `INSERT INTO exam_packages
      (assignment_id, package_json, sha256, downloaded_at, server_offset_ms)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(assignment_id) DO UPDATE SET
       package_json = excluded.package_json,
       sha256 = excluded.sha256,
       downloaded_at = excluded.downloaded_at,
       server_offset_ms = excluded.server_offset_ms`,
    examPackage.assignmentId,
    JSON.stringify(examPackage),
    expectedSha256.toLowerCase(),
    downloadedAt,
    serverOffsetMs
  );

  return {
    package: examPackage,
    sha256: expectedSha256.toLowerCase(),
    downloadedAt,
    serverOffsetMs,
  };
}

export async function listCachedExams(): Promise<CachedExam[]> {
  const db = await database();
  const rows = await db.getAllAsync<{
    package_json: string;
    sha256: string;
    downloaded_at: string;
    server_offset_ms: number;
  }>(
    `SELECT package_json, sha256, downloaded_at, server_offset_ms
     FROM exam_packages ORDER BY downloaded_at DESC`
  );
  return rows.map((row) => ({
    package: JSON.parse(row.package_json) as ExamPackage,
    sha256: row.sha256,
    downloadedAt: row.downloaded_at,
    serverOffsetMs: row.server_offset_ms,
  }));
}

export async function getCachedExam(assignmentId: string): Promise<CachedExam | null> {
  const db = await database();
  const row = await db.getFirstAsync<{
    package_json: string;
    sha256: string;
    downloaded_at: string;
    server_offset_ms: number;
  }>(
    `SELECT package_json, sha256, downloaded_at, server_offset_ms
     FROM exam_packages WHERE assignment_id = ?`,
    assignmentId
  );
  if (!row) return null;
  return {
    package: JSON.parse(row.package_json) as ExamPackage,
    sha256: row.sha256,
    downloadedAt: row.downloaded_at,
    serverOffsetMs: row.server_offset_ms,
  };
}

export async function startOfflineAttempt(assignmentId: string): Promise<string> {
  const cached = await getCachedExam(assignmentId);
  if (!cached) throw new Error("Download this exam before starting it.");

  const trustedNow = Date.now() + cached.serverOffsetMs;
  const availableFrom = cached.package.availableFrom
    ? new Date(cached.package.availableFrom).getTime()
    : null;
  const dueAt = cached.package.dueAt ? new Date(cached.package.dueAt).getTime() : null;

  if (availableFrom !== null && trustedNow < availableFrom) {
    throw new Error("This exam is not available yet.");
  }
  if (dueAt !== null && trustedNow > dueAt) {
    throw new Error("The deadline for this exam has passed.");
  }

  const db = await database();
  const existing = await db.getFirstAsync<{ attempt_uuid: string; sync_status: string }>(
    "SELECT attempt_uuid, sync_status FROM offline_attempts WHERE assignment_id = ?",
    assignmentId
  );
  if (existing) {
    if (existing.sync_status === "IN_PROGRESS") return existing.attempt_uuid;
    throw new Error("An attempt already exists for this assignment.");
  }

  const attemptUuid = Crypto.randomUUID();
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO offline_attempts
      (assignment_id, attempt_uuid, started_at, answers_json, sync_status, created_at, updated_at)
     VALUES (?, ?, ?, '[]', 'IN_PROGRESS', ?, ?)`,
    assignmentId,
    attemptUuid,
    now,
    now,
    now
  );
  return attemptUuid;
}


export async function getOfflineAttempt(
  assignmentId: string
): Promise<StoredOfflineAttempt | null> {
  const db = await database();
  const row = await db.getFirstAsync<{
    assignment_id: string;
    attempt_uuid: string;
    started_at: string;
    submitted_at: string | null;
    answers_json: string;
    sync_status: StoredOfflineAttempt["syncStatus"];
    last_error: string | null;
  }>(
    `SELECT assignment_id, attempt_uuid, started_at, submitted_at, answers_json,
            sync_status, last_error
     FROM offline_attempts WHERE assignment_id = ?`,
    assignmentId
  );
  if (!row) return null;
  return {
    assignmentId: row.assignment_id,
    attemptUuid: row.attempt_uuid,
    startedAt: row.started_at,
    submittedAt: row.submitted_at,
    answers: JSON.parse(row.answers_json) as OfflineAnswer[],
    syncStatus: row.sync_status,
    lastError: row.last_error,
  };
}

export async function saveOfflineAnswer(
  assignmentId: string,
  examQuestionId: string,
  selectedIndex: number | null
): Promise<void> {
  if (selectedIndex !== null && (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3)) {
    throw new Error("Selected option must be between 0 and 3.");
  }

  const db = await database();
  const attempt = await db.getFirstAsync<{ answers_json: string; sync_status: string }>(
    "SELECT answers_json, sync_status FROM offline_attempts WHERE assignment_id = ?",
    assignmentId
  );
  if (!attempt || attempt.sync_status !== "IN_PROGRESS") {
    throw new Error("There is no active attempt to save.");
  }

  const answers = JSON.parse(attempt.answers_json) as OfflineAnswer[];
  const existingIndex = answers.findIndex((answer) => answer.examQuestionId === examQuestionId);
  const answer = { examQuestionId, selectedIndex };
  if (existingIndex >= 0) answers[existingIndex] = answer;
  else answers.push(answer);

  await db.runAsync(
    "UPDATE offline_attempts SET answers_json = ?, updated_at = ? WHERE assignment_id = ?",
    JSON.stringify(answers),
    new Date().toISOString(),
    assignmentId
  );
}

export async function queueOfflineSubmission(assignmentId: string): Promise<PendingSubmission> {
  const cached = await getCachedExam(assignmentId);
  if (!cached) throw new Error("The cached exam package is missing.");

  const db = await database();
  const attempt = await db.getFirstAsync<AttemptRow & { sync_status: string }>(
    `SELECT assignment_id, attempt_uuid, started_at, submitted_at, answers_json, sync_status
     FROM offline_attempts WHERE assignment_id = ?`,
    assignmentId
  );
  if (!attempt) throw new Error("There is no attempt to submit.");
  if (attempt.sync_status === "SYNCED") throw new Error("This attempt has already been synchronized.");

  const answers = JSON.parse(attempt.answers_json) as OfflineAnswer[];
  const expectedIds = new Set(cached.package.questions.map((question) => question.id));
  if (
    answers.length !== expectedIds.size ||
    answers.some((answer) => !expectedIds.has(answer.examQuestionId))
  ) {
    throw new Error("Save an answer entry for every exam question before submitting.");
  }

  const submittedAt = attempt.submitted_at ?? new Date().toISOString();
  await db.runAsync(
    `UPDATE offline_attempts
     SET submitted_at = ?, sync_status = 'PENDING', last_error = NULL, updated_at = ?
     WHERE assignment_id = ?`,
    submittedAt,
    new Date().toISOString(),
    assignmentId
  );

  return {
    assignmentId,
    attemptUuid: attempt.attempt_uuid,
    startedAt: attempt.started_at,
    submittedAt,
    answers,
  };
}

export async function listPendingSubmissions(): Promise<PendingSubmission[]> {
  const db = await database();
  const rows = await db.getAllAsync<AttemptRow>(
    `SELECT assignment_id, attempt_uuid, started_at, submitted_at, answers_json
     FROM offline_attempts WHERE sync_status IN ('PENDING', 'SYNC_ERROR')
     ORDER BY created_at ASC`
  );
  return rows
    .filter((row): row is AttemptRow & { submitted_at: string } => row.submitted_at !== null)
    .map((row) => ({
      assignmentId: row.assignment_id,
      attemptUuid: row.attempt_uuid,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      answers: JSON.parse(row.answers_json) as OfflineAnswer[],
    }));
}

export async function markSubmissionSynced(
  assignmentId: string,
  serverSubmissionId: string
): Promise<void> {
  const db = await database();
  await db.runAsync(
    `UPDATE offline_attempts
     SET sync_status = 'SYNCED', server_submission_id = ?, last_error = NULL, updated_at = ?
     WHERE assignment_id = ?`,
    serverSubmissionId,
    new Date().toISOString(),
    assignmentId
  );
}

export async function markSubmissionSyncError(
  assignmentId: string,
  message: string
): Promise<void> {
  const db = await database();
  await db.runAsync(
    `UPDATE offline_attempts
     SET sync_status = 'SYNC_ERROR', last_error = ?, updated_at = ?
     WHERE assignment_id = ? AND sync_status != 'SYNCED'`,
    message.slice(0, 500),
    new Date().toISOString(),
    assignmentId
  );
}
