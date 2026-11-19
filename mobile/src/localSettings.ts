import * as SQLite from "expo-sqlite";

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

async function database(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync("arctester-device.db").then(async (db) => {
      await db.execAsync("CREATE TABLE IF NOT EXISTS local_settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)");
      return db;
    }).catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export async function getLocalValue(key: string): Promise<string | null> {
  const db = await database();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM local_settings WHERE key = ?", key);
  return row?.value ?? null;
}

export async function setLocalValue(key: string, value: string): Promise<void> {
  const db = await database();
  await db.runAsync(
    "INSERT INTO local_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP",
    key,
    value,
  );
}

export async function deleteLocalValue(key: string): Promise<void> {
  const db = await database();
  await db.runAsync("DELETE FROM local_settings WHERE key = ?", key);
}
