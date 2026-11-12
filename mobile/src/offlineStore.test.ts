import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import * as nodeCrypto from "node:crypto";

// Separate tables: tableName -> rowId -> row.
const tables = new Map<string, Map<string, Record<string, unknown>>>();

function tableFor(sql: string): string | null {
  const m = sql.match(/(?:INTO|FROM|UPDATE)\s+([A-Za-z_]+)/i);
  return m ? m[1].toLowerCase() : null;
}

function queryTable(tableName: string, sql: string, params: unknown[]): Record<string, unknown>[] {
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
      const cm = cond.match(/(\w+)\s*=\s*('?[^']*'?|\?)/);
      if (!cm) continue;
      const col = cm[1];
      const val = cm[2];
      const expected = val === "?" ? params[pIndex++] : val.replace(/^'|'$/g, "");
      if (row[col] !== expected) { match = false; break; }
    }
    if (match) results.push(row);
  }
  if (/ORDER BY UPDATED_AT ASC/i.test(sql)) {
    results.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  }
  return results;
}

function makeFakeSqlite() {
  return {
    openDatabaseAsync: vi.fn((): Promise<typeof fakeSqliteRef> => Promise.resolve(fakeSqliteRef)),
    execAsync: vi.fn(async (): Promise<void> => undefined),
    getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<Record<string, unknown> | null> => {
      const rows = queryTable(tableFor(sql) ?? "", sql, params);
      return rows.length ? rows[0] : null;
    }),
    getAllAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> => {
      return queryTable(tableFor(sql) ?? "", sql, params);
    }),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> => {
      const upper = sql.toUpperCase();
      const insertMatch = sql.match(/^INSERT INTO ([A-Za-z_]+)\s*\(([\s\S]*?)\)/i);
      if (insertMatch) {
        const table = insertMatch[1].toLowerCase();
        const columns = insertMatch[2].split(",").map((c) => c.trim());
        const row: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i += 1) row[columns[i]] = params[i];
        if (!row.updated_at) row.updated_at = new Date().toISOString();
        // Also store aliased column names (camelCase) used by the app's SELECT ... AS queries.
        const aliasMap: Record<string, string> = {
          assignment_id: "assignmentId",
          attempt_uuid: "attemptUuid",
          started_at: "startedAt",
          started_at_monotonic_ms: "startedAtMonotonicMs",
          submitted_at: "submittedAt",
          answers_json: "answersJson",
          submission_id: "submissionId",
          last_error: "lastError",
          exam_question_id: "examQuestionId",
          selected_index: "selectedIndex",
          is_correct: "isCorrect",
          awarded_marks: "awardedMarks",
          payload_json: "payloadJson",
          server_offset_ms: "serverOffsetMs",
          downloaded_at: "downloadedAt",
        };
        for (const [orig, alias] of Object.entries(aliasMap)) {
          if (orig in row && !(alias in row)) row[alias] = row[orig];
        }
        if (!tables.has(table)) tables.set(table, new Map());
        const idCol = columns.find((c) => c.endsWith("_id")) || columns[0];
        tables.get(table)!.set(String(row[idCol]), row);
        return { changes: 1, lastInsertRowId: Date.now() };
      }
      const updateMatch = sql.match(/^UPDATE ([A-Za-z_]+)\s+SET\s+([\s\S]*?)\s+WHERE/i);
      if (updateMatch) {
        const table = updateMatch[1].toLowerCase();
        const setPart = updateMatch[2];
        const updates: Record<string, unknown> = {};
        // Parse SET clause, handling both ? placeholders and hardcoded values like 'SYNCED', NULL
        const setParts = setPart.split(",");
        let pIndex = 0;
        for (const part of setParts) {
          const eqIdx = part.indexOf("=");
          if (eqIdx === -1) continue;
          const col = part.slice(0, eqIdx).trim();
          const val = part.slice(eqIdx + 1).trim();
          if (val === "?") {
            updates[col] = params[pIndex++];
          } else {
            // Hardcoded value like 'SYNCED' or NULL
            updates[col] = val.replace(/^'|'$/g, "");
          }
        }
        const rows = tables.get(table);
        if (!rows) return { changes: 0, lastInsertRowId: 0 };
        // Apply updates to rows matching the assignment_id (last param is typically
        // the assignment_id in WHERE clauses of this app's UPDATE statements).
        const lastParam = params[params.length - 1];
        let changes = 0;
        for (const row of rows.values()) {
          if (row.assignment_id === lastParam || row.assignmentId === lastParam) {
            Object.assign(row, updates);
            if ("answers_json" in updates) row["answersJson"] = updates["answers_json"];
            if ("submitted_at" in updates) row["submittedAt"] = updates["submitted_at"];
            if ("status" in updates) row["status"] = updates["status"];
            if ("last_error" in updates) row["lastError"] = updates["last_error"];
            if ("submission_id" in updates) row["submissionId"] = updates["submission_id"];
            changes += 1;
          }
        }
        return { changes, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    }),
  };
}

