import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;

const BANK: unknown[] = [
  ["Maths", "Maths Q1?", ["a1", "b1", "c1", "d1"], 0, "exp-m1"],
  ["Maths", "Maths Q2?", ["a2", "b2", "c2", "d2"], 1, "exp-m2"],
  ["Physics", "Physics Q1?", ["p1", "q1", "r1", "s1"], 3, "exp-p1"],
];

beforeAll(async () => {
  server = await startTestServer(buildApp);
  const report = await importFromJson(server.db, BANK);
  expect(report.added).toBe(3);
  const session = await signUp(server.baseUrl, "analyst@example.com");
  api = bindSession(server.baseUrl, session.cookie);
});

afterAll(async () => {
  await server.close();
});

describe("analytics", () => {
  it("GET /analytics/weak-topics is empty with no stats", async () => {
    const { status, json } = await api.get(`/analytics/weak-topics`);
    expect(status).toBe(200);
    const body = json as { subjects: unknown[]; weakest: unknown };
    expect(body.subjects).toEqual([]);
    expect(body.weakest).toBeNull();
  });

  it("builds two attempts so stats exist", async () => {
    const c1 = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    expect(c1.status).toBe(201);
    await api.post(`/tests/${c1.json.attemptId}/submit`, {
      answers: [{ questionId: c1.json.questions[0].id, selectedIndex: 0 }],
    });

    const c2 = (await api.post(`/tests`, {
      mode: "practice",
      subject: "Physics",
      count: 1,
    })) as { status: number; json: { attemptId: number; questions: { id: number }[] } };
    expect(c2.status).toBe(201);
    await api.post(`/tests/${c2.json.attemptId}/submit`, {
      answers: [{ questionId: c2.json.questions[0].id, selectedIndex: 0 }],
    });
  });

  it("ranks weakest subject first", async () => {
    const { status, json } = await api.get(`/analytics/weak-topics`);
    expect(status).toBe(200);
    const body = json as {
      subjects: { subject: string; seen: number; wrong: number; accuracy: number }[];
      weakest: { subject: string; accuracy: number } | null;
    };
    expect(body.subjects.length).toBeGreaterThan(0);
    const sorted = [...body.subjects].sort((a, b) => a.accuracy - b.accuracy);
    expect(body.subjects).toEqual(sorted);
    expect(body.weakest?.subject).toBe(body.subjects[0].subject);
    const physics = body.subjects.find((s) => s.subject === "Physics");
    expect(physics?.accuracy).toBe(0);
    expect(physics?.wrong).toBe(1);
  });

  it("GET /analytics/history lists submitted attempts", async () => {
    const { status, json } = await api.get(`/analytics/history`);
    expect(status).toBe(200);
    const body = json as {
      attemptId: number;
      mode: string;
      score: number;
      total: number;
      expired: boolean;
      finishedAt: string | null;
    }[];
    expect(body.length).toBeGreaterThanOrEqual(2);
    expect(body.every((h) => h.total > 0)).toBe(true);
    for (let i = 1; i < body.length; i++) {
      expect(new Date(body[i - 1].finishedAt ?? 0).getTime()).toBeGreaterThanOrEqual(
        new Date(body[i].finishedAt ?? 0).getTime()
      );
    }
  });

  it("GET /analytics/export returns stats + attempts + answers", async () => {
    const { status, json } = await api.get(`/analytics/export`);
    expect(status).toBe(200);
    const body = json as {
      exportedAt: string;
      stats: { questionId: number; seen: number; wrong: number }[];
      attempts: unknown[];
      answers: unknown[];
    };
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(0);
    expect(body.stats.length).toBeGreaterThan(0);
    expect(body.attempts.length).toBeGreaterThan(0);
    expect(body.answers.length).toBeGreaterThan(0);
  });

  it("POST /analytics/import round-trips into a fresh DB", async () => {
    const exportRes = await api.get(`/analytics/export`);
    const payload = exportRes.json as {
      exportedAt: string;
      stats: unknown[];
      attempts: unknown[];
      answers: unknown[];
    };

    const fresh = await startTestServer(buildApp);
    const report = await importFromJson(fresh.db, BANK);
    expect(report.added).toBe(3);

    // A different account in the fresh DB — import must land under this user.
    const freshSession = await signUp(fresh.baseUrl, "restored@example.com");
    const freshApi = bindSession(fresh.baseUrl, freshSession.cookie);

    const importRes = await freshApi.post(`/analytics/import`, payload);
    expect(importRes.status).toBe(200);
    const importBody = importRes.json as {
      addedStats: number;
      updatedStats: number;
      addedAttempts: number;
      skippedDuplicates: number;
    };
    expect(importBody.addedStats).toBeGreaterThan(0);
    expect(importBody.addedAttempts).toBeGreaterThan(0);

    const weak = await freshApi.get(`/analytics/weak-topics`);
    const weakBody = weak.json as { subjects: { subject: string; accuracy: number }[] };
    expect(weakBody.subjects.length).toBeGreaterThan(0);

    await fresh.close();
  });

  it("POST /analytics/import rejects unknown question ids", async () => {
    const res = await api.post(`/analytics/import`, {
      stats: [{ questionId: 999999, seen: 1, wrong: 0 }],
    });
    expect(res.status).toBe(400);
    expect((res.json as { error: string }).error).toContain("unknown questions");
  });

  it("POST /analytics/import rejects malformed payload", async () => {
    const res = await api.post(`/analytics/import`, "not json");
    expect(res.status).toBe(400);
  });

  it("POST /analytics/import is idempotent on duplicate attempt ids", async () => {
    const exportRes = await api.get(`/analytics/export`);
    const payload = exportRes.json as {
      exportedAt: string;
      stats: unknown[];
      attempts: unknown[];
      answers: unknown[];
    };
    const first = await api.post(`/analytics/import`, payload);
    expect(first.status).toBe(200);
    const second = await api.post(`/analytics/import`, payload);
    expect(second.status).toBe(200);
    const body = second.json as { skippedDuplicates: number };
    expect(body.skippedDuplicates).toBeGreaterThan(0);
  });
});
