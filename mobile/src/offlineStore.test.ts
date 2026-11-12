import { describe, expect, it, beforeEach, vi, afterEach } from "vitest";
import * as nodeCrypto from "node:crypto";

// Functional fake SQLite store (ESM-safe: no CommonJS module.exports).
const storeRows = new Map<string, Record<string, unknown>>();

function makeFakeSqlite() {
  return {
    openDatabaseAsync: vi.fn((): Promise<typeof fakeSqliteRef> => Promise.resolve(fakeSqliteRef)),
    execAsync: vi.fn(async (): Promise<void> => undefined),
    getFirstAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<Record<string, unknown> | null> => {
      const rows = query(storeRows, sql, params);
      return rows.length ? rows[0] : null;
    }),
    getAllAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> => {
      return query(storeRows, sql, params);
    }),
    runAsync: vi.fn(async (sql: string, ...params: unknown[]): Promise<{ changes: number; lastInsertRowId: number }> => {
      if (/^INSERT/i.test(sql)) {
        const columns = sql.match(/\(([\s\S]*?)\)/)![1].split(",").map((c) => c.trim());
        const row: Record<string, unknown> = {};
        for (let i = 0; i < columns.length; i++) row[columns[i]] = params[i];
        if (!row.updated_at) row.updated_at = new Date().toISOString();
        storeRows.set(String(row.assignment_id), row);
        return { changes: 1, lastInsertRowId: Date.now() };
      }
      if (/^UPDATE/i.test(sql)) {
        const setPart = sql.match(/SET\s+([\s\S]*?)\s+WHERE/i)!;
        const updates: Record<string, unknown> = {};
        for (const part of setPart[1].split(",")) {
          const [col, val] = part.split("=").map((s) => s.trim());
          updates[col] = val.replace(/^'|'$/g, "");
        }
        const whereMatch = sql.match(/WHERE\s+([\s\S]*)/i);
        let changes = 0;
        for (const row of storeRows.values()) {
          if (!whereMatch) continue;
          const conditions = whereMatch[1].split(" AND ").map((c) => c.trim());
          let p = 0, match = true;
          for (const cond of conditions) {
            const cm = cond.match(/(\w+)\s*=\s*\?/);
            if (!cm) continue;
            if (row[cm[1]] !== params[p++]) { match = false; break; }
          }
          if (match) { Object.assign(row, updates); changes++; }
        }
        return { changes, lastInsertRowId: 0 };
      }
      return { changes: 0, lastInsertRowId: 0 };
    }),
  };
}

function query(rows: Map<string, Record<string, unknown>>, sql: string, params: unknown[]): Record<string, unknown>[] {
  let results = Array.from(rows.values());
  const whereMatch = sql.match(/WHERE\s+([\s\S]*?)(?:ORDER\s+BY|$)/i);
  if (whereMatch) {
    const conditions = whereMatch[1].split(" AND ").map((c) => c.trim());
    let p = 0;
    results = results.filter((row) => {
      for (const cond of conditions) {
        const cm = cond.match(/(\w+)\s*=\s*\?/);
        if (!cm) continue;
        if (row[cm[1]] !== params[p++]) return false;
      }
      return true;
    });
  }
  if (/ORDER BY UPDATED_AT ASC/i.test(sql)) {
    results.sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  }
  return results;
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
    storeRows.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    storeRows.clear();
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