const fakeSqliteRef = vi.hoisted(() => makeFakeSqlite());

vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digestStringAsync: (_algorithm: string, data: string) =>
    Promise.resolve(nodeCrypto.createHash("sha256").update(data).digest("hex")),
  randomUUID: () => "test-attempt-uuid",
}));

vi.mock("expo-sqlite", () => ({ default: fakeSqliteRef, ...fakeSqliteRef }));

import {
  configureOfflineStore,
  saveExamPackage,
  getCachedExamPackage,
  startOfflineAttempt,
  restoreActiveAttempt,
  saveOfflineAnswer,
  getRemainingSeconds,
  queueOfflineSubmission,
  getPendingSubmissions,
  markSubmissionSynced,
} from "./offlineStore";

const packagePayload = {
  assignmentId: "assignment-1",
  examId: "exam-1",
  title: "Midterm",
  description: "A midterm exam",
  version: 1,
  instructions: "Do your best.",
  durationMinutes: 60,
  availableFrom: null,
  dueAt: null,
  serverTime: new Date(Date.now() + 100000).toISOString(),
  questions: [
    { id: "q1", position: 0, subject: "Math", topic: "Algebra", text: "2+2?", options: ["3", "4", "5"], marks: 1, negativeMarks: 0 },
    { id: "q2", position: 1, subject: "Math", topic: "Algebra", text: "3*3?", options: ["6", "9", "12"], marks: 1, negativeMarks: 0 },
  ],
};

const expectedSha256 = nodeCrypto.createHash("sha256")
  .update(JSON.stringify(packagePayload))
  .digest("hex");

describe("offlineStore", () => {
  beforeEach(() => {
    tables.clear();
  });

  afterEach(() => {
    tables.clear();
  });

  it("saves and loads an exam package", async () => {
    configureOfflineStore("user-1");
    await saveExamPackage(packagePayload, expectedSha256);
    const loaded = await getCachedExamPackage("assignment-1");
    expect(loaded).not.toBeNull();
    expect(loaded!.title).toBe("Midterm");
    expect(loaded!.questions.length).toBe(2);
  });

  it("rejects a package with a mismatched sha256", async () => {
    configureOfflineStore("user-2");
    await expect(saveExamPackage(packagePayload, "wrong-sha256")).rejects.toThrow("integrity check failed");
  });

  it("starts an attempt, saves answers, and tracks remaining seconds", async () => {
    configureOfflineStore("user-3");
    await saveExamPackage(packagePayload, expectedSha256);

    const started = await startOfflineAttempt("assignment-1");
    expect(started.attemptUuid).toBe("test-attempt-uuid");
    expect(typeof started.startedAt).toBe("string");

    const restored = await restoreActiveAttempt("assignment-1");
    expect(restored).not.toBeNull();
    expect(restored!.attemptUuid).toBe("test-attempt-uuid");

    await saveOfflineAnswer("assignment-1", "q1", 1);
    const restoredAgain = await restoreActiveAttempt("assignment-1");
    expect(restoredAgain!.answers["q1"]).toBe(1);

    const remaining = await getRemainingSeconds("assignment-1");
    expect(typeof remaining).toBe("number");
    expect(remaining).toBeGreaterThan(0);
    expect(remaining).toBeLessThanOrEqual(60 * 60);
  });

  it("queues and marks a submission as synced", async () => {
    configureOfflineStore("user-4");
    await saveExamPackage(packagePayload, expectedSha256);
    await startOfflineAttempt("assignment-1");
    await saveOfflineAnswer("assignment-1", "q1", 1);

    const pending = await queueOfflineSubmission("assignment-1");
    expect(pending.attemptUuid).toBe("test-attempt-uuid");
    expect(pending.answers.length).toBe(2);

    const submissions = await getPendingSubmissions();
    expect(submissions.length).toBe(1);

    await markSubmissionSynced("assignment-1", "submission-9");
    const after = await getPendingSubmissions();
    expect(after.length).toBe(0);
  });
});
