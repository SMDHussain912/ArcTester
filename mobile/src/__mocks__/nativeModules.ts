// Mocks for React Native native modules so the offline store and sync logic
// can be unit-tested in a plain Node/vitest environment. All database operations
// operate on an in-memory per-table store that tests can reset via resetFakeStore().
import { vi } from "vitest";

// --- expo-crypto ---
const crypto = require("node:crypto");
const sha256Digest = async (input: string): Promise<string> =>
  crypto.createHash("sha256").update(input).digest("hex");
const randomUUID = (): string => crypto.randomUUID();

module.exports = {
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (_algorithm: string, data: string): Promise<string> => sha256Digest(data),
  randomUUID,
};

// --- expo-sqlite ---
// Simulates separate SQLite tables: tableName -> rowId -> row.
const tables = new Map<string, Map<string, Record<string, unknown>>>();

export const resetFakeStore = (): void => {
  tables.clear();
};

function tableFor(sql: string): string | null {
  const m = sql.match(/(?:INTO|FROM|UPDATE)\s+([A-Za-z_]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function rowTable(rows: Map<string, Record<string, unknown>>, sql: string, params: unknown[]): Record<string, unknown> | null {
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:ORDER\s+BY|$)/i);
  if (!whereMatch) return null;
  const conditions = whereMatch[1].split(" AND ").map((c) => c.trim());
  let pIndex = 0;
  for (const row of rows.values()) {
    let match = true;
    for (const cond of conditions) {
      const cm = cond.match(/(\w+)\s*=\s*\?/);
      if (!cm) continue;
      const col = cm[1];
      const expected = params[pIndex++];
      if (row[col] !== expected) { match = false; break; }
    }
    if (match) return row;
  }
  return null;
}

function queryAll(tableName: string, sql: string, params: unknown[]): Record<string, unknown>[] {
  const rows = tables.get(tableName);
  if (!rows) return [];
  const results: Record<string, unknown>[] = [];
  for (const row of rows.values()) {
    const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:ORDER\s+BY|$)/i);
    if (!whereMatch) { results.push(row); continue; }
    const conditions = whereMatch[1].split(" AND ").map((c) => c.trim());
    let pIndex = 0;
    let match = true;
    for (const cond of conditions) {
      const cm = cond.match(/(\w+)\s*=\s*\?/);
      if (!cm) continue;
      const col = cm[1];
      const expected = params[pIndex++];
      if (row[col] !== expected) { match = false; break; }
    }
    if (match) results.push(row);
  }
  if (/ORDER BY UPDATED_AT ASC/i.test(sql)) {
    results.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  }
  return results;
}

const fakeSqlite = {
  openDatabaseAsync: vi.fn((): Promise<typeof fakeSqlite> => Promise.resolve(fakeSqlite)),
  execAsync: vi.fn(async (): Promise<void> => undefined),
  getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<Record<string, unknown> | null> => {
    const table = tableFor(sql);
    if (!table) return null;
    return rowTable(tables.get(table) ?? new Map(), sql, params);
  }),
  getAllAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> => {
    const table = tableFor(sql);
    if (!table) return [];
    return queryAll(table, sql, params);
  }),
  runAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> => {
    const upper = sql.toUpperCase();
    const insertMatch = upper.match(/^INSERT INTO ([A-Za-z_]+)\s*\(([\s\S]*?)\)/i);
    if (insertMatch) {
      const table = insertMatch[1].toLowerCase();
      const columns = insertMatch[2].split(",").map((c) => c.trim());
      const row: Record<string, unknown> = {};
      for (let i = 0; i < columns.length; i += 1) row[columns[i]] = params[i];
      if (!row.updated_at) row.updated_at = new Date().toISOString();
      if (!tables.has(table)) tables.set(table, new Map());
      const idCol = columns.find((c) => c.endsWith("_id")) || columns[0];
      tables.get(table)!.set(String(row[idCol]), row);
      return { changes: 1, lastInsertRowId: Date.now() };
    }
    const updateMatch = upper.match(/^UPDATE ([A-Za-z_]+)\s+SET\s+([\s\S]*?)\s+WHERE/i);
    if (updateMatch) {
      const table = updateMatch[1].toLowerCase();
      const setPart = updateMatch[2];
      const updates: Record<string, unknown> = {};
      for (const part of setPart.split(",")) {
        const [col, val] = part.split("=").map((s) => s.trim());
        updates[col] = val.replace(/^'|'$/g, "");
      }
      const rows = tables.get(table);
      if (!rows) return { changes: 0, lastInsertRowId: 0 };
      const whereMatch = sql.match(/WHERE\s+([\s\S]*)/i);
      let changes = 0;
      for (const row of rows.values()) {
        if (!whereMatch) continue;
        const whereClause = whereMatch[1];
        const conditions = whereClause.split(" AND ").map((c) => c.trim());
        let pIndex = 0;
        let match = true;
        for (const cond of conditions) {
          const cm = cond.match(/(\w+)\s*=\s*\?/);
          if (!cm) continue;
          const col = cm[1];
          const expected = params[pIndex++];
          if (row[col] !== expected) { match = false; break; }
        }
        if (match) {
          Object.assign(row, updates);
          changes += 1;
        }
      }
      return { changes, lastInsertRowId: 0 };
    }
    return { changes: 0, lastInsertRowId: 0 };
  }),
};

module.exports.openDatabaseAsync = fakeSqlite.openDatabaseAsync;
module.exports.execAsync = fakeSqlite.execAsync;
module.exports.getFirstAsync = fakeSqlite.getFirstAsync;
module.exports.getAllAsync = fakeSqlite.getAllAsync;
module.exports.runAsync = fakeSqlite.runAsync;

// Mock expo-screen-capture (not installed in this dev environment; real app
// requires expo-build-config / development build).
vi.mock("expo-screen-capture", () => ({
  preventScreenCaptureAsync: vi.fn(async () => undefined),
  allowScreenCaptureAsync: vi.fn(async () => undefined),
}));

vi.mock("react-native", () => ({
  NativeModules: {},
  AsyncStorage: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  },
}));
