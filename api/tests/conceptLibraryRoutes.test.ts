import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { signUp, startTestServer, type TestServer } from "./server.js";

describe("student concept library", () => {
  let server: TestServer;
  let cookie = "";
  let studentId = 0;

  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const student = await signUp(server.baseUrl, "concept-library-student@example.com");
    cookie = student.cookie;
    studentId = student.userId;
    await server.db.user.update({
      where: { id: studentId },
      data: { branchCode: "CM", branchName: "Diploma in Computer Engineering" },
    });
  });

  afterAll(async () => { await server.close(); });

  it("returns computing concepts for a computer engineering student", async () => {
    const response = await fetch(server.baseUrl + "/concept-library", { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = await response.json() as { branch: { code: string }; concepts: Array<{ slug: string }> };
    expect(body.branch.code).toBe("CM");
    expect(body.concepts.some((concept) => concept.slug === "stack")).toBe(true);
  });

  it("updates concept visibility when the student's branch changes", async () => {
    await server.db.user.update({
      where: { id: studentId },
      data: { branchCode: "C", branchName: "Diploma in Civil Engineering" },
    });
    const response = await fetch(server.baseUrl + "/concept-library?q=stack", { headers: { cookie } });
    expect(response.status).toBe(200);
    const body = await response.json() as { concepts: Array<{ slug: string }> };
    expect(body.concepts).toHaveLength(0);
  });

  it("rejects invalid filters", async () => {
    const response = await fetch(server.baseUrl + "/concept-library?limit=1000", { headers: { cookie } });
    expect(response.status).toBe(400);
  });
});
