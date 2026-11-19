const sqlite = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  type Database = { rows: Map<string, Map<string, Row>> };
  const databases = new Map<string, Database>();
  const openDatabaseAsync = vi.fn(async (name: string) => {
    let db = databases.get(name);
    if (!db) {
      db = { rows: new Map() };
      databases.set(name, db);
    }
    return {
      execAsync: async () => undefined,
      runAsync: async (sql: string, ...params: unknown[]) => {
        const insert = sql.match(/^INSERT INTO ([A-Za-z_]+)\s*\(([^)]+)\)/i);
        if (insert) {
          const table = insert[1].toLowerCase();
          const columns = insert[2].split(",").map((part) => part.trim());
          const row: Row = {};
          columns.forEach((column, index) => { row[column] = params[index]; });
          if (!db!.rows.has(table)) db!.rows.set(table, new Map());
          const keyColumn = table === "offline_study_material" ? "material_id" : "id";
          db!.rows.get(table)!.set(String(row[keyColumn]), row);
          return { changes: 1, lastInsertRowId: 1 };
        }
        const deletion = sql.match(/^DELETE FROM ([A-Za-z_]+) WHERE ([A-Za-z_]+)\s*=\s*\?/i);
        if (deletion) {
          const rows = db!.rows.get(deletion[1].toLowerCase());
          const rowKey = [...(rows ?? new Map<string, Row>()).entries()]
            .find(([, row]) => row[deletion[2]] === params[0])?.[0];
          if (rowKey !== undefined) {
            rows!.delete(rowKey);
            return { changes: 1, lastInsertRowId: 0 };
          }
          return { changes: 0, lastInsertRowId: 0 };
        }
        return { changes: 0, lastInsertRowId: 0 };
      },
      getFirstAsync: async <T>(sql: string, ...params: unknown[]): Promise<T | null> => {
        const table = sql.match(/FROM\s+([A-Za-z_]+)/i)?.[1].toLowerCase();
        if (!table) return null;
        const rows = [...(db!.rows.get(table)?.values() ?? [])];
        const where = sql.match(/WHERE\s+([A-Za-z_]+)\s*=\s*\?/i);
        const found = where ? rows.find((row) => row[where[1]] === params[0]) : rows[0];
        return (found as T | undefined) ?? null;
      },
      getAllAsync: async <T>(sql: string, ...params: unknown[]): Promise<T[]> => {
        const table = sql.match(/FROM\s+([A-Za-z_]+)/i)?.[1].toLowerCase();
        if (!table) return [];
        let rows = [...(db!.rows.get(table)?.values() ?? [])];
        const where = sql.match(/WHERE\s+([A-Za-z_]+)\s*=\s*\?/i);
        if (where) rows = rows.filter((row) => row[where[1]] === params[0]);
        if (/ORDER BY downloaded_at DESC/i.test(sql)) rows.sort((x, y) => String(y.downloaded_at).localeCompare(String(x.downloaded_at)));
        return rows as T[];
      },
    };
  });
  return { openDatabaseAsync, reset: () => databases.clear() };
});

import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("expo-sqlite", () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));

import {
  getOfflineStudyMaterials,
  removeOfflineStudyMaterial,
  saveOfflineStudyMaterial,
} from "./learningStore";

const material = {
  id: "note-1",
  title: "Database Normalization",
  description: "Revision notes",
  subject: "DBMS",
  topic: "Normalization",
  fileName: "normalization.md",
  mimeType: "text/markdown" as const,
  sizeBytes: 39,
  content: "# Normalization\nFunctional dependencies",
  downloadedAt: "2026-11-19T08:00:00.000Z",
};

describe("offline study material persistence", () => {
  beforeEach(() => sqlite.reset());

  it("saves, reloads and removes a downloaded note", async () => {
    const saved = await saveOfflineStudyMaterial("student-1", material);
    expect(saved.id).toBe(material.id);
    expect((await getOfflineStudyMaterials("student-1")).map((item) => item.content)).toEqual([material.content]);
    await removeOfflineStudyMaterial("student-1", material.id);
    expect(await getOfflineStudyMaterials("student-1")).toEqual([]);
  });

  it("isolates downloads between signed-in accounts", async () => {
    await saveOfflineStudyMaterial("student-1", material);
    await saveOfflineStudyMaterial("student-2", { ...material, id: "note-2", title: "Other account notes" });
    expect((await getOfflineStudyMaterials("student-1")).map((item) => item.title)).toEqual([material.title]);
    expect((await getOfflineStudyMaterials("student-2")).map((item) => item.title)).toEqual(["Other account notes"]);
  });

  it("replaces an existing download instead of creating duplicates", async () => {
    await saveOfflineStudyMaterial("student-1", material);
    await saveOfflineStudyMaterial("student-1", { ...material, title: "Updated notes" });
    const saved = await getOfflineStudyMaterials("student-1");
    expect(saved).toHaveLength(1);
    expect(saved[0].title).toBe("Updated notes");
  });

  it("rejects empty account identifiers before opening a database", async () => {
    await expect(getOfflineStudyMaterials(" ")).rejects.toThrow(/signed-in account/i);
    expect(sqlite.openDatabaseAsync).not.toHaveBeenCalled();
  });
});
