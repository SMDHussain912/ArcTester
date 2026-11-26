import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { startTestServer, signUp } from "./server.js";

let server: Awaited<ReturnType<typeof startTestServer>>;
let cookie = "";
let adminId = 0;
type ModelLabTestBody = {
  ok?: boolean;
  datasets?: Array<{ name?: string; id?: string; fingerprint?: string }>;
  jobs?: Array<{ status?: string; modelId?: string }>;
  models?: unknown[];
  dataset?: { name?: string; id?: string; fingerprint?: string };
  job?: { status?: string; modelId?: string };
};

async function request(path: string, method = "GET", body?: unknown) {
  const response = await fetch(server.baseUrl + path, {
    method,
    headers: { cookie, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() as ModelLabTestBody };
}

describe("administrator Model Lab REST workspace", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const account = await signUp(server.baseUrl, "admin-model-lab@arctester.test");
    adminId = account.userId;
    cookie = account.cookie;
    await server.db.user.update({ where: { id: adminId }, data: { role: "ADMIN", accessStatus: "APPROVED" } });
  });
  afterAll(async () => { await server.close(); });

  it("lists the model workspace, creates and edits datasets, and queues safe training", async () => {
    const initial = await request("/admin/model-lab");
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({ ok: true, datasets: [], jobs: [], models: [] });

    const dataset = await request("/admin/model-lab/datasets", "POST", {
      name: "model-lab-training-fixture", task: "classification", targetColumn: "label", targetType: "string",
      featureSchema: [{ name: "score", type: "number" }],
      samples: [{ score: 1, label: "low" }, { score: 2, label: "low" }, { score: 3, label: "mid" }, { score: 4, label: "high" }, { score: 5, label: "high" }],
      sourceDescription: "Synthetic rows created by the Model Lab API test.",
      sourceAttested: false, datasetKind: "synthetic",
    });
    expect(dataset.status).toBe(201);
    expect(dataset.body.dataset.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    const datasetId = dataset.body.dataset.id as string;

    const edited = await request("/admin/model-lab/datasets/" + datasetId, "PATCH", { name: "model-lab-renamed-fixture", sourceDescription: "Updated synthetic fixture description for test verification." });
    expect(edited.status).toBe(200);
    expect(edited.body.dataset.name).toBe("model-lab-renamed-fixture");

    const job = await request("/admin/model-lab/training", "POST", { datasetId, modelId: "test_model_lab", seed: 42, epochs: 5, batchSize: 4 });
    expect(job.status).toBe(202);
    expect(job.body.job).toMatchObject({ status: "QUEUED", modelId: "test_model_lab" });

    const deleteUsed = await request("/admin/model-lab/datasets/" + datasetId, "DELETE");
    expect(deleteUsed.status).toBe(400);
    const snapshot = await request("/admin/model-lab");
    expect(snapshot.body.jobs).toHaveLength(1);
    expect(snapshot.body.datasets[0].name).toBe("model-lab-renamed-fixture");
  });

  it("requires administrator authentication", async () => {
    const response = await fetch(server.baseUrl + "/admin/model-lab");
    expect(response.status).toBe(403);
  });
});
