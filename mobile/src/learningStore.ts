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
    CREATE TABLE IF NOT EXISTS offline_study_material (
      material_id TEXT PRIMARY KEY,
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


export type OfflineStudyMaterial = {
  id: string;
  title: string;
  description: string;
  subject: string;
  topic: string;
  fileName: string;
  mimeType: "text/plain" | "text/markdown";
  sizeBytes: number;
  content: string;
  downloadedAt: string;
};

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}

export function validateOfflineStudyMaterial(value: unknown): OfflineStudyMaterial {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The offline study material is invalid.");
  }
  const item = value as Partial<OfflineStudyMaterial>;
  if (
    typeof item.id !== "string" || !item.id.trim() || item.id.length > 64 ||
    typeof item.title !== "string" || !item.title.trim() ||
    typeof item.description !== "string" ||
    typeof item.subject !== "string" || !item.subject.trim() ||
    typeof item.topic !== "string" ||
    typeof item.fileName !== "string" || !item.fileName.trim() ||
    (item.mimeType !== "text/plain" && item.mimeType !== "text/markdown") ||
    !Number.isSafeInteger(item.sizeBytes) || (item.sizeBytes ?? 0) < 1 || (item.sizeBytes ?? 0) > 8 * 1024 * 1024 ||
    typeof item.content !== "string" || !item.content.length ||
    (typeof item.sizeBytes === "number" && typeof item.content === "string" && utf8ByteLength(item.content) !== item.sizeBytes) ||
    typeof item.downloadedAt !== "string" || !Number.isFinite(Date.parse(item.downloadedAt))
  ) throw new Error("The offline study material has an unsupported or incomplete format.");
  return item as OfflineStudyMaterial;
}

export async function saveOfflineStudyMaterial(userId: string, value: unknown): Promise<OfflineStudyMaterial> {
  const material = validateOfflineStudyMaterial(value);
  const db = await database(userId);
  const saved = { ...material, downloadedAt: new Date().toISOString() };
  await db.runAsync(
    "INSERT INTO offline_study_material (material_id, payload_json, downloaded_at) VALUES (?, ?, ?) ON CONFLICT(material_id) DO UPDATE SET payload_json = excluded.payload_json, downloaded_at = excluded.downloaded_at",
    material.id,
    JSON.stringify(saved),
    saved.downloadedAt,
  );
  return saved;
}

export async function getOfflineStudyMaterials(userId: string): Promise<OfflineStudyMaterial[]> {
  const db = await database(userId);
  const rows = await db.getAllAsync<{ payload_json: string }>(
    "SELECT payload_json FROM offline_study_material ORDER BY downloaded_at DESC",
  );
  return rows.map((row) => {
    try { return validateOfflineStudyMaterial(JSON.parse(row.payload_json)); }
    catch { throw new Error("A saved study material is damaged. Download it again."); }
  });
}

export async function removeOfflineStudyMaterial(userId: string, materialId: string): Promise<void> {
  const db = await database(userId);
  await db.runAsync("DELETE FROM offline_study_material WHERE material_id = ?", materialId);
}
