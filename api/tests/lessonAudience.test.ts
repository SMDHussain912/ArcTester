import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { bindSession, signUp, startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let firstApi: ReturnType<typeof bindSession>;
let secondApi: ReturnType<typeof bindSession>;
let lessonId = "";

describe("lesson audience enforcement", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const first = await signUp(server.baseUrl, "lesson-audience-first@example.test");
    const second = await signUp(server.baseUrl, "lesson-audience-second@example.test");
    firstApi = bindSession(server.baseUrl, first.cookie);
    secondApi = bindSession(server.baseUrl, second.cookie);
    const draft = await server.db.lessonDraft.create({
      data: {
        createdById: first.userId,
        title: "Private lesson for selected student",
        subject: "Computer Science",
        topic: "Audience filtering",
        sourceTitle: "Test fixture",
        sourceText: "Test fixture content",
        scriptJson: "{}",
        storyboardJson: "{}",
        provider: "test",
        model: "fixture",
        status: "PUBLISHED",
        audienceScope: "STUDENTS",
        targetStudentIdsJson: JSON.stringify([first.userId]),
      },
      select: { id: true },
    });
    lessonId = draft.id;
  });

  afterAll(async () => { await server.close(); });

  it("lists and opens a published lesson only for selected student IDs", async () => {
    const firstList = await firstApi.get("/lessons");
    const secondList = await secondApi.get("/lessons");
    expect(firstList.status).toBe(200);
    expect(secondList.status).toBe(200);
    expect((firstList.json as { lessons: Array<{ id: string }> }).lessons.map((lesson) => lesson.id)).toContain(lessonId);
    expect((secondList.json as { lessons: Array<{ id: string }> }).lessons.map((lesson) => lesson.id)).not.toContain(lessonId);

    const firstDetail = await firstApi.get("/lessons/" + lessonId);
    const secondDetail = await secondApi.get("/lessons/" + lessonId);
    expect(firstDetail.status).toBe(200);
    expect(secondDetail.status).toBe(404);
  });
});
