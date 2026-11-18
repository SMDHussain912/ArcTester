import * as Crypto from "expo-crypto";
import * as SQLite from "expo-sqlite";
import { monotonicNow } from "./clock";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;
let configuredUserId: string | null = null;

export function configureOfflineStore(userId: string): void {
  if (!userId) throw new Error("A signed-in user is required for offline storage.");
  if (configuredUserId !== userId) {
    configuredUserId = userId;
    dbPromise = SQLite.openDatabaseAsync("arctester-offline-" + userId + ".db");
  }
}

export type OfflineExamQuestion = {
  id: string;
  position: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
  marks: number;
  negativeMarks: number;
};

export type OfflineExamPackage = {
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
  questions: OfflineExamQuestion[];
};

export type OfflineAnswer = {
  examQuestionId: string;
  selectedIndex: number | null;
};

export type PendingAttempt = {
  assignmentId: string;
  attemptUuid: string;
  startedAt: string;
  submittedAt: string;
  answers: OfflineAnswer[];
};

type AttemptRow = {
  assignmentId: string;
  attemptUuid: string;
  startedAt: string;
  startedAtMonotonicMs: number;
  submittedAt: string | null;
  answersJson: string;
  status: "ACTIVE" | "PENDING" | "SYNCED";
  submissionId: string | null;
  lastError: string | null;
  updatedAt: string;
};

const databaseInitializations = new WeakMap<SQLite.SQLiteDatabase, Promise<void>>();

