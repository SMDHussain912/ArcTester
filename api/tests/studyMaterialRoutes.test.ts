import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { signUp, startTestServer, type TestServer } from "./server.js";

describe("study material publishing API", () => {
  let server: TestServer;
  let adminCookie: string;
  let studentCookie: string;

  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await signUp(server.baseUrl, "materials-admin@example.com");
    adminCookie = admin.cookie;
    await server.db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
    studentCookie = (await signUp(server.baseUrl, "materials-student@example.com")).cookie;
  });

  afterAll(async () => { await server.close(); });

  async function call(path: string, method = "GET", body?: unknown, cookie = adminCookie) {
    const response = await fetch(server.baseUrl + path, {
      method,
      headers: { cookie, ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response;
  }

  it("keeps uploaded files private until published and serves them to students afterward", async () => {
    const pdf = Buffer.from("%PDF-1.4\nArcTester study notes\n%%EOF", "utf8");
    const uploaded = await call("/admin/study-materials", "POST", {
      title: "Data Structures Unit 1",
      description: "Arrays and linked lists revision notes.",
      subject: "Computer Science",
      topic: "Data Structures",
      fileName: "data-structures.pdf",
      mimeType: "application/pdf",
      contentBase64: pdf.toString("base64"),
    });
    expect(uploaded.status).toBe(201);
    const created = await uploaded.json() as { material: { id: string; status: string; sizeBytes: number } };
    expect(created.material).toMatchObject({ status: "DRAFT", sizeBytes: pdf.byteLength });

    const hidden = await call("/study-materials", "GET", undefined, studentCookie);
    expect(hidden.status).toBe(200);
    expect((await hidden.json() as { materials: unknown[] }).materials).toHaveLength(0);

    const published = await call("/admin/study-materials/" + created.material.id, "PATCH", { status: "PUBLISHED" });
    expect(published.status).toBe(200);

    const visible = await call("/study-materials", "GET", undefined, studentCookie);
    expect(visible.status).toBe(200);
    expect((await visible.json() as { materials: Array<{ title: string }> }).materials[0].title).toBe("Data Structures Unit 1");

    const download = await call("/study-materials/" + created.material.id + "/download", "GET", undefined, studentCookie);
    expect(download.status).toBe(200);
    expect(download.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await download.arrayBuffer()).equals(pdf)).toBe(true);

    const preview = await call("/study-materials/" + created.material.id + "/preview", "GET", undefined, studentCookie);
    expect(preview.status).toBe(200);
    expect(preview.headers.get("content-type")).toBe("application/pdf");
    expect(preview.headers.get("content-disposition")).toContain("inline");
    expect(Buffer.from(await preview.arrayBuffer()).equals(pdf)).toBe(true);

    const deleted = await call("/admin/study-materials/" + created.material.id, "DELETE");
    expect(deleted.status).toBe(200);
    expect((await call("/study-materials", "GET", undefined, studentCookie)).status).toBe(200);
  });

  it("serves published text and Markdown as offline reading content", async () => {
    const content = "# Binary trees\\n\\nA tree is a hierarchical data structure.";
    const uploaded = await call("/admin/study-materials", "POST", {
      title: "Binary Trees Notes",
      description: "Offline revision notes.",
      subject: "Computer Science",
      topic: "Data Structures",
      fileName: "binary-trees.md",
      mimeType: "text/markdown",
      contentBase64: Buffer.from(content, "utf8").toString("base64"),
    });
    expect(uploaded.status).toBe(201);
    const created = await uploaded.json() as { material: { id: string } };
    expect((await call("/study-materials/" + created.material.id + "/offline", "GET", undefined, studentCookie)).status).toBe(404);
    expect((await call("/admin/study-materials/" + created.material.id, "PATCH", { status: "PUBLISHED" })).status).toBe(200);

    const response = await call("/study-materials/" + created.material.id + "/offline", "GET", undefined, studentCookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      material: { id: created.material.id, title: "Binary Trees Notes", mimeType: "text/markdown", content },
    });
  });

  it("rejects non-admin uploads and unsupported file types", async () => {
    const denied = await call("/admin/study-materials", "POST", {}, studentCookie);
    expect(denied.status).toBe(403);
    const invalid = await call("/admin/study-materials", "POST", {
      title: "Executable", description: "", subject: "CS", topic: "",
      fileName: "run.exe", mimeType: "application/pdf", contentBase64: Buffer.from("not a pdf").toString("base64"),
    });
    expect(invalid.status).toBe(400);
  });
});
