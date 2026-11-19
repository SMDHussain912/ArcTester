import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { fitLogisticRegression } from "../src/intelligence/logisticRegression.js";
import { startTestServer, signUp, type TestServer } from "./server.js";

describe("admin model registry API", () => {
  let server = undefined as unknown as TestServer;
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
    if (server) await server.close();
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

  async function registerEvaluationDataset(
    name = "held-out-demo-v1",
    datasetKind: "synthetic" | "real-anonymized" = "synthetic",
    groupOffset = 0,
  ) {
    const created = await request("/admin/model-datasets", "POST", {
      name,
      task: "binary-classification",
      targetColumn: "target_ready",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: datasetKind === "real-anonymized"
        ? evaluationSamples.map((sample, index) => ({
          ...sample,
          // Six deterministic pseudonymous learner groups, each represented in both classes.
          groupId: (index % 6 + groupOffset).toString(16).padStart(64, "0"),
        }))
        : evaluationSamples,
      sourceDescription: datasetKind === "real-anonymized"
        ? "Curated held-out real-anonymized test fixture with privacy-safe learner grouping for model governance tests."
        : "Curated held-out synthetic test fixture for model governance tests.",
      sourceAttested: true,
      datasetKind,
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

  it("reports adaptive learning outcomes without exposing learner identifiers or question content", async () => {
    const attempt = await server.db.attempt.create({
      data: { userId: (await signUp(server.baseUrl, "adaptive-analytics-student@example.com")).userId, mode: "practice" },
    });
    await server.db.adaptiveDecisionLog.createMany({
      data: [
        {
          attemptId: attempt.id, learnerGroupId: "a".repeat(64), selectedQuestionId: 910001,
          eligibleQuestionIdsJson: "[910001,910002]", selectionProbability: 1,
          stateFeaturesJson: "[12,0.7,1,0,3]", policyVersion: 2,
          policyMode: "deterministic-top-k", reasonCode: "WEAK_TOPIC",
          selectionScore: 2.25, outcomeStatus: "correct", reward: 1,
        },
        {
          attemptId: attempt.id, learnerGroupId: "a".repeat(64), selectedQuestionId: 910002,
          eligibleQuestionIdsJson: "[910001,910002]", selectionProbability: 1,
          stateFeaturesJson: "[12,0.7,1,0,3]", policyVersion: 2,
          policyMode: "deterministic-top-k", reasonCode: "NOVELTY",
          selectionScore: 1.5, outcomeStatus: "pending", reward: null,
        },
      ],
    });

    const report = await request("/admin/adaptive-learning/analytics?days=30");
    expect(report.status).toBe(200);
    expect(report.body.summary).toMatchObject({
      selected: 2, observed: 1, pending: 1, averageReward: 1,
      averageSelectionScore: 1.875, outcomeCoverage: 0.5,
    });
    expect(report.body.byReason).toEqual(expect.arrayContaining([
      { reasonCode: "WEAK_TOPIC", count: 1 }, { reasonCode: "NOVELTY", count: 1 },
    ]));
    expect(report.body.privacy).toEqual({
      learnerIdentifiersIncluded: false, questionTextIncluded: false,
    });
    expect(JSON.stringify(report.body)).not.toContain("aaaaaaaa");
    expect((await request("/admin/adaptive-learning/analytics?days=999")).status).toBe(400);
    expect((await request("/admin/adaptive-learning/analytics", "GET", undefined, studentCookie)).status).toBe(403);
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

    const missingReason = await request("/admin/models/exam-readiness-demo/2/activate", "POST", {});
    expect(missingReason.status).toBe(400);
    expect(missingReason.body.reasons).toEqual(expect.arrayContaining([expect.stringContaining("reason")]));
  });

  it("trains only the approved logistic baseline from a registered dataset without auto-promoting it", async () => {
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
    expect(trained.status, JSON.stringify(trained.body)).toBe(201);
    expect(trained.body.promoted).toBe(false);
    const models = trained.body.models as Array<{ modelId: string; version: number; isActive: boolean; rank: number; trainRows: number; testRows: number }>;
    expect(models).toHaveLength(1);
    expect(models[0]?.modelId).toBe("training-fixture-logistic-regression");
    expect(models.map((model) => model.rank)).toEqual([1]);
    expect(trained.body.ranking).toMatchObject({ scope: "same deterministic held-out split from this training run" });
    expect(models.every((model) => model.version === 1 && model.isActive === false)).toBe(true);
    expect(models.every((model) => model.trainRows + model.testRows === 60)).toBe(true);

    const listed = await request("/admin/models");
    const registeredModels = listed.body.models as Array<{ modelId: string; isActive: boolean }>;
    expect(registeredModels.filter((model) => model.modelId.startsWith("training-fixture-"))).toHaveLength(1);
    expect(registeredModels.filter((model) => model.modelId.startsWith("training-fixture-")).every((model) => !model.isActive)).toBe(true);

    const audit = await request("/admin/models/training-fixture-logistic-regression/audit");
    expect(audit.status).toBe(200);
    expect((audit.body.events as Array<{ action: string }>).map((event) => event.action)).toContain("TRAINED");
  });

  it("trains a multiclass readiness candidate only from attested grouped learner data", async () => {
    const samples = Array.from({ length: 90 }, (_, index) => {
      const group = Math.floor(index / 3);
      const label = group % 3;
      return {
        groupId: group.toString(16).padStart(64, "0"),
        features: { mastery_signal: label * 0.45 + (index % 3) * 0.001, completed_attempts: 10 + index % 4 },
        target: label,
      };
    });
    const registered = await request("/admin/model-datasets", "POST", {
      name: "readiness-multiclass-training-fixture",
      task: "multiclass-classification",
      targetColumn: "readiness_label",
      featureSchema: [
        { name: "mastery_signal", type: "numeric" },
        { name: "completed_attempts", type: "numeric" },
      ],
      samples,
      sourceDescription: "Attested real-anonymized learner snapshots with keyed pseudonymous learner groups for readiness training tests.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(registered.status).toBe(201);
    const datasetId = (registered.body.dataset as { id: string }).id;
    const trained = await request(`/admin/model-datasets/${datasetId}/train-readiness`, "POST", {
      modelId: "readiness-fixture",
      seed: 42,
    });
    expect(trained.status, JSON.stringify(trained.body)).toBe(201);
    expect(trained.body.promoted).toBe(false);
    const secondTraining = await request(`/admin/model-datasets/${datasetId}/train-readiness`, "POST", {
      modelId: "readiness-fixture",
      seed: 42,
    });
    expect(secondTraining.status).toBe(201);
    expect(secondTraining.body.model).toMatchObject({ version: 2, isActive: false });

    const undersizedEvaluation = await request("/admin/model-datasets", "POST", {
      name: "readiness-multiclass-undersized-evaluation",
      task: "multiclass-classification",
      targetColumn: "readiness_label",
      featureSchema: [
        { name: "mastery_signal", type: "numeric" },
        { name: "completed_attempts", type: "numeric" },
      ],
      samples: samples.map((sample, index) => ({
        ...sample,
        groupId: (Math.floor(index / 3) + 100).toString(16).padStart(64, "0"),
        features: { ...sample.features, mastery_signal: sample.features.mastery_signal + 0.002 },
      })),
      sourceDescription: "Independent attested real-anonymized learner holdout for minimum sample-size validation.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(undersizedEvaluation.status).toBe(201);
    const undersizedId = (undersizedEvaluation.body.dataset as { id: string }).id;
    const undersizedReport = await request("/admin/models/readiness-fixture-exam-readiness-softmax/2/evaluate", "POST", {
      baselineVersion: 1,
      datasetId: undersizedId,
    });
    expect(undersizedReport.status).toBe(400);
    expect(String(undersizedReport.body.error ?? undersizedReport.body.message)).toContain("1,000");

    const evaluationSamples = Array.from({ length: 1200 }, (_, index) => {
      const label = Math.floor(index / 400);
      return {
        groupId: (100 + Math.floor(index / 10)).toString(16).padStart(64, "0"),
        features: {
          mastery_signal: label * 0.45 + (index % 10) * 0.001,
          completed_attempts: 10 + (index % 4),
        },
        target: label,
      };
    });
    const evaluationDataset = await request("/admin/model-datasets", "POST", {
      name: "readiness-multiclass-independent-evaluation",
      task: "multiclass-classification",
      targetColumn: "readiness_label",
      featureSchema: [
        { name: "mastery_signal", type: "numeric" },
        { name: "completed_attempts", type: "numeric" },
      ],
      samples: evaluationSamples,
      sourceDescription: "Independent attested real-anonymized learner holdout with privacy-safe pseudonymous learner groups for readiness evaluation.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(evaluationDataset.status).toBe(201);
    const evaluationDatasetId = (evaluationDataset.body.dataset as { id: string }).id;
    const evaluation = await request("/admin/models/readiness-fixture-exam-readiness-softmax/2/evaluate", "POST", {
      baselineVersion: 1,
      datasetId: evaluationDatasetId,
    });
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.report).toMatchObject({ status: "PASSED" });
    const activated = await request("/admin/models/readiness-fixture-exam-readiness-softmax/2/activate", "POST", {
      reason: "Independent multiclass holdout passed.",
    });
    expect(activated.status).toBe(200);
    expect(activated.body.model).toMatchObject({ version: 2, isActive: true });

    expect(trained.body.model).toMatchObject({
      modelId: "readiness-fixture-exam-readiness-softmax",
      version: 1,
      algorithm: "exam-readiness-softmax",
      task: "multiclass-classification",
      isActive: false,
    });
    const listed = await request("/admin/models");
    const candidates = (listed.body.models as Array<{ modelId: string; isActive: boolean }>)
      .filter((model) => model.modelId === "readiness-fixture-exam-readiness-softmax");
    expect(candidates).toHaveLength(2);
    expect(candidates.find((model) => model.isActive)?.modelId).toBe("readiness-fixture-exam-readiness-softmax");
    const audit = await request("/admin/models/readiness-fixture-exam-readiness-softmax/audit");
    expect(audit.status).toBe(200);
    const auditEvents = audit.body.events as Array<{ action: string; details: Record<string, unknown> }>;
    expect(auditEvents.some((event) => event.action === "TRAINED" &&
      event.details.learnerGroups === 30 && event.details.evaluationRequired === true)).toBe(true);
    expect(auditEvents.map((event) => event.action)).toContain("ACTIVATED");
  });

  it("rejects evaluation datasets reused to train either compared model", async () => {
    const samples = Array.from({ length: 60 }, (_, index) => ({
      features: { practice_score: index },
      target: index >= 30 ? 1 : 0,
    }));
    const created = await request("/admin/model-datasets", "POST", {
      name: "evaluation-training-overlap",
      task: "binary-classification",
      targetColumn: "target_ready",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples,
      sourceDescription: "Fixture proving training and evaluation data are isolated.",
      sourceAttested: true,
    });
    expect(created.status).toBe(201);
    const datasetId = (created.body.dataset as { id: string }).id;
    const trained = await request(`/admin/model-datasets/${datasetId}/train`, "POST", {
      modelId: "overlap-fixture",
      seed: 42,
    });
    expect(trained.status).toBe(201);

    const modelId = "overlap-fixture-logistic-regression";
    const baseline = await request("/admin/models", "POST", {
      ...modelInput("independent-baseline"),
      modelId,
    });
    expect(baseline.status).toBe(201);

    const evaluation = await request(`/admin/models/${modelId}/1/evaluate`, "POST", {
      baselineVersion: 2,
      datasetId,
    });
    expect(evaluation.status).toBe(409);
    expect(String(evaluation.body.error ?? evaluation.body.message)).toContain("separate");
  });

  it("rejects evaluation datasets that reuse pseudonymous learners from a different training dataset", async () => {
    const trainingSamples = Array.from({ length: 120 }, (_, index) => ({
      features: { practice_score: index },
      target: index % 2,
      groupId: index.toString(16).padStart(64, "0"),
    }));
    const trainingDataset = await request("/admin/model-datasets", "POST", {
      name: "group-overlap-training",
      task: "binary-classification",
      targetColumn: "target_ready",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: trainingSamples,
      sourceDescription: "Attested grouped learner training fixture for leakage prevention.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(trainingDataset.status).toBe(201);
    const trainingDatasetId = (trainingDataset.body.dataset as { id: string }).id;
    const trained = await request(`/admin/model-datasets/${trainingDatasetId}/train`, "POST", {
      modelId: "group-overlap-fixture",
      seed: 42,
    });
    expect(trained.status).toBe(201);

    const modelId = "group-overlap-fixture-logistic-regression";
    const baseline = await request("/admin/models", "POST", {
      ...modelInput("independent-baseline"),
      modelId,
    });
    expect(baseline.status).toBe(201);

    const evaluationSamples = Array.from({ length: 30 }, (_, index) => ({
      features: { practice_score: index + 0.5 },
      target: index >= 15 ? 1 : 0,
      groupId: Math.floor(index / 5).toString(16).padStart(64, "0"),
    }));
    const evaluationDataset = await request("/admin/model-datasets", "POST", {
      name: "group-overlap-different-dataset",
      task: "binary-classification",
      targetColumn: "target_ready",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples: evaluationSamples,
      sourceDescription: "Separate upload intentionally reusing learner groups to test leakage protection.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(evaluationDataset.status).toBe(201);
    const evaluationDatasetId = (evaluationDataset.body.dataset as { id: string }).id;

    const evaluation = await request(`/admin/models/${modelId}/1/evaluate`, "POST", {
      baselineVersion: 2,
      datasetId: evaluationDatasetId,
    });
    expect(evaluation.status).toBe(409);
    expect(String(evaluation.body.error ?? evaluation.body.message)).toContain("learner groups already present");
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

    const activated = await request(`/admin/models/${modelId}/1/activate`, "POST", { reason: "Approve verified production-eligible candidate." });
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
    const activation = await request(`/admin/models/${modelId}/1/activate`, "POST", { reason: "Approve verified production-eligible candidate." });
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

  it("queues grouped TensorFlow.js training through the compatibility route", async () => {
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
    expect(trained.status).toBe(202);
    expect(trained.body).toMatchObject({
      ok: true,
      job: {
        datasetId,
        modelId: "tensorflow-route-fixture",
        seed: 42,
        epochs: 12,
        batchSize: 16,
        status: "QUEUED",
        progress: 0,
        result: null,
      },
      statusUrl: expect.stringMatching(/^\/admin\/model-training-jobs\//),
    });
    const jobId = (trained.body.job as { id: string }).id;
    const persisted = await server.db.modelTrainingJob.findUnique({ where: { id: jobId } });
    expect(persisted).toMatchObject({ datasetId, modelId: "tensorflow-route-fixture", status: "QUEUED" });
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

  it("requires explicit authorization and enough learner history before building performance data", async () => {
    const missingAttestation = await request("/admin/model-datasets/build-performance", "POST", {
      name: "performance-builder-unattested",
      sourceDescription: "Authorized practice history source",
      sourceAttested: false,
    });
    expect(missingAttestation.status).toBe(400);

    const insufficient = await request("/admin/model-datasets/build-performance", "POST", {
      name: "performance-builder-insufficient",
      sourceDescription: "Authorized anonymized practice history for model training.",
      sourceAttested: true,
    });
    expect(insufficient.status).toBe(409);
    expect(insufficient.body.qualification).toMatchObject({
      requiredRows: 500,
      requiredLearnerGroups: 50,
      sampleCount: 0,
      learnerGroupCount: 0,
    });
    expect(String(insufficient.body.error)).toContain("improving and declining trajectories");
  });

  it("trains canonical performance models with chronological splits and evaluates against the linear baseline", async () => {
    const featureSchema = [
      "completed_attempts",
      "previous_accuracy",
      "recent_accuracy_mean_3",
      "overall_accuracy_mean",
      "previous_question_count",
      "recent_accuracy_slope_3",
      "topic_coverage_ratio",
      "topic_coverage_ratio_missing",
      "days_since_last_attempt",
      "subject_accuracy_mathematics_12345678",
      "subject_accuracy_mathematics_12345678_missing",
    ].map((name) => ({ name, type: "numeric" as const }));
    const featureNames = featureSchema.map((feature) => feature.name);
    const trainingSamples = Array.from({ length: 50 }, (_, groupIndex) =>
      Array.from({ length: 11 }, (_, sampleIndex) => {
        const improving = groupIndex < 25;
        const target = improving ? 0.2 + sampleIndex * 0.05 : 0.8 - sampleIndex * 0.05;
        const features = Object.fromEntries(featureNames.map((name) => [name, ({
          completed_attempts: sampleIndex + 3,
          previous_accuracy: Math.max(0, target - 0.05),
          recent_accuracy_mean_3: Math.max(0, target - 0.1),
          overall_accuracy_mean: target,
          previous_question_count: 10,
          recent_accuracy_slope_3: improving ? 0.04 : -0.04,
          topic_coverage_ratio: 0.7,
          topic_coverage_ratio_missing: 0,
          days_since_last_attempt: 1,
          subject_accuracy_mathematics_12345678: 0.6,
          subject_accuracy_mathematics_12345678_missing: 0,
        })[name]]));
        return {
          features,
          target,
          groupId: groupIndex.toString(16).padStart(64, "0"),
          occurredAt: new Date(Date.UTC(2026, 0, 1) +
            (groupIndex * 10 + 3 + sampleIndex) * 24 * 60 * 60 * 1000).toISOString(),
          unansweredCount: 0,
        };
      })).flat();
    const created = await request("/admin/model-datasets", "POST", {
      name: "performance-point-in-time-training-v1",
      task: "regression",
      targetColumn: "next_attempt_accuracy",
      featureSchema,
      samples: trainingSamples,
      sourceDescription: "ArcTester point-in-time performance-v1 extraction; authorized training cohort fixture.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(created.status).toBe(201);
    const datasetId = (created.body.dataset as { id: string }).id;
    const trained = await request(`/admin/model-datasets/${datasetId}/train`, "POST", {
      modelId: "performance",
      seed: 42,
    });
    expect(trained.status).toBe(201);
    expect(trained.body.models.map((model: { modelId: string }) => model.modelId).sort()).toEqual([
      "performance-gradient-boosting",
      "performance-multiple-linear-regression",
      "performance-random-forest",
    ]);
    expect(trained.body.models.every((model: { isActive: boolean }) => !model.isActive)).toBe(true);
    expect(trained.body.models.find((model: { modelId: string }) => model.modelId === "performance-gradient-boosting"))
      .toMatchObject({
        splitStrategy: "chronological-grouped-70-15-15",
        timeSplit: { trainGroups: 35, validationGroups: 7, testGroups: 8 },
      });

    const evaluationSamples = Array.from({ length: 200 }, (_, index) => {
      const groupIndex = Math.floor(index / 4);
      const target = 0.3 + (index % 4) * 0.1;
      const features = Object.fromEntries(featureNames.map((name) => [name, ({
        completed_attempts: 14 + index % 5,
        previous_accuracy: target - 0.05,
        recent_accuracy_mean_3: target - 0.1,
        overall_accuracy_mean: target,
        previous_question_count: 10,
        recent_accuracy_slope_3: 0.02,
        topic_coverage_ratio: 0.75,
        topic_coverage_ratio_missing: 0,
        days_since_last_attempt: 2,
        subject_accuracy_mathematics_12345678: 0.65,
        subject_accuracy_mathematics_12345678_missing: 0,
      })[name]]));
      return {
        features,
        target,
        groupId: (100 + groupIndex).toString(16).padStart(64, "0"),
        occurredAt: new Date(Date.UTC(2026, 6, 1) +
          (groupIndex * 4 + index % 4) * 24 * 60 * 60 * 1000).toISOString(),
        unansweredCount: index % 2,
      };
    });
    const holdout = await request("/admin/model-datasets", "POST", {
      name: "performance-independent-holdout-v1",
      task: "regression",
      targetColumn: "next_attempt_accuracy",
      featureSchema,
      samples: evaluationSamples,
      sourceDescription: "Independent authorized real-anonymized performance holdout cohort.",
      sourceAttested: true,
      datasetKind: "real-anonymized",
    });
    expect(holdout.status).toBe(201);
    const evaluation = await request("/admin/models/performance-gradient-boosting/1/evaluate", "POST", {
      baselineModelId: "performance-multiple-linear-regression",
      baselineVersion: 1,
      datasetId: (holdout.body.dataset as { id: string }).id,
    });
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.report).toMatchObject({
      baselineModelId: "performance-multiple-linear-regression",
      sampleCount: 200,
    });
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
    const candidateTrainingId = await registerEvaluationDataset("candidate-training-demo-v1", "real-anonymized", 100);
    const baselineTrainingId = await registerEvaluationDataset("baseline-training-demo-v1", "real-anonymized", 200);
    await server.db.registeredModel.update({
      where: { modelId_version: { modelId: "exam-readiness-demo", version: 2 } },
      data: { trainingDatasetId: candidateTrainingId },
    });
    await server.db.registeredModel.update({
      where: { modelId_version: { modelId: "exam-readiness-demo", version: 1 } },
      data: { trainingDatasetId: baselineTrainingId },
    });
    const datasetId = await registerEvaluationDataset("held-out-demo-v1", "real-anonymized");
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

    const activated = await request("/admin/models/exam-readiness-demo/2/activate", "POST", { reason: "Passed independent real-anonymized holdout evaluation." });
    expect(activated.status).toBe(200);
    expect(activated.body.model).toMatchObject({ version: 2, isActive: true });

    const previousVersionEvaluation = await request("/admin/models/exam-readiness-demo/1/evaluate", "POST", {
      baselineVersion: 2,
      datasetId,
    });
    expect(previousVersionEvaluation.status).toBe(200);
    expect(previousVersionEvaluation.body.report).toMatchObject({ status: "PASSED", candidateVersion: 1, baselineVersion: 2 });

    const rollback = await request("/admin/models/exam-readiness-demo/rollback", "POST", { reason: "Rollback after a monitored quality regression." });
    expect(rollback.status).toBe(200);
    expect(rollback.body.model).toMatchObject({ version: 1, isActive: true });

    const audit = await request("/admin/models/exam-readiness-demo/audit");
    expect(audit.status).toBe(200);
    const actions = (audit.body.events as Array<{ action: string; actorId: number | null }>).map((event) => event.action);
    expect(actions).toHaveLength(7);
    expect(actions).toEqual(expect.arrayContaining(["ROLLED_BACK", "ACTIVATED", "REGISTERED", "EVALUATED"]));
    expect((audit.body.events as Array<{ actorId: number | null }>).every((event) => event.actorId !== null)).toBe(true);
    const rollbackEvent = (audit.body.events as Array<{ action: string; details: { reason?: string } }>).find((event) => event.action === "ROLLED_BACK");
    const activationEvent = (audit.body.events as Array<{ action: string; details: { reason?: string } }>).find((event) => event.action === "ACTIVATED");
    expect(rollbackEvent?.details.reason).toBe("Rollback after a monitored quality regression.");
    expect(activationEvent?.details.reason).toBe("Passed independent real-anonymized holdout evaluation.");
  });

  it("blocks rollback when the previous version lacks production evaluation evidence", async () => {
    const modelId = "rollback-evidence-gate";
    const first = await request("/admin/models", "POST", { ...modelInput("rollback-v1"), modelId });
    expect(first.status).toBe(201);
    const second = await request("/admin/models", "POST", { ...modelInput("rollback-v2"), modelId });
    expect(second.status).toBe(201);
    const previousTrainingId = await registerEvaluationDataset("rollback-previous-training", "real-anonymized", 200);
    const candidateTrainingId = await registerEvaluationDataset("rollback-candidate-training", "real-anonymized", 100);
    await server.db.registeredModel.update({
      where: { modelId_version: { modelId, version: 1 } },
      data: { trainingDatasetId: previousTrainingId },
    });
    await server.db.registeredModel.update({
      where: { modelId_version: { modelId, version: 2 } },
      data: { trainingDatasetId: candidateTrainingId },
    });
    const datasetId = await registerEvaluationDataset("rollback-candidate-real", "real-anonymized");
    const evaluated = await request(`/admin/models/${modelId}/2/evaluate`, "POST", { baselineVersion: 1, datasetId });
    expect(evaluated.status).toBe(200);
    expect(evaluated.body.report).toMatchObject({ status: "PASSED" });
    expect((await request(`/admin/models/${modelId}/2/activate`, "POST", { reason: "Independent holdout passed for the candidate version." })).status).toBe(200);

    const rollback = await request(`/admin/models/${modelId}/rollback`, "POST", { reason: "Attempt rollback without evaluating the old version." });
    expect(rollback.status).toBe(409);
    expect(String(rollback.body.error ?? rollback.body.message)).toContain("passing evaluation");
    const active = await server.db.registeredModel.findMany({ where: { modelId, isActive: true } });
    expect(active.map((model) => model.version)).toEqual([2]);
  });

  it("blocks production promotion when a candidate has no registered training provenance", async () => {
    const modelId = "missing-training-provenance";
    const first = await request("/admin/models", "POST", { ...modelInput("provenance-baseline"), modelId });
    expect(first.status).toBe(201);
    const second = await request("/admin/models", "POST", { ...modelInput("provenance-candidate"), modelId });
    expect(second.status).toBe(201);
    const datasetId = await registerEvaluationDataset("provenance-real-holdout", "real-anonymized");
    const evaluation = await request(`/admin/models/${modelId}/2/evaluate`, "POST", {
      baselineVersion: 1,
      datasetId,
    });
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.report).toMatchObject({ status: "PASSED" });
    const activation = await request(`/admin/models/${modelId}/2/activate`, "POST", {
      reason: "Verify that an unproven candidate cannot enter production.",
    });
    expect(activation.status).toBe(409);
    expect(String(activation.body.error ?? activation.body.message)).toContain("registered, attested real-anonymized dataset");
  });

  it("blocks production activation when a passing evaluation used synthetic data", async () => {
    const modelId = "synthetic-evaluation-gate";
    const first = await request("/admin/models", "POST", { ...modelInput("synthetic-baseline"), modelId });
    expect(first.status).toBe(201);
    const second = await request("/admin/models", "POST", { ...modelInput("synthetic-candidate"), modelId });
    expect(second.status).toBe(201);

    const trainingDatasetId = await registerEvaluationDataset("synthetic-gate-training", "real-anonymized", 100);
    await server.db.registeredModel.update({
      where: { modelId_version: { modelId, version: 2 } },
      data: { trainingDatasetId },
    });
    const datasetId = await registerEvaluationDataset("synthetic-promotion-fixture", "synthetic");
    const evaluation = await request(`/admin/models/${modelId}/2/evaluate`, "POST", {
      baselineVersion: 1,
      datasetId,
    });
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.report).toMatchObject({ status: "PASSED" });

    const activation = await request(`/admin/models/${modelId}/2/activate`, "POST", { reason: "Test activation rejection for synthetic evaluation." });
    expect(activation.status).toBe(409);
    expect(String(activation.body.error ?? activation.body.message)).toContain("real-anonymized");
    const versions = await server.db.registeredModel.findMany({ where: { modelId, isActive: true } });
    expect(versions.map((model) => model.version)).toEqual([1]);
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

    const activation = await request("/admin/models/exam-readiness-demo/3/activate", "POST", { reason: "Test rejection of candidate below baseline." });
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

    const missing = await request("/admin/models/exam-readiness-demo/999/activate", "POST", { reason: "Test missing model version handling." });
    expect(missing.status).toBe(404);
  });
});
