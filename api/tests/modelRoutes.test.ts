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
      targetColumn: "target_ready",
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

  it("trains model candidates from a registered dataset without auto-promoting them", async () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({
      features: { practice_score: index },
      target: index >= 30 ? 1 : 0,
    }));
    const registered = await request("/admin/model-datasets", "POST", {
      name: "training-workflow-fixture",
      task: "binary-classification",
      targetColumn: "target_ready",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples,
      sourceDescription: "Synthetic fixture used only to test the registered training workflow.",
      sourceAttested: true,
    });
    expect(registered.status).toBe(201);
    const datasetId = (registered.body.dataset as { id: string }).id;
    const trained = await request(`/admin/model-datasets/${datasetId}/train`, "POST", {
      modelId: "training-fixture",
      seed: 42,
    });
    expect(trained.status).toBe(201);
    expect(trained.body.promoted).toBe(false);
    const models = trained.body.models as Array<{ modelId: string; version: number; isActive: boolean; rank: number; trainRows: number; testRows: number }>;
    expect(models).toHaveLength(4);
    expect(models.map((model) => model.rank)).toEqual([1, 2, 3, 4]);
    expect(trained.body.ranking).toMatchObject({ scope: "same deterministic held-out split from this training run" });
    expect(models.every((model) => model.version === 1 && model.isActive === false)).toBe(true);
    expect(models.every((model) => model.trainRows + model.testRows === 60)).toBe(true);

    const listed = await request("/admin/models");
    const registeredModels = listed.body.models as Array<{ modelId: string; isActive: boolean }>;
    expect(registeredModels.filter((model) => model.modelId.startsWith("training-fixture-"))).toHaveLength(4);
    expect(registeredModels.filter((model) => model.modelId.startsWith("training-fixture-")).every((model) => !model.isActive)).toBe(true);

    const audit = await request("/admin/models/training-fixture-logistic-regression/audit");
    expect(audit.status).toBe(200);
    expect((audit.body.events as Array<{ action: string }>).map((event) => event.action)).toContain("TRAINED");
  });

  it("serves no TensorFlow artifact unless an eligible active version exists", async () => {
    expect((await request("/models/tensorflow-fixture/active/tensorflow", "GET", undefined, "")).status).toBe(403);
    const missing = await request("/models/tensorflow-fixture/active/tensorflow");
    expect(missing.status).toBe(404);
  });

  it("activates and privately serves a production-eligible TensorFlow artifact", async () => {
    const modelId = "tensorflow-approved-fixture";
    const artifact = {
      schemaVersion: 1,
      format: "tensorflow-js-layers-model",
      modelId,
      version: 1,
      task: "regression",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      normalization: { means: [0], scales: [1] },
      modelTopology: {},
      weightSpecs: [{ name: "dense/kernel", shape: [1, 1], dtype: "float32" }],
      weightDataBase64: "AAAAAA==",
      evaluation: {
        candidateMae: 1, baselineMae: 1, candidateRmse: 1, baselineRmse: 1,
        testSamples: 20, splitMethod: "grouped-student-holdout", datasetKind: "real-anonymized",
      },
      trainedAt: new Date().toISOString(),
    };
    await server.db.registeredModel.create({
      data: {
        modelId, version: 1, algorithm: "tensorflow-js-layers", task: "regression",
        dataset: "approved-fixture", artifactJson: JSON.stringify(artifact), isActive: false,
      },
    });
    const listed = await request("/admin/models");
    expect((listed.body.models as Array<{ modelId: string; productionEligible: boolean }>).find((item) => item.modelId === modelId)?.productionEligible).toBe(true);

    const activated = await request(`/admin/models/${modelId}/1/activate`, "POST", {});
    expect(activated.status).toBe(200);
    expect(activated.body.model).toMatchObject({ modelId, version: 1, isActive: true });

    const delivered = await request(`/models/${modelId}/active/tensorflow`);
    expect(delivered.status).toBe(200);
    expect(delivered.body.artifact).toMatchObject({ modelId, version: 1, format: "tensorflow-js-layers-model" });
  });

  it("blocks synthetic TensorFlow artifacts from activation", async () => {
    const modelId = "tensorflow-gate-fixture";
    const artifact = {
      schemaVersion: 1,
      format: "tensorflow-js-layers-model",
      modelId,
      version: 1,
      task: "regression",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      normalization: { means: [0], scales: [1] },
      modelTopology: {},
      weightSpecs: [{ name: "dense/kernel", shape: [1, 1], dtype: "float32" }],
      weightDataBase64: "AAAAAA==",
      evaluation: {
        candidateMae: 1, baselineMae: 1, candidateRmse: 1, baselineRmse: 1,
        testSamples: 20, splitMethod: "grouped-student-holdout", datasetKind: "synthetic",
      },
      trainedAt: new Date().toISOString(),
    };
    await server.db.registeredModel.create({
      data: {
        modelId, version: 1, algorithm: "tensorflow-js-layers", task: "regression",
        dataset: "synthetic-fixture", artifactJson: JSON.stringify(artifact), isActive: false,
      },
    });
    const activation = await request(`/admin/models/${modelId}/1/activate`, "POST", {});
    expect(activation.status).toBe(409);
    expect(String(activation.body.error ?? activation.body.message)).toContain("real-anonymized production eligibility");
  });

  it("requires privacy-preserving learner groups for TensorFlow.js training", async () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({
      features: { practice_score: index },
      target: index * 1.5 + (index % 3),
    }));
    const registered = await request("/admin/model-datasets", "POST", {
      name: "tensorflow-missing-groups",
      task: "regression",
      targetColumn: "next_score",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples,
      sourceDescription: "Synthetic fixture for TensorFlow group validation.",
      sourceAttested: true,
    });
    expect(registered.status).toBe(201);
    const datasetId = (registered.body.dataset as { id: string }).id;
    const rejected = await request(`/admin/model-datasets/${datasetId}/train-tensorflow`, "POST", {
      modelId: "tensorflow-fixture",
    });
    expect(rejected.status).toBe(400);
    expect(String(rejected.body.error ?? rejected.body.message)).toContain("keyed HMAC-SHA-256 pseudonymous groupId");
  });

  it("runs grouped TensorFlow.js training through the registered dataset route without promotion", async () => {
    const samples = Array.from({ length: 100 }, (_, index) => ({
      features: { practice_score: index },
      target: index * 0.5 + (index % 4) * 0.1,
      groupId: Math.floor(index / 10).toString(16).padStart(64, "0"),
    }));
    const registered = await request("/admin/model-datasets", "POST", {
      name: "tensorflow-route-training-fixture",
      task: "regression",
      targetColumn: "next_score",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples,
      sourceDescription: "Synthetic route integration fixture for TensorFlow training.",
      sourceAttested: true,
      datasetKind: "synthetic",
    });
    expect(registered.status).toBe(201);
    const datasetId = (registered.body.dataset as { id: string }).id;
    const trained = await request(`/admin/model-datasets/${datasetId}/train-tensorflow`, "POST", {
      modelId: "tensorflow-route-fixture",
      seed: 42,
      epochs: 12,
      batchSize: 16,
    });
    expect(trained.status).toBe(201);
    expect(trained.body).toMatchObject({
      ok: true,
      promoted: false,
      productionEligible: false,
      split: { trainRows: 80, testRows: 20, trainGroups: 8, testGroups: 2 },
    });
    expect(trained.body.candidate).toMatchObject({ rows: 20 });
    expect(trained.body.baseline).toMatchObject({ rows: 20 });
  });

  it("persists explicit model dataset provenance and defaults old-style uploads to synthetic", async () => {
    const realSamples = Array.from({ length: 30 }, (_, index) => ({
      features: { practice_score: index },
      target: index * 1.25,
      groupId: index.toString(16).padStart(64, "0"),
    }));
    const created = await request("/admin/model-datasets", "POST", {
      name: "real-anonymized-provenance-fixture",
      task: "regression",
      targetColumn: "next_score",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: realSamples,
      sourceDescription: "Anonymized and consented historical practice outcomes for model validation.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(created.status).toBe(201);
    expect(created.body.dataset).toMatchObject({ datasetKind: "real-anonymized", sourceAttested: true });
    const id = (created.body.dataset as { id: string }).id;
    const stored = await server.db.modelDataset.findUnique({ where: { id } });
    expect(stored?.datasetKind).toBe("real-anonymized");
  });

  it("rejects TensorFlow.js training for classification datasets", async () => {
    const datasetId = await registerEvaluationDataset("tensorflow-classification-rejected");
    const rejected = await request(`/admin/model-datasets/${datasetId}/train-tensorflow`, "POST", {
      modelId: "tensorflow-classification",
    });
    expect(rejected.status).toBe(400);
    expect(String(rejected.body.error ?? rejected.body.message)).toContain("regression datasets only");
  });

  it("enforces the exact student population feature schema and accuracy target range", async () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({
      features: {
        completed_attempts: 3 + Math.floor(index / 2),
        previous_accuracy: 0.5 + (index % 5) / 10,
        recent_average_accuracy: 0.55 + (index % 4) / 10,
        overall_average_accuracy: 0.6 + (index % 3) / 10,
        previous_question_count: 10 + (index % 5),
      },
      target: 0.5 + (index % 5) / 10,
      groupId: Math.floor(index / 6).toString(16).padStart(64, "0"),
    }));
    const schema = [
      { name: "completed_attempts", type: "numeric" },
      { name: "previous_accuracy", type: "numeric" },
      { name: "recent_average_accuracy", type: "numeric" },
      { name: "overall_average_accuracy", type: "numeric" },
      { name: "previous_question_count", type: "numeric" },
    ];
    const registered = await request("/admin/model-datasets", "POST", {
      name: "student-population-contract-valid",
      task: "regression",
      targetColumn: "next_attempt_accuracy",
      featureSchema: schema,
      samples,
      sourceDescription: "Synthetic fixture validating the student population feature contract.",
      sourceAttested: true,
      datasetKind: "synthetic",
    });
    expect(registered.status).toBe(201);
    const datasetId = (registered.body.dataset as { id: string }).id;
    const invalidTarget = await server.db.modelDataset.update({
      where: { id: datasetId },
      data: { samplesJson: JSON.stringify(samples.map((sample, index) => index === 0 ? { ...sample, target: 1.2 } : sample)) },
    });
    expect(invalidTarget.id).toBe(datasetId);
    const rejectedTarget = await request(`/admin/model-datasets/${datasetId}/train-tensorflow`, "POST", {
      modelId: "student-score-population",
      epochs: 2,
    });
    expect(rejectedTarget.status).toBe(400);
    expect(String(rejectedTarget.body.error ?? rejectedTarget.body.message)).toContain("targets must be between 0 and 1");
  });

  it("rejects an incompatible feature schema for the student population model", async () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({
      features: { practice_score: index },
      target: index / 60,
      groupId: Math.floor(index / 6).toString(16).padStart(64, "0"),
    }));
    const registered = await request("/admin/model-datasets", "POST", {
      name: "student-population-contract-invalid-schema",
      task: "regression",
      targetColumn: "next_attempt_accuracy",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples,
      sourceDescription: "Synthetic fixture validating student population feature schema rejection.",
      sourceAttested: true,
    });
    expect(registered.status).toBe(201);
    const datasetId = (registered.body.dataset as { id: string }).id;
    const rejected = await request(`/admin/model-datasets/${datasetId}/train-tensorflow`, "POST", {
      modelId: "student-score-population",
    });
    expect(rejected.status).toBe(400);
    expect(String(rejected.body.error ?? rejected.body.message)).toContain("exactly the five registered student inference features");
  });

  it("registers immutable evaluation datasets and rejects duplicate or malformed versions", async () => {
    const datasetId = await registerEvaluationDataset("dataset-registry-test");
    const listed = await request("/admin/model-datasets");
    expect(listed.status).toBe(200);
    expect((listed.body.datasets as Array<{ id: string; fingerprint: string }>).some((item) => item.id === datasetId && /^[a-f0-9]{64}$/.test(item.fingerprint))).toBe(true);

    const duplicate = await request("/admin/model-datasets", "POST", {
      name: "dataset-registry-test",
      task: "binary-classification",
      targetColumn: "target_ready",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: evaluationSamples,
      sourceDescription: "Curated held-out test fixture for model governance tests.",
      sourceAttested: true,
    });
    expect(duplicate.status).toBe(409);

    const malformed = await request("/admin/model-datasets", "POST", {
      name: "bad-dataset",
      task: "binary-classification",
      targetColumn: "target_ready",
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

  it("runs inference, returns confidence and records privacy-preserving drift buckets", async () => {
    const driftDatasetId = await registerEvaluationDataset("drift-inference-baseline");
    await server.db.registeredModel.update({
      where: { modelId_version: { modelId: "exam-readiness-demo", version: 1 } },
      data: { trainingDatasetId: driftDatasetId },
    });
    const prediction = await request("/admin/models/exam-readiness-demo/predict", "POST", {
      features: { practice_score: 10 },
    });
    expect(prediction.status).toBe(200);
    expect(prediction.body.prediction).toMatchObject({
      modelId: "exam-readiness-demo",
      version: 1,
      task: "binary-classification",
      prediction: 1,
      confidenceLevel: expect.stringMatching(/^(high|moderate|low)$/),
    });
    expect((prediction.body.prediction as { confidence: number }).confidence).toBeGreaterThanOrEqual(0.5);

    await Promise.all(Array.from({ length: 12 }, () => request("/admin/models/exam-readiness-demo/predict", "POST", {
      features: { practice_score: 10 },
    })));
    const drift = await request("/admin/models/exam-readiness-demo/1/drift");
    expect(drift.status).toBe(200);
    expect(drift.body).toMatchObject({ modelId: "exam-readiness-demo", version: 1, baselineDataset: "drift-inference-baseline", windowDays: 30 });
    expect((drift.body.features as Array<{ sampleCount: number }>)[0]?.sampleCount).toBe(13);

    const buckets = await server.db.modelDriftBucket.findMany({ where: { modelId: "exam-readiness-demo", version: 1 } });
    expect(buckets.length).toBeGreaterThan(0);
    expect(buckets.every((bucket) => !bucket.bucket.includes("10"))).toBe(true);

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
