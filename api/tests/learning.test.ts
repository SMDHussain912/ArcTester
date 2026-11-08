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

  it("exports a versioned study package with answer keys and explanations", async () => {
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
        correctIndex: number;
        explanation: string;
        difficulty: string;
      }[];
    };

    expect(body.schemaVersion).toBe(1);
    expect(new Date(body.exportedAt).getTime()).toBeGreaterThan(0);
    expect(body.total).toBe(2);
    expect(body.subjects).toEqual(["Maths", "Physics"]);
    expect(body.questions[0]).toMatchObject({
      subject: "Maths",
      topic: "General",
      options: ["3", "4", "5", "6"],
      correctIndex: 1,
      explanation: "Add the two values.",
      difficulty: "medium",
    });
  });
});