async function database() {
  if (!dbPromise) {
    throw new Error("Offline storage has not been configured for this account.");
  }
  const db = await dbPromise;
  let initialization = databaseInitializations.get(db);
  if (!initialization) {
    initialization = db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS exam_packages (
        assignment_id TEXT PRIMARY KEY NOT NULL,
        payload_json TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        downloaded_at TEXT NOT NULL,
        server_offset_ms REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS offline_attempts (
        assignment_id TEXT PRIMARY KEY NOT NULL,
        attempt_uuid TEXT NOT NULL UNIQUE,
        started_at TEXT NOT NULL,
        started_at_monotonic_ms INTEGER NOT NULL DEFAULT 0,
        submitted_at TEXT,
        answers_json TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('ACTIVE', 'PENDING', 'SYNCED')),
        submission_id TEXT,
        last_error TEXT,
        updated_at TEXT NOT NULL
      );
    `);
    databaseInitializations.set(db, initialization);
  }
  await initialization;
  return db;
}

function parsePackage(raw: string): OfflineExamPackage {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("The downloaded exam package is invalid JSON.");
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The downloaded exam package is invalid.");
  }
  const candidate = value as Partial<OfflineExamPackage>;
  const validDateOrNull = (date: unknown) =>
    date === null || (typeof date === "string" && Number.isFinite(Date.parse(date)));
  if (
    typeof candidate.assignmentId !== "string" || !candidate.assignmentId.trim() ||
    typeof candidate.examId !== "string" || !candidate.examId.trim() ||
    typeof candidate.title !== "string" || !candidate.title.trim() ||
    typeof candidate.description !== "string" ||
    typeof candidate.instructions !== "string" ||
    !Number.isInteger(candidate.version) || (candidate.version ?? 0) < 1 ||
    typeof candidate.serverTime !== "string" || !Number.isFinite(Date.parse(candidate.serverTime)) ||
    !Number.isInteger(candidate.durationMinutes) || (candidate.durationMinutes ?? 0) < 1 ||
    !validDateOrNull(candidate.availableFrom) ||
    !validDateOrNull(candidate.dueAt) ||
    !Array.isArray(candidate.questions) || candidate.questions.length === 0 ||
    candidate.questions.length > 500
  ) {
    throw new Error("The downloaded exam package is invalid.");
  }

  const ids = new Set<string>();
  for (const question of candidate.questions) {
    if (
      !question || typeof question !== "object" ||
      typeof question.id !== "string" || !question.id.trim() || ids.has(question.id) ||
      !Number.isInteger(question.position) || question.position < 0 ||
      typeof question.subject !== "string" || !question.subject.trim() ||
      !(question.topic === null || typeof question.topic === "string") ||
      typeof question.text !== "string" || !question.text.trim() ||
      !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 4 ||
      question.options.some((option) => typeof option !== "string" || !option.trim()) ||
      !Number.isFinite(question.marks) || question.marks <= 0 ||
      !Number.isFinite(question.negativeMarks) || question.negativeMarks < 0
    ) {
      throw new Error("The downloaded exam package contains an invalid question.");
    }
    ids.add(question.id);
  }

  return candidate as OfflineExamPackage;
}

export async function saveExamPackage(
  examPackage: OfflineExamPackage,
  expectedSha256: string,
): Promise<void> {
  const serialized = JSON.stringify(examPackage);
  const actualSha256 = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    serialized,
  );
  if (actualSha256.toLowerCase() !== expectedSha256.toLowerCase()) {
    throw new Error("Exam package integrity check failed. Download it again.");
  }
  parsePackage(serialized);

  const downloadedAt = new Date();
  const serverTime = new Date(examPackage.serverTime);
  if (!Number.isFinite(serverTime.getTime())) {
    throw new Error("The exam package has an invalid server timestamp.");
  }
  const db = await database();
  const existingAttempt = await db.getFirstAsync<{ status: string }>(
    "SELECT status FROM offline_attempts WHERE assignment_id = ?",
    examPackage.assignmentId,
  );
  if (existingAttempt) {
    throw new Error("This assignment already has a local attempt and cannot be replaced.");
  }

  await db.runAsync(
    `INSERT INTO exam_packages
      (assignment_id, payload_json, sha256, downloaded_at, server_offset_ms)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(assignment_id) DO UPDATE SET
        payload_json = excluded.payload_json,
        sha256 = excluded.sha256,
        downloaded_at = excluded.downloaded_at,
        server_offset_ms = excluded.server_offset_ms`,
    examPackage.assignmentId,
    serialized,
    actualSha256,
    downloadedAt.toISOString(),
    serverTime.getTime() - downloadedAt.getTime(),
  );
}

export async function getCachedExamPackage(
  assignmentId: string,
): Promise<OfflineExamPackage | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ payload_json: string }>(
    "SELECT payload_json FROM exam_packages WHERE assignment_id = ?",
    assignmentId,
  );
  return row ? parsePackage(row.payload_json) : null;
}

export async function listCachedExamPackages(): Promise<OfflineExamPackage[]> {
  const db = await database();
  const rows = await db.getAllAsync<{ payload_json: string }>(
    "SELECT payload_json FROM exam_packages ORDER BY downloaded_at DESC",
  );
  return rows.map((row) => parsePackage(row.payload_json));
}

export async function startOfflineAttempt(assignmentId: string): Promise<{
  attemptUuid: string;
  startedAt: string;
  examPackage: OfflineExamPackage;
}> {
  const db = await database();
  const row = await db.getFirstAsync<{
    payload_json: string;
    server_offset_ms: number;
  }>(
    "SELECT payload_json, server_offset_ms FROM exam_packages WHERE assignment_id = ?",
    assignmentId,
  );
  if (!row) throw new Error("Download this exam before starting it.");

  const examPackage = parsePackage(row.payload_json);
  const existing = await db.getFirstAsync<AttemptRow>(
    "SELECT assignment_id AS assignmentId, attempt_uuid AS attemptUuid, started_at AS startedAt, started_at_monotonic_ms AS startedAtMonotonicMs, submitted_at AS submittedAt, answers_json AS answersJson, status, submission_id AS submissionId, last_error AS lastError FROM offline_attempts WHERE assignment_id = ?",
    assignmentId,
  );
  if (existing) {
    if (existing.status === "ACTIVE") {
      // An already-started attempt must remain resumable even after its assignment deadline.
      return {
        attemptUuid: existing.attemptUuid,
        startedAt: existing.startedAt,
        examPackage,
      };
    }
    throw new Error("An attempt for this assignment has already been submitted or synchronized.");
  }

  const adjustedNow = Date.now() + row.server_offset_ms;
  if (examPackage.availableFrom && adjustedNow < new Date(examPackage.availableFrom).getTime()) {
    throw new Error("This exam is not available yet.");
  }
  if (examPackage.dueAt && adjustedNow > new Date(examPackage.dueAt).getTime()) {
    throw new Error("The exam deadline has passed.");
  }

  const attemptUuid = Crypto.randomUUID();
  const startedAtMonotonicMs = monotonicNow();
  // Use the server-adjusted clock captured when the package was downloaded.
  // This keeps the local deadline consistent when the device clock is inaccurate.
  const startedAt = new Date(Date.now() + row.server_offset_ms).toISOString();
  await db.runAsync(
    `INSERT INTO offline_attempts
      (assignment_id, attempt_uuid, started_at, started_at_monotonic_ms, answers_json, status, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    assignmentId,
    attemptUuid,
    startedAt,
    startedAtMonotonicMs,
    JSON.stringify({}),
    "ACTIVE",
    new Date(startedAtMonotonicMs).toISOString(),
  );
  return { attemptUuid, startedAt, examPackage };
}

export async function restoreActiveAttempt(assignmentId: string): Promise<{
  attemptUuid: string;
  startedAt: string;
  answers: Record<string, number | null>;
} | null> {
  const db = await database();
  const row = await db.getFirstAsync<AttemptRow>(
    "SELECT assignment_id AS assignmentId, attempt_uuid AS attemptUuid, started_at AS startedAt, started_at_monotonic_ms AS startedAtMonotonicMs, submitted_at AS submittedAt, answers_json AS answersJson, status, submission_id AS submissionId, last_error AS lastError FROM offline_attempts WHERE assignment_id = ? AND status = 'ACTIVE'",
    assignmentId,
  );
  if (!row) return null;
  return {
    attemptUuid: row.attemptUuid,
    startedAt: row.startedAt,
    answers: JSON.parse(row.answersJson) as Record<string, number | null>,
  };
}

export async function saveOfflineAnswer(
  assignmentId: string,
  examQuestionId: string,
  selectedIndex: number | null,
): Promise<void> {
  const db = await database();
  const attempt = await db.getFirstAsync<AttemptRow>(
    "SELECT assignment_id AS assignmentId, attempt_uuid AS attemptUuid, started_at AS startedAt, started_at_monotonic_ms AS startedAtMonotonicMs, submitted_at AS submittedAt, answers_json AS answersJson, status, submission_id AS submissionId, last_error AS lastError FROM offline_attempts WHERE assignment_id = ? AND status = 'ACTIVE'",
    assignmentId,
  );
  if (!attempt) throw new Error("There is no active attempt to save.");

  const examPackage = await getCachedExamPackage(assignmentId);
  const question = examPackage?.questions.find((item) => item.id === examQuestionId);
  if (!question) throw new Error("The question does not belong to this exam.");
  if (
    selectedIndex !== null &&
    (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length)
  ) {
    throw new Error("The selected answer is outside the available options.");
  }

  const answers = JSON.parse(attempt.answersJson) as Record<string, number | null>;
  answers[examQuestionId] = selectedIndex;
  await db.runAsync(
    "UPDATE offline_attempts SET answers_json = ?, updated_at = ? WHERE assignment_id = ? AND status = 'ACTIVE'",
    JSON.stringify(answers),
    new Date().toISOString(),
    assignmentId,
  );
}

export async function getRemainingSeconds(assignmentId: string): Promise<number | null> {
  const db = await database();
  const attempt = await db.getFirstAsync<AttemptRow>(
    "SELECT assignment_id AS assignmentId, attempt_uuid AS attemptUuid, started_at AS startedAt, started_at_monotonic_ms AS startedAtMonotonicMs, submitted_at AS submittedAt, answers_json AS answersJson, status, submission_id AS submissionId, last_error AS lastError, updated_at AS updatedAt FROM offline_attempts WHERE assignment_id = ? AND status = 'ACTIVE'",
    assignmentId,
  );
  if (!attempt) return null;
  const examPackage = await getCachedExamPackage(assignmentId);
  if (!examPackage) return null;
  // Persist the greatest observed local timestamp so a process restart cannot
  // reset the in-memory clock clamp. If the device clock is moved backwards
  // while the app is closed, the timer pauses at the last checkpoint until the
  // clock catches up; it never grants extra exam time.
  const lastObservedAt = Date.parse(attempt.updatedAt);
  const now = monotonicNow();
  const observedNow = Number.isFinite(lastObservedAt) ? Math.max(now, lastObservedAt) : now;
  if (!Number.isFinite(lastObservedAt) || observedNow > lastObservedAt) {
    await db.runAsync(
      "UPDATE offline_attempts SET updated_at = ? WHERE assignment_id = ? AND status = 'ACTIVE'",
      new Date(observedNow).toISOString(),
      assignmentId,
    );
  }
  const elapsed = Math.max(0, observedNow - attempt.startedAtMonotonicMs);
  return Math.max(0, examPackage.durationMinutes * 60 - Math.floor(elapsed / 1000));
}

export async function queueOfflineSubmission(
  assignmentId: string,
): Promise<PendingAttempt> {
  const db = await database();
  const attempt = await db.getFirstAsync<AttemptRow>(
    "SELECT assignment_id AS assignmentId, attempt_uuid AS attemptUuid, started_at AS startedAt, started_at_monotonic_ms AS startedAtMonotonicMs, submitted_at AS submittedAt, answers_json AS answersJson, status, submission_id AS submissionId, last_error AS lastError FROM offline_attempts WHERE assignment_id = ?",
    assignmentId,
  );
  if (!attempt) throw new Error("There is no saved attempt for this assignment.");
  if (attempt.status === "SYNCED") throw new Error("This attempt has already been synchronized.");

  const examPackage = await getCachedExamPackage(assignmentId);
  if (!examPackage) throw new Error("The cached exam package is missing.");
  const savedAnswers = JSON.parse(attempt.answersJson) as Record<string, number | null>;
  const expectedIds = new Set(examPackage.questions.map((question) => question.id));
  const hasUnknownAnswers = Object.keys(savedAnswers).some((id) => !expectedIds.has(id));
  const hasInvalidAnswers = examPackage.questions.some((question) => {
    const selectedIndex = savedAnswers[question.id];
    return selectedIndex !== undefined &&
      selectedIndex !== null &&
      (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length);
  });
  if (hasUnknownAnswers || hasInvalidAnswers) {
    throw new Error("The saved answers contain invalid question or option data. Reopen the exam and review your answers before submitting.");
  }

  const submittedAt = attempt.submittedAt ?? new Date().toISOString();
  if (attempt.status === "ACTIVE") {
    await db.runAsync(
      "UPDATE offline_attempts SET submitted_at = ?, status = 'PENDING', last_error = NULL, updated_at = ? WHERE assignment_id = ? AND status = 'ACTIVE'",
      submittedAt,
      new Date().toISOString(),
      assignmentId,
    );
  }

  return {
    assignmentId,
    attemptUuid: attempt.attemptUuid,
    startedAt: attempt.startedAt,
    submittedAt,
    answers: examPackage.questions.map((question) => ({
      examQuestionId: question.id,
      selectedIndex: savedAnswers[question.id] ?? null,
    })),
  };
}

export async function getPendingSubmissions(): Promise<PendingAttempt[]> {
  const db = await database();
  const rows = await db.getAllAsync<AttemptRow>(
    "SELECT assignment_id AS assignmentId, attempt_uuid AS attemptUuid, started_at AS startedAt, started_at_monotonic_ms AS startedAtMonotonicMs, submitted_at AS submittedAt, answers_json AS answersJson, status, submission_id AS submissionId, last_error AS lastError FROM offline_attempts WHERE status = 'PENDING' ORDER BY updated_at ASC",
  );
  const pending: PendingAttempt[] = [];
  for (const row of rows) {
    const examPackage = await getCachedExamPackage(row.assignmentId);
    if (!examPackage) {
      throw new Error(
        `The saved exam package for pending assignment ${row.assignmentId} is missing. Its submission remains on this device and needs recovery.`,
      );
    }
    if (!row.submittedAt) {
      throw new Error(
        `The pending submission for assignment ${row.assignmentId} has no submission timestamp. It remains on this device and needs recovery.`,
      );
    }

    let savedAnswers: Record<string, number | null>;
    try {
      savedAnswers = JSON.parse(row.answersJson) as Record<string, number | null>;
    } catch {
      throw new Error(
        `The saved answers for pending assignment ${row.assignmentId} are corrupted. The submission was not uploaded.`,
      );
    }

    const questionIds = new Set(examPackage.questions.map((question) => question.id));
    const hasUnknownQuestion = Object.keys(savedAnswers).some((id) => !questionIds.has(id));
    const hasInvalidOption = examPackage.questions.some((question) => {
      const selectedIndex = savedAnswers[question.id];
      return selectedIndex !== undefined &&
        selectedIndex !== null &&
        (!Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex >= question.options.length);
    });
    if (hasUnknownQuestion || hasInvalidOption) {
      throw new Error(
        `The saved answers for pending assignment ${row.assignmentId} failed integrity validation. The submission was not uploaded.`,
      );
    }

    pending.push({
      assignmentId: row.assignmentId,
      attemptUuid: row.attemptUuid,
      startedAt: row.startedAt,
      submittedAt: row.submittedAt,
      answers: examPackage.questions.map((question) => ({
        examQuestionId: question.id,
        selectedIndex: savedAnswers[question.id] ?? null,
      })),
    });
  }
  return pending;
}

export async function markSubmissionSynced(
  assignmentId: string,
  submissionId: string,
): Promise<void> {
  const db = await database();
  await db.runAsync(
    "UPDATE offline_attempts SET status = 'SYNCED', submission_id = ?, last_error = NULL, updated_at = ? WHERE assignment_id = ? AND status = 'PENDING'",
    submissionId,
    new Date().toISOString(),
    assignmentId,
  );
}

export async function keepSubmissionPending(
  assignmentId: string,
  message: string,
): Promise<void> {
  const db = await database();
  await db.runAsync(
    "UPDATE offline_attempts SET last_error = ?, updated_at = ? WHERE assignment_id = ? AND status = 'PENDING'",
    message.slice(0, 500),
    new Date().toISOString(),
    assignmentId,
  );
}
