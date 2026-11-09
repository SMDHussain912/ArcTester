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
    expect(await runNextModelTrainingJob(server.db, "test-worker-two")).toBe(false);
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
  });
});
