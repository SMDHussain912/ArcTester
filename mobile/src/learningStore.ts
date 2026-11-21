import * as SQLite from "expo-sqlite";

export type OfflineLearningQuestion = {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
  difficulty: string;
};
export type OfflineLearningPackage = {
  schemaVersion: 2 | 3;
  practiceOnly?: true;
  exportedAt: string;
  total: number;
  subjects: string[];
  questions: OfflineLearningQuestion[];
};

const databases = new Map<string, Promise<SQLite.SQLiteDatabase>>();

async function database(userId: string) {
  if (!userId.trim()) throw new Error("A signed-in account is required for offline learning data.");
  let pending = databases.get(userId);
  if (!pending) {
    pending = SQLite.openDatabaseAsync("arctester-learning-" + userId + ".db");
    databases.set(userId, pending);
  }
  const db = await pending;
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS offline_learning_package (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      payload_json TEXT NOT NULL,
      downloaded_at TEXT NOT NULL
    );
  `);
  return db;
}

export function validateOfflineLearningPackage(value: unknown): OfflineLearningPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The offline question bank is invalid.");
  }
  const item = value as Partial<OfflineLearningPackage>;
  if (
    (item.schemaVersion !== 2 && item.schemaVersion !== 3) ||
    (item.schemaVersion === 3 && item.practiceOnly !== true) ||
    typeof item.exportedAt !== "string" || !Number.isFinite(Date.parse(item.exportedAt)) ||
    !Array.isArray(item.subjects) || item.subjects.some((subject) => typeof subject !== "string") ||
    !Array.isArray(item.questions) || item.questions.length > 100000 ||
    item.total !== item.questions.length
  ) throw new Error("The offline question bank has an unsupported or incomplete format.");

  const ids = new Set<number>();
  for (const question of item.questions) {
    if (
      !question || !Number.isSafeInteger(question.id) || question.id <= 0 || ids.has(question.id) ||
      typeof question.subject !== "string" || !question.subject.trim() ||
      !(question.topic === null || typeof question.topic === "string") ||
      typeof question.text !== "string" || !question.text.trim() ||
      Object.prototype.hasOwnProperty.call(question, "correctIndex") ||
      Object.prototype.hasOwnProperty.call(question, "explanation") ||
      !Array.isArray(question.options) || question.options.length < 2 || question.options.length > 4 ||
      question.options.some((option) => typeof option !== "string" || !option.trim()) ||
      typeof question.difficulty !== "string"
    ) throw new Error("The offline question bank contains an invalid question.");
    ids.add(question.id);
  }
  return item as OfflineLearningPackage;
}

export async function saveOfflineLearningPackage(userId: string, value: unknown): Promise<void> {
  const pack = validateOfflineLearningPackage(value);
  const db = await database(userId);
  await db.runAsync(
    "INSERT INTO offline_learning_package (id, payload_json, downloaded_at) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET payload_json = excluded.payload_json, downloaded_at = excluded.downloaded_at",
    JSON.stringify(pack),
    new Date().toISOString(),
  );
}

export async function getOfflineLearningPackage(userId: string): Promise<OfflineLearningPackage | null> {
  const db = await database(userId);
  const row = await db.getFirstAsync<{ payload_json: string }>(
    "SELECT payload_json FROM offline_learning_package WHERE id = 1",
  );
  if (!row) return null;
  try { return validateOfflineLearningPackage(JSON.parse(row.payload_json)); }
  catch { throw new Error("The saved offline question bank is damaged. Download it again."); }
}

export async function clearOfflineLearningPackage(userId: string): Promise<void> {
  const db = await database(userId);
  await db.runAsync("DELETE FROM offline_learning_package WHERE id = 1");
}

