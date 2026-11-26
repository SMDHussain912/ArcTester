import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let studentId = 0;
let keyId = "";
let bearer = "";

const digest = (value: string) => createHash("sha256").update(value).digest("hex");

async function rpc(name: string, args: Record<string, unknown> = {}) {
  const response = await fetch(server.baseUrl + "/mcp/student", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + bearer },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

describe("student MCP authorization and ownership", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const student = await server.db.user.create({
      data: { email: "student-mcp-security@arctester.test", passwordHash: "test-only", role: "STUDENT", accessStatus: "APPROVED" },
    });
    const other = await server.db.user.create({
      data: { email: "other-mcp-owner@arctester.test", passwordHash: "test-only", role: "STUDENT", accessStatus: "APPROVED" },
    });
    studentId = student.id;
    await server.db.studentPrivateQuestion.create({
      data: { userId: student.id, subject: "Security", topic: "Ownership", text: "Owned question", options: ["A", "B"], correctIndex: 0 },
    });
    await server.db.studentPrivateQuestion.create({
      data: { userId: other.id, subject: "Security", topic: "Ownership", text: "Other student's question", options: ["A", "B"], correctIndex: 0 },
    });
    bearer = "arc_student_" + randomBytes(32).toString("base64url");
    const key = await server.db.studentMcpKey.create({
      data: { userId: student.id, name: "security-test", keyHash: digest(bearer), scopes: ["questions:read", "questions:write"] },
    });
    keyId = key.id;
  });

  afterAll(async () => { await server.close(); });

  it("limits reads to the key owner and prevents cross-student edits", async () => {
    const listed = await rpc("list_my_questions", { limit: 50 });
    expect(listed.status).toBe(200);
    const body = listed.body as { result: { content: Array<{ text: string }> } };
    const output = JSON.parse(body.result.content[0]!.text) as { questions: Array<{ text: string; userId: number }> };
    expect(output.questions.map(question => question.text)).toEqual(["Owned question"]);
    expect(output.questions.every(question => question.userId === studentId)).toBe(true);

    const otherQuestion = await server.db.studentPrivateQuestion.findFirst({ where: { text: "Other student's question" } });
    const edit = await rpc("edit_my_question", { id: otherQuestion!.id, patch: { text: "Attempted cross-account edit" } });
    expect(edit.body, JSON.stringify(edit.body)).toMatchObject({ error: { code: -32004 } });
    expect((await server.db.studentPrivateQuestion.findUnique({ where: { id: otherQuestion!.id } }))?.text).toBe("Other student's question");
  });

  it("enforces per-key scopes and re-checks current account role", async () => {
    await server.db.studentMcpKey.update({ where: { id: keyId }, data: { scopes: ["questions:read"] } });
    const denied = await rpc("create_my_questions", { questions: [{ subject: "Math", text: "Should be denied", options: ["A", "B"], correctIndex: 0 }] });
    expect(denied.body, JSON.stringify(denied.body)).toMatchObject({ error: { code: -32003 } });

    await server.db.user.update({ where: { id: studentId }, data: { role: "ADMIN" } });
    const demotedOrWrongRole = await rpc("list_my_questions", { limit: 10 });
    expect(demotedOrWrongRole.status).toBe(403);
    await server.db.user.update({ where: { id: studentId }, data: { role: "STUDENT" } });
  });

  it("rejects revoked MCP keys immediately", async () => {
    await server.db.studentMcpKey.update({ where: { id: keyId }, data: { revokedAt: new Date() } });
    const revoked = await rpc("list_my_questions", { limit: 10 });
    expect(revoked.status).toBe(403);
  });
});
