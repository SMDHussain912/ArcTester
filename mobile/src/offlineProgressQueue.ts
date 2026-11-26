import * as SQLite from "expo-sqlite";

export type PendingPracticeAnswer = { questionId: number; response?: unknown; selectedIndex?: number | null };
export type PendingPracticeProgress = {
  attemptId: number;
  answers: PendingPracticeAnswer[];
  currentQuestionIndex: number;
  revision: number;
  submitRequested: boolean;
  updatedAt: string;
};

type QueueInput = {
  attemptId: number;
  answers: PendingPracticeAnswer[];
  currentQuestionIndex: number;
  submitRequested?: boolean;
};

type QueueRow = {
  attempt_id: number;
  answers_json: string;
  current_question_index: number;
  revision: number;
  submit_requested: number;
  updated_at: string;
};

const databases = new Map<string, Promise<SQLite.SQLiteDatabase>>();

async function database(userId: string) {
  if (!userId.trim()) throw new Error("A signed-in account is required for offline progress.");
  let pending = databases.get(userId);
  if (!pending) {
    pending = SQLite.openDatabaseAsync("arctester-learning-" + userId + ".db");
    databases.set(userId, pending);
  }
  const db = await pending;
  await db.execAsync(`CREATE TABLE IF NOT EXISTS pending_practice_progress (
    attempt_id INTEGER PRIMARY KEY,
    answers_json TEXT NOT NULL,
    current_question_index INTEGER NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1,
    submit_requested INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );`);
  return db;
}

function validateInput(input: QueueInput): void {
  if (!Number.isSafeInteger(input.attemptId) || input.attemptId <= 0) throw new Error("Invalid practice attempt ID.");
  if (!Number.isSafeInteger(input.currentQuestionIndex) || input.currentQuestionIndex < 0) throw new Error("Invalid saved question position.");
  if (!Array.isArray(input.answers) || input.answers.length < 1 || input.answers.length > 200) throw new Error("Invalid pending practice answers.");
  const seen = new Set<number>();
  for (const answer of input.answers) {
    if (!Number.isSafeInteger(answer.questionId) || answer.questionId <= 0 || seen.has(answer.questionId)) throw new Error("Pending answers contain an invalid or duplicate question.");
    if (Object.prototype.hasOwnProperty.call(answer, "response")) {
      const response = answer.response;
      const validScalar = response === null
        || (typeof response === "string" && response.length <= 2000)
        || (typeof response === "number" && Number.isFinite(response));
      const validMulti = Array.isArray(response)
        && response.length <= 4
        && response.every((value) => Number.isInteger(value) && value >= 0 && value <= 3)
        && new Set(response).size === response.length;
      if (!validScalar && !validMulti) throw new Error("Pending answer response is invalid.");
    } else if (!(answer.selectedIndex === null || answer.selectedIndex === undefined || (Number.isInteger(answer.selectedIndex) && answer.selectedIndex >= 0 && answer.selectedIndex <= 3))) {
      throw new Error("Pending answer choice is invalid.");
    }
    seen.add(answer.questionId);
  }
}

function fromRow(row: QueueRow): PendingPracticeProgress {
  let answers: unknown;
  try { answers = JSON.parse(row.answers_json); } catch { throw new Error("Pending offline progress is damaged. Keep this device data and resume the attempt online."); }
  if (!Array.isArray(answers)) throw new Error("Pending offline progress is damaged. Keep this device data and resume the attempt online.");
  const value = {
    attemptId: row.attempt_id,
    answers: answers as PendingPracticeAnswer[],
    currentQuestionIndex: row.current_question_index,
    revision: row.revision,
    submitRequested: row.submit_requested === 1,
    updatedAt: row.updated_at,
  };
  validateInput(value);
  return value;
}

export async function queuePracticeProgress(userId: string, input: QueueInput): Promise<PendingPracticeProgress> {
  validateInput(input);
  const db = await database(userId);
  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO pending_practice_progress (attempt_id, answers_json, current_question_index, revision, submit_requested, updated_at)
     VALUES (?, ?, ?, 1, ?, ?)
     ON CONFLICT(attempt_id) DO UPDATE SET
       answers_json = excluded.answers_json,
       current_question_index = excluded.current_question_index,
       revision = pending_practice_progress.revision + 1,
       submit_requested = MAX(pending_practice_progress.submit_requested, excluded.submit_requested),
       updated_at = excluded.updated_at`,
    input.attemptId, JSON.stringify(input.answers), input.currentQuestionIndex, input.submitRequested ? 1 : 0, now,
  );
  const row = await db.getFirstAsync<QueueRow>("SELECT * FROM pending_practice_progress WHERE attempt_id = ?", input.attemptId);
  if (!row) throw new Error("Could not persist pending offline progress.");
  return fromRow(row);
}

export async function requestPracticeProgressSubmit(userId: string, attemptId: number): Promise<PendingPracticeProgress> {
  const db = await database(userId);
  await db.runAsync(
    "UPDATE pending_practice_progress SET submit_requested = 1, revision = revision + 1, updated_at = ? WHERE attempt_id = ?",
    new Date().toISOString(), attemptId,
  );
  const row = await db.getFirstAsync<QueueRow>("SELECT * FROM pending_practice_progress WHERE attempt_id = ?", attemptId);
  if (!row) throw new Error("Save your answers locally before requesting offline submission.");
  return fromRow(row);
}

export async function getPendingPracticeProgress(userId: string): Promise<PendingPracticeProgress[]> {
  const db = await database(userId);
  const rows = await db.getAllAsync<QueueRow>("SELECT * FROM pending_practice_progress ORDER BY updated_at ASC");
  return rows.map(fromRow);
}

/** Deletes only the exact revision that was sent, preserving newer edits made during sync. */
export async function markPracticeProgressSynced(userId: string, attemptId: number, revision: number): Promise<boolean> {
  const db = await database(userId);
  const result = await db.runAsync("DELETE FROM pending_practice_progress WHERE attempt_id = ? AND revision = ?", attemptId, revision);
  return result.changes === 1;
}

export async function clearPendingPracticeProgress(userId: string, attemptId: number): Promise<void> {
  const db = await database(userId);
  await db.runAsync("DELETE FROM pending_practice_progress WHERE attempt_id = ?", attemptId);
}
