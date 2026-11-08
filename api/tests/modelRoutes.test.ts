import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { fitLogisticRegression } from "../src/intelligence/logisticRegression.js";
import { startTestServer, signUp, type TestServer } from "./server.js";

describe("admin model registry API", () => {
  let server: TestServer;
  let adminCookie: string;
  let studentCookie: string;

  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await signUp(server.baseUrl, "model-admin@example.com");
    adminCookie = admin.cookie;
    await server.db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
    studentCookie = (await signUp(server.baseUrl, "model-student@example.com")).cookie;
  });

  afterAll(async () => {
    await server.close();
  });

  const trainedModel = () => fitLogisticRegression([
    { features: [0], label: 0 },
    { features: [1], label: 0 },
    { features: [9], label: 1 },
    { features: [10], label: 1 },
  ]);

  const modelInput = (dataset = "demo-v1", model = trainedModel()) => ({
    modelId: "exam-readiness-demo",
    algorithm: "logistic-regression",
    task: "binary-classification",
    dataset,
    targetColumn: "target_ready",
    featureSchema: [{ name: "practice_score", type: "numeric" }],
    model,
  });

  const evaluationSamples = Array.from({ length: 12 }, (_, index) => ({
    features: { practice_score: index },
    target: index >= 6 ? 1 : 0,
  }));

  async function registerEvaluationDataset(name = "held-out-demo-v1") {
    const created = await request("/admin/model-datasets", "POST", {
      name,
      task: "binary-classification",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: evaluationSamples,
      sourceDescription: "Curated held-out test fixture for model governance tests.",
      sourceAttested: true,
    });
    expect(created.status).toBe(201);
    return (created.body.dataset as { id: string }).id;
  }

  async function request(path: string, method = "GET", body?: unknown, cookie = adminCookie) {
    const response = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: {
        cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as Record<string, unknown> };
  }

  it("requires an authenticated administrator", async () => {
    expect((await request("/admin/models", "GET", undefined, "")).status).toBe(403);
    expect((await request("/admin/models", "GET", undefined, studentCookie)).status).toBe(403);
  });

  it("registers a validated first version as active and subsequent versions as inactive", async () => {
    const first = await request("/admin/models", "POST", modelInput());
    expect(first.status).toBe(201);
    expect(first.body.model).toMatchObject({ modelId: "exam-readiness-demo", version: 1, isActive: true });

    const second = await request("/admin/models", "POST", modelInput("demo-v2"));
    expect(second.status).toBe(201);
    expect(second.body.model).toMatchObject({ version: 2, isActive: false });

    const listed = await request("/admin/models");
    expect(listed.status).toBe(200);
    expect((listed.body.models as Array<{ version: number; isActive: boolean }>).map((item) => [item.version, item.isActive]))
      .toEqual([[2, false], [1, true]]);
  });

  it("registers immutable evaluation datasets and rejects duplicate or malformed versions", async () => {
    const datasetId = await registerEvaluationDataset("dataset-registry-test");
    const listed = await request("/admin/model-datasets");
    expect(listed.status).toBe(200);
    expect((listed.body.datasets as Array<{ id: string; fingerprint: string }>).some((item) => item.id === datasetId && /^[a-f0-9]{64}$/.test(item.fingerprint))).toBe(true);

    const duplicate = await request("/admin/model-datasets", "POST", {
      name: "dataset-registry-test",
      task: "binary-classification",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: evaluationSamples,
      sourceDescription: "Curated held-out test fixture for model governance tests.",
      sourceAttested: true,
    });
    expect(duplicate.status).toBe(409);

    const malformed = await request("/admin/model-datasets", "POST", {
      name: "bad-dataset",
      task: "binary-classification",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: [{ features: { unexpected: 3 }, target: 0 }, ...evaluationSamples.slice(1)],
      sourceDescription: "Malformed fixture for API validation testing.",
      sourceAttested: true,
    });
    expect(malformed.status).toBe(400);
  });

  it("evaluates candidates against a baseline before activation and records the report", async () => {
    const datasetId = await registerEvaluationDataset();
    const evaluation = await request("/admin/models/exam-readiness-demo/2/evaluate", "POST", {
      baselineVersion: 1,
      datasetId,
    });
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.report).toMatchObject({
      status: "PASSED",
      candidateVersion: 2,
      baselineVersion: 1,
      sampleCount: 12,
    });
    expect((evaluation.body.report as { datasetFingerprint: string }).datasetFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const activated = await request("/admin/models/exam-readiness-demo/2/activate", "POST", {});
    expect(activated.status).toBe(200);
    expect(activated.body.model).toMatchObject({ version: 2, isActive: true });

    const rollback = await request("/admin/models/exam-readiness-demo/rollback", "POST", {});
    expect(rollback.status).toBe(200);
    expect(rollback.body.model).toMatchObject({ version: 1, isActive: true });

    const audit = await request("/admin/models/exam-readiness-demo/audit");
    expect(audit.status).toBe(200);
    const actions = (audit.body.events as Array<{ action: string; actorId: number | null }>).map((event) => event.action);
    expect(actions).toHaveLength(6);
    expect(actions).toEqual(expect.arrayContaining(["ROLLED_BACK", "ACTIVATED", "REGISTERED", "EVALUATED"]));
    expect((audit.body.events as Array<{ actorId: number | null }>).every((event) => event.actorId !== null)).toBe(true);
  });

  it("rejects a candidate that fails baseline metrics and blocks its activation", async () => {
    const reversed = fitLogisticRegression([
      { features: [0], label: 1 },
      { features: [1], label: 1 },
      { features: [9], label: 0 },
      { features: [10], label: 0 },
    ]);
    const created = await request("/admin/models", "POST", modelInput("demo-v3", reversed));
    expect(created.status).toBe(201);
    expect(created.body.model).toMatchObject({ version: 3, isActive: false });

    const datasetId = await registerEvaluationDataset("held-out-reversed-test");
    const evaluation = await request("/admin/models/exam-readiness-demo/3/evaluate", "POST", {
      baselineVersion: 1,
      datasetId,
    });
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.report).toMatchObject({ status: "REJECTED", candidateVersion: 3 });

    const activation = await request("/admin/models/exam-readiness-demo/3/activate", "POST", {});
    expect(activation.status).toBe(409);
  });

  it("enforces one active version per model at the database level", async () => {
    await expect(server.db.registeredModel.update({
      where: { modelId_version: { modelId: "exam-readiness-demo", version: 2 } },
      data: { isActive: true },
    })).rejects.toThrow();
    const active = await server.db.registeredModel.findMany({
      where: { modelId: "exam-readiness-demo", isActive: true },
    });
    expect(active).toHaveLength(1);
    expect(active[0]?.version).toBe(1);
  });

  it("runs inference only from the active, validated model", async () => {
    const prediction = await request("/admin/models/exam-readiness-demo/predict", "POST", {
      features: { practice_score: 10 },
    });
    expect(prediction.status).toBe(200);
    expect(prediction.body.prediction).toMatchObject({
      modelId: "exam-readiness-demo",
      version: 1,
      task: "binary-classification",
      prediction: 1,
    });

    const invalid = await request("/admin/models/exam-readiness-demo/predict", "POST", {
      features: { wrong_feature: 10 },
    });
    expect(invalid.status).toBe(400);
  });

  it("rejects invalid model payloads and missing model versions", async () => {
    const invalid = await request("/admin/models", "POST", {
      ...modelInput(),
      featureSchema: [{ name: "practice_score", type: "numeric" }, { name: "extra", type: "numeric" }],
    });
    expect(invalid.status).toBe(400);

    const missing = await request("/admin/models/exam-readiness-demo/999/activate", "POST", {});
    expect(missing.status).toBe(404);
  });
});
