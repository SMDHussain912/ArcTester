import { beforeEach, describe, expect, it, vi } from "vitest";
const sqlite = vi.hoisted(() => {
  const rows = new Map<string, Map<number, { attempt_id: number; answers_json: string; current_question_index: number; revision: number; submit_requested: number; updated_at: string }>>();
  const openDatabaseAsync = vi.fn(async (name: string) => {
    if (!rows.has(name)) rows.set(name, new Map());
    const table = rows.get(name)!;
    return {
      execAsync: async () => undefined,
      runAsync: async (sql: string, ...p: unknown[]) => {
        if (/INSERT INTO pending_practice_progress/i.test(sql)) {
          const id = Number(p[0]); const old = table.get(id);
          table.set(id, { attempt_id: id, answers_json: String(p[1]), current_question_index: Number(p[2]), revision: old ? old.revision + 1 : 1, submit_requested: Math.max(old?.submit_requested ?? 0, Number(p[3])), updated_at: String(p[4]) });
          return { changes: 1 };
        }
        if (/UPDATE pending_practice_progress SET submit_requested/i.test(sql)) {
          const row = table.get(Number(p[1])); if (row) { row.submit_requested = 1; row.revision += 1; row.updated_at = String(p[0]); }
          return { changes: row ? 1 : 0 };
        }
        if (/DELETE FROM pending_practice_progress WHERE attempt_id = \? AND revision = \?/i.test(sql)) {
          const row = table.get(Number(p[0])); if (row?.revision === Number(p[1])) { table.delete(Number(p[0])); return { changes: 1 }; }
          return { changes: 0 };
        }
        if (/DELETE FROM pending_practice_progress/i.test(sql)) return { changes: table.delete(Number(p[0])) ? 1 : 0 };
        return { changes: 0 };
      },
      getFirstAsync: async (_sql: string, id: number) => table.get(id) ?? null,
      getAllAsync: async () => [...table.values()],
    };
  });
  return { openDatabaseAsync, reset: () => rows.clear() };
});
vi.mock("expo-sqlite", () => ({ openDatabaseAsync: sqlite.openDatabaseAsync }));
import { clearPendingPracticeProgress, getPendingPracticeProgress, markPracticeProgressSynced, queuePracticeProgress, requestPracticeProgressSubmit } from "./offlineProgressQueue";
const sample = { attemptId: 41, answers: [{ questionId: 7, selectedIndex: 2 }, { questionId: 8, selectedIndex: null }], currentQuestionIndex: 1 };
describe("offline practice progress queue", () => {
  beforeEach(() => { sqlite.reset(); sqlite.openDatabaseAsync.mockClear(); });
  it("persists progress per account and increments revisions on updates", async () => {
    const first = await queuePracticeProgress("student-a", sample);
    const second = await queuePracticeProgress("student-a", { ...sample, currentQuestionIndex: 2 });
    expect(first.revision).toBe(1); expect(second.revision).toBe(2);
    expect((await getPendingPracticeProgress("student-a"))[0].currentQuestionIndex).toBe(2);
    expect(await getPendingPracticeProgress("student-b")).toEqual([]);
  });
  it("preserves an explicit submit request across later answer snapshots", async () => {
    await queuePracticeProgress("student-a", { ...sample, submitRequested: true });
    const updated = await queuePracticeProgress("student-a", sample);
    expect(updated.submitRequested).toBe(true);
    expect((await requestPracticeProgressSubmit("student-a", sample.attemptId)).submitRequested).toBe(true);
  });
  it("only removes the exact synced revision, preserving newer edits", async () => {
    const old = await queuePracticeProgress("student-a", sample);
    await queuePracticeProgress("student-a", { ...sample, currentQuestionIndex: 2 });
    expect(await markPracticeProgressSynced("student-a", sample.attemptId, old.revision)).toBe(false);
    expect(await getPendingPracticeProgress("student-a")).toHaveLength(1);
  });
  it("removes synced progress and can clear an attempt", async () => {
    const item = await queuePracticeProgress("student-a", sample);
    expect(await markPracticeProgressSynced("student-a", sample.attemptId, item.revision)).toBe(true);
    await queuePracticeProgress("student-a", sample);
    await clearPendingPracticeProgress("student-a", sample.attemptId);
    expect(await getPendingPracticeProgress("student-a")).toEqual([]);
  });
  it("persists a multi-select response without flattening it to one index", async () => {
    const typed = { ...sample, answers: [{ questionId: 7, response: [0, 2] }, { questionId: 8, response: null }] };
    await queuePracticeProgress("student-a", typed);
    expect((await getPendingPracticeProgress("student-a"))[0].answers).toEqual(typed.answers);
  });
  it("rejects duplicate indices in a multi-select response", async () => {
    await expect(queuePracticeProgress("student-a", { ...sample, answers: [{ questionId: 7, response: [1, 1] }] })).rejects.toThrow(/response is invalid/i);
  });
  it("rejects invalid and duplicate question answers", async () => {
    await expect(queuePracticeProgress("student-a", { ...sample, answers: [{ questionId: 7, selectedIndex: 1 }, { questionId: 7, selectedIndex: 0 }] })).rejects.toThrow(/duplicate/i);
  });
});
