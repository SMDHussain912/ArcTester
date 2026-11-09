import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { importFromJson } from "../src/importService.js";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let api: ReturnType<typeof bindSession>;

beforeAll(async () => {
  server = await startTestServer(buildApp);
  await importFromJson(server.db, [
    ["Maths", "What is 2 + 2?", ["3", "4", "5", "6"], 1, "Add the two values."],
    ["Physics", "What is speed?", ["Distance/time", "Mass", "Force", "Energy"], 0, "Speed is distance divided by time."],
  ]);
  const session = await signUp(server.baseUrl, "materials@example.com");
  api = bindSession(server.baseUrl, session.cookie);
});

afterAll(async () => {
  await server.close();
});

describe("offline learning package", () => {
  it("requires an authenticated account", async () => {
    const response = await fetch(`${server.baseUrl}/learning/package`);
    expect(response.status).toBe(403);
  });

  it("searches curated concepts and returns grounded learning fields", async () => {
    const { status, json } = await api.get("/learning/concepts?q=fifo");
    expect(status).toBe(200);
    const body = json as { total: number; concepts: { slug: string; title: string; definition: string; examples: string[]; commonMistakes: string[] }[] };
    expect(body.total).toBeGreaterThanOrEqual(1);
    const queue = body.concepts.find((concept) => concept.slug === "queue");
    expect(queue).toMatchObject({
      title: "Queue",
      examples: expect.arrayContaining(["Printer job scheduling"]),
    });
    expect(queue?.definition).toContain("first-in, first-out");
    expect(queue?.commonMistakes.length).toBeGreaterThan(0);
  });

  it("filters concepts by subject and supports direct concept lookup", async () => {
    const filtered = await api.get("/learning/concepts?subject=Physics&limit=1");
    expect(filtered.status).toBe(200);
    expect((filtered.json as { concepts: { subject: string }[] }).concepts).toHaveLength(1);
    expect((filtered.json as { concepts: { subject: string }[] }).concepts[0].subject).toBe("Physics");

    const detail = await api.get("/learning/concepts/ohms-law");
    expect(detail.status).toBe(200);
    expect(detail.json).toMatchObject({ slug: "ohms-law", title: "Ohm's Law" });

    const missing = await api.get("/learning/concepts/not-a-real-concept");
    expect(missing.status).toBe(404);
  });

  it("validates concept search parameters", async () => {
    const response = await api.get("/learning/concepts?limit=1000");
    expect(response.status).toBe(400);
  });

  it("exports a versioned study package without exposing the question-bank answer key", async () => {
    const { status, json } = await api.get("/learning/package");
    expect(status).toBe(200);
    const body = json as {
      schemaVersion: number;
      exportedAt: string;
      total: number;
      subjects: string[];
      questions: {
        id: number;
        subject: string;
        topic: string | null;
        options: string[];
        difficulty: string;
      }[];
    };

    expect(body.schemaVersion).toBe(2);
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(0);
    expect(body.total).toBe(2);
    expect(body.subjects).toEqual(["Maths", "Physics"]);
    expect(body.questions[0]).toMatchObject({
      subject: "Maths",
      topic: "General",
      options: ["3", "4", "5", "6"],
      difficulty: "medium",
    });
    expect(body.questions[0]).not.toHaveProperty("correctIndex");
    expect(body.questions[0]).not.toHaveProperty("explanation");
  });
});
