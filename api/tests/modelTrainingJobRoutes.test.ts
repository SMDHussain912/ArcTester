import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { runNextModelTrainingJob } from "../src/modelTrainingWorker.js";
import { signUp, startTestServer, type TestServer } from "./server.js";

type TrainingJobResponseBody = Record<string, unknown> & {
  dataset: { id: string };
  job: {
    id: string;
    status: string;
    progress: number;
    modelId: string;
    errorMessage: string;
    result: unknown;
  };
};

describe("durable TensorFlow training jobs", () => {
  let server: TestServer;
  let adminCookie: string;
  let studentCookie: string;
  let datasetId: string;

  async function request(path: string, method = "GET", body?: unknown, cookie = adminCookie) {
    const response = await fetch(`${server.baseUrl}${path}`, {
      method,
      headers: {
        cookie,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: response.status, body: await response.json() as TrainingJobResponseBody };
  }

  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await signUp(server.baseUrl, "training-job-admin@example.com");
    adminCookie = admin.cookie;
    await server.db.user.update({ where: { id: admin.userId }, data: { role: "ADMIN" } });
    studentCookie = (await signUp(server.baseUrl, "training-job-student@example.com")).cookie;

    const samples = Array.from({ length: 100 }, (_, index) => ({
      features: { practice_score: index },
      target: index * 0.5 + (index % 4) * 0.1,
      groupId: Math.floor(index / 10).toString(16).padStart(64, "0"),
    }));
    const registered = await request("/admin/model-datasets", "POST", {
      name: "durable-training-job-fixture",
      task: "regression",
      targetColumn: "next_score",
      featureSchema: [{ name: "practice_score", type: "numeric" }],
      samples,
      sourceDescription: "Synthetic fixture for durable background training job tests.",
      sourceAttested: true,
      datasetKind: "synthetic",
    });
    expect(registered.status).toBe(201);
    datasetId = registered.body.dataset.id;
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it("queues jobs without blocking the request and exposes admin-only status", async () => {
    const queued = await request(`/admin/model-datasets/${datasetId}/tensorflow-jobs`, "POST", {
      modelId: "queued-training-fixture",
      epochs: 1,
      batchSize: 16,
    });
    expect(queued.status).toBe(202);
    expect(queued.body.job).toMatchObject({ status: "QUEUED", progress: 0, modelId: "queued-training-fixture" });
    const jobId = queued.body.job.id;

    expect((await request(`/admin/model-training-jobs/${jobId}`, "GET", undefined, studentCookie)).status).toBe(403);
    expect((await request(`/admin/model-training-jobs/${jobId}`, "GET", undefined, "")).status).toBe(403);
    expect((await request(`/admin/model-training-jobs/${jobId}`)).body.job.status).toBe("QUEUED");
    // Keep this queue-only test from leaving an older job ahead of the worker test.
    await server.db.modelTrainingJob.delete({ where: { id: jobId } });
  });

  it("claims a queued job, runs TensorFlow training and persists its terminal result", async () => {
    const queued = await request(`/admin/model-datasets/${datasetId}/tensorflow-jobs`, "POST", {
      modelId: "worker-training-fixture",
      epochs: 1,
      batchSize: 16,
    });
    expect(queued.status).toBe(202);
    const jobId = queued.body.job.id;

    expect(await runNextModelTrainingJob(server.db, "test-worker-one")).toBe(true);
    const status = await request(`/admin/model-training-jobs/${jobId}`);
    expect(status.body.job).toMatchObject({ status: "SUCCEEDED", progress: 100, errorMessage: "" });
    expect(status.body.job.result).toMatchObject({ promoted: false, split: { trainRows: 80, testRows: 20 } });
    const result = status.body.job.result as {
      model: { modelId: string; version: number } | null;
    };
    const audits = await server.db.modelRegistryAudit.findMany({
      where: { modelId: "worker-training-fixture" },
      orderBy: { version: "asc" },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].version).toBe(1);
    if (result.model) {
      const saved = await server.db.registeredModel.findUnique({
        where: { modelId_version: { modelId: result.model.modelId, version: result.model.version } },
      });
      expect(saved).not.toBeNull();
      expect(JSON.parse(saved!.artifactJson).version).toBe(saved!.version);
    }
    expect(await runNextModelTrainingJob(server.db, "test-worker-two")).toBe(false);
  });

  it("allows only one worker to claim and finalize a queued job under concurrent polling", async () => {
    const queued = await request(`/admin/model-datasets/${datasetId}/tensorflow-jobs`, "POST", {
      modelId: "concurrent-worker-claim-fixture",
      epochs: 1,
      batchSize: 16,
    });
    expect(queued.status).toBe(202);
    const jobId = queued.body.job.id;

    // Simulate two API instances polling the same durable queue at once.
    // The conditional updateMany claim must elect exactly one worker.
    const claims = await Promise.all([
      runNextModelTrainingJob(server.db, "test-worker-concurrent-one"),
      runNextModelTrainingJob(server.db, "test-worker-concurrent-two"),
    ]);
    expect(claims.filter(Boolean)).toHaveLength(1);

    const status = await request(`/admin/model-training-jobs/${jobId}`);
    expect(status.body.job).toMatchObject({
      id: jobId,
      status: "SUCCEEDED",
      progress: 100,
      errorMessage: "",
    });
    expect(await server.db.modelRegistryAudit.count({
      where: { modelId: "concurrent-worker-claim-fixture", action: { in: ["TRAINED_TENSORFLOW", "TENSORFLOW_CANDIDATE_REJECTED"] } },
    })).toBe(1);
    expect(await server.db.modelTrainingJob.count({
      where: { id: jobId, status: "RUNNING" },
    })).toBe(0);
  });

  it("reclaims an expired worker lease and completes the interrupted job", async () => {
    const stale = await server.db.modelTrainingJob.create({
      data: {
        datasetId,
        createdById: (await server.db.user.findFirstOrThrow({ where: { email: "training-job-admin@example.com" } })).id,
        modelId: "expired-lease-recovery-fixture",
        epochs: 1,
        batchSize: 16,
        status: "RUNNING",
        progress: 35,
        workerId: "worker-that-crashed",
        leaseExpiresAt: new Date(Date.now() - 1_000),
        startedAt: new Date(Date.now() - 60_000),
      },
    });

    expect(await runNextModelTrainingJob(server.db, "replacement-worker")).toBe(true);

    const recovered = await server.db.modelTrainingJob.findUniqueOrThrow({ where: { id: stale.id } });
    expect(recovered).toMatchObject({
      status: "SUCCEEDED",
      progress: 100,
      workerId: "replacement-worker",
      errorMessage: "",
      leaseExpiresAt: null,
    });
    expect(await server.db.modelRegistryAudit.count({
      where: { modelId: "expired-lease-recovery-fixture", action: { in: ["TRAINED_TENSORFLOW", "TENSORFLOW_CANDIDATE_REJECTED"] } },
    })).toBe(1);
  });

  it("rejects invalid datasets before creating a queued job", async () => {
    const invalid = await server.db.modelDataset.create({
      data: {
        name: "invalid-tensorflow-job-fixture",
        task: "regression",
        targetColumn: "target",
        featureSchemaJson: JSON.stringify([{ name: "score", type: "categorical" }]),
        samplesJson: "[]",
        rowCount: 0,
        sourceDescription: "Invalid fixture that must never enter the worker queue.",
        sourceAttested: true,
        datasetKind: "synthetic",
        fingerprint: "invalid-training-job-fingerprint",
      },
    });
    const response = await request(`/admin/model-datasets/${invalid.id}/tensorflow-jobs`, "POST", {
      modelId: "invalid-training-fixture",
    });
    expect(response.status).toBe(400);
    expect(await server.db.modelTrainingJob.count({ where: { datasetId: invalid.id } })).toBe(0);

    const mismatched = await server.db.modelDataset.create({
      data: {
        name: "mismatched-tensorflow-job-fixture",
        task: "regression",
        targetColumn: "target",
        featureSchemaJson: JSON.stringify([{ name: "score", type: "numeric" }]),
        samplesJson: JSON.stringify(Array.from({ length: 30 }, (_, index) => ({
          features: { score: index },
          target: index,
          groupId: index.toString(16).padStart(64, "0"),
        }))),
        rowCount: 29,
        sourceDescription: "Row-count mismatch must be rejected before queueing.",
        sourceAttested: true,
        datasetKind: "synthetic",
        fingerprint: "mismatched-training-job-fingerprint",
      },
    });
    const mismatchResponse = await request(
      `/admin/model-datasets/${mismatched.id}/tensorflow-jobs`,
      "POST",
      { modelId: "mismatched-training-fixture" },
    );
    expect(mismatchResponse.status).toBe(400);
    expect(await server.db.modelTrainingJob.count({ where: { datasetId: mismatched.id } })).toBe(0);

    const extraFeature = await server.db.modelDataset.create({
      data: {
        name: "extra-feature-tensorflow-job-fixture",
        task: "regression",
        targetColumn: "target",
        featureSchemaJson: JSON.stringify([{ name: "score", type: "numeric" }]),
        samplesJson: JSON.stringify(Array.from({ length: 30 }, (_, index) => ({
          features: { score: index, undeclared_feature: index + 1 },
          target: index,
          groupId: index.toString(16).padStart(64, "0"),
        }))),
        rowCount: 30,
        sourceDescription: "Undeclared feature must be rejected before queueing.",
        sourceAttested: true,
        datasetKind: "synthetic",
        fingerprint: "extra-feature-training-job-fingerprint",
      },
    });
    const extraFeatureResponse = await request(
      `/admin/model-datasets/${extraFeature.id}/tensorflow-jobs`,
      "POST",
      { modelId: "extra-feature-training-fixture" },
    );
    expect(extraFeatureResponse.status).toBe(400);
    expect(await server.db.modelTrainingJob.count({ where: { datasetId: extraFeature.id } })).toBe(0);
  });
});
