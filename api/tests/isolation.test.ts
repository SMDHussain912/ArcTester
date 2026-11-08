import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let alice: ReturnType<typeof bindSession>;
let bob: ReturnType<typeof bindSession>;
let aliceId: number;
let bobId: number;

const BANK: unknown[] = [
  ["Maths", "Maths Q1?", ["a1", "b1", "c1", "d1"], 0, "exp-m1"],
  ["Maths", "Maths Q2?", ["a2", "b2", "c2", "d2"], 1, "exp-m2"],
  ["Physics", "Physics Q1?", ["p1", "q1", "r1", "s1"], 3, "exp-p1"],
];

beforeAll(async () => {
  server = await startTestServer(buildApp);
  const report = await importFromJson(server.db, BANK);
  expect(report.added).toBe(3);

  const a = await signUp(server.baseUrl, "alice@example.com");
  const b = await signUp(server.baseUrl, "bob@example.com");
  alice = bindSession(server.baseUrl, a.cookie);
  bob = bindSession(server.baseUrl, b.cookie);
  aliceId = a.userId;
  bobId = b.userId;
});

afterAll(async () => {
  await server.close();
});

describe("per-user isolation", () => {
  it("creates the attempt under the signed-in user", async () => {
    const created = await alice.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 2,
    });
    expect(created.status).toBe(201);
    const attemptId = (created.json as { attemptId: number }).attemptId;

    const attempt = await server.db.attempt.findUniqueOrThrow({ where: { id: attemptId } });
    expect(attempt.userId).toBe(aliceId);
  });

  it("hides another user's attempt view, result and submit", async () => {
    const created = await alice.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    });
    const attemptId = (created.json as { attemptId: number }).attemptId;

    // Bob cannot see the paper, cannot read the result, cannot submit it.
    const view = await bob.get(`/tests/${attemptId}`);
    expect(view.status).toBe(404);

    const result = await bob.get(`/tests/${attemptId}/result`);
    expect(result.status).toBe(404);

    const submit = await bob.post(`/tests/${attemptId}/submit`, {
      answers: [{ questionId: 1, selectedIndex: 0 }],
    });
    expect(submit.status).toBe(404);
  });

  it("keeps stats separate per user", async () => {
    const created = await alice.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    });
    const body = created.json as { attemptId: number; questions: { id: number }[] };
    const questionId = body.questions[0].id;

    const submitted = await alice.post(`/tests/${body.attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });
    expect(submitted.status).toBe(200);

    // Alice has a stat row for the question; Bob has none at all.
    const aliceStat = await server.db.stat.findUnique({
      where: { userId_questionId: { userId: aliceId, questionId } },
    });
    expect(aliceStat).toMatchObject({ seen: 1 });

    const bobStat = await server.db.stat.findUnique({
      where: { userId_questionId: { userId: bobId, questionId } },
    });
    expect(bobStat).toBeNull();
  });

  it("scopes the mistakes mode to the owner's wrong answers", async () => {
    const created = await alice.post(`/tests`, {
      mode: "practice",
      subject: "Physics",
      count: 1,
    });
    const body = created.json as { attemptId: number; questions: { id: number }[] };
    const questionId = body.questions[0].id;

    // Alice answers wrong -> only Alice has a mistake recorded.
    await alice.post(`/tests/${body.attemptId}/submit`, {
      answers: [{ questionId, selectedIndex: 0 }],
    });

    const bobMistakes = await bob.post(`/tests`, {
      mode: "mistakes",
      subject: "Physics",
      count: 10,
    });
    expect(bobMistakes.status).toBe(400);
    expect((bobMistakes.json as { error: string }).error).toContain("No questions available");

    const aliceMistakes = await alice.post(`/tests`, {
      mode: "mistakes",
      subject: "Physics",
      count: 10,
    });
    expect(aliceMistakes.status).toBe(201);
    const mistakes = aliceMistakes.json as { questions: { id: number }[] };
    expect(mistakes.questions.map((q) => q.id)).toEqual([questionId]);
  });

  it("scopes weak-topics and history to the owner", async () => {
    const created = await alice.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    });
    const body = created.json as { attemptId: number; questions: { id: number }[] };
    await alice.post(`/tests/${body.attemptId}/submit`, {
      answers: [{ questionId: body.questions[0].id, selectedIndex: 0 }],
    });

    const aliceWeak = await alice.get(`/analytics/weak-topics`);
    expect(aliceWeak.status).toBe(200);
    expect((aliceWeak.json as { subjects: unknown[] }).subjects.length).toBeGreaterThan(0);

    const aliceHistory = await alice.get(`/analytics/history`);
    expect(aliceHistory.status).toBe(200);
    expect((aliceHistory.json as unknown[]).length).toBeGreaterThan(0);

    // Bob has no history and no stats yet, so both reports are empty for him.
    const bobWeak = await bob.get(`/analytics/weak-topics`);
    expect(bobWeak.status).toBe(200);
    expect((bobWeak.json as { subjects: unknown[] }).subjects).toEqual([]);

    const bobHistory = await bob.get(`/analytics/history`);
    expect(bobHistory.status).toBe(200);
    expect(bobHistory.json).toEqual([]);
  });

  it("scopes the progress export to the owner", async () => {
    const created = await alice.post(`/tests`, {
      mode: "practice",
      subject: "Maths",
      count: 1,
    });
    const body = created.json as { attemptId: number; questions: { id: number }[] };
    await alice.post(`/tests/${body.attemptId}/submit`, {
      answers: [{ questionId: body.questions[0].id, selectedIndex: 0 }],
    });

    const aliceExport = await alice.get(`/analytics/export`);
    expect(aliceExport.status).toBe(200);
    const alicePayload = aliceExport.json as {
      stats: unknown[];
      attempts: { attemptId: number }[];
      answers: { attemptId: number }[];
    };
    expect(alicePayload.stats.length).toBeGreaterThan(0);
    expect(alicePayload.attempts.length).toBeGreaterThan(0);

    const bobExport = await bob.get(`/analytics/export`);
    expect(bobExport.status).toBe(200);
    const bobPayload = bobExport.json as { stats: unknown[]; attempts: unknown[] };
    expect(bobPayload.stats).toEqual([]);
    expect(bobPayload.attempts).toEqual([]);
  });

  it("imports a backup into the importer's account only", async () => {
    const exportRes = await alice.get(`/analytics/export`);
    const payload = exportRes.json;

    const imported = await bob.post(`/analytics/import`, payload);
    expect(imported.status).toBe(200);

    // Bob now sees the imported attempts, but under his own account.
    const bobHistory = await bob.get(`/analytics/history`);
    expect(bobHistory.status).toBe(200);
    expect((bobHistory.json as unknown[]).length).toBeGreaterThan(0);

    const bobAttempts = await server.db.attempt.findMany({ where: { userId: bobId } });
    expect(bobAttempts.length).toBeGreaterThan(0);

    // Alice's attempts are untouched and still hers.
    const aliceAttempts = await server.db.attempt.findMany({ where: { userId: aliceId } });
    expect(aliceAttempts.length).toBeGreaterThan(0);
    expect(aliceAttempts.every((a) => a.userId === aliceId)).toBe(true);
  });

  it("keeps the shared question bank visible to every user", async () => {
    const subjects = await server.db.subject.findMany();
    expect(subjects.length).toBe(2);

    // Both users can build a test from the same shared bank.
    const a = await alice.post(`/tests`, { mode: "practice", subject: "Physics", count: 1 });
    const b = await bob.post(`/tests`, { mode: "practice", subject: "Physics", count: 1 });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
  });
});