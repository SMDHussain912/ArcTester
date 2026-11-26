import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/index.js";
import { stableModelJson, trainModel } from "../src/modelTraining.js";
import { startTestServer, type TestServer } from "./server.js";

let server: TestServer;
let bearer = "";
let adminId = 0;
let adminKeyId = "";

function digest(value: string) { return createHash("sha256").update(value).digest("hex"); }
async function callTool(name: string, args: Record<string, unknown>) {
  const response = await fetch(server.baseUrl + "/mcp/admin", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer " + bearer },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const body = await response.json() as { result?: { content?: Array<{ text?: string }>; isError?: boolean }; error?: { message?: string } };
  if (!response.ok || body.error) throw new Error("MCP request failed (" + response.status + "): " + JSON.stringify(body));
  const text = body.result?.content?.[0]?.text ?? "";
  if (body.result?.isError) throw new Error(text);
  // MCP tool results are JSON-decoded test fixtures with dynamic fields.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return JSON.parse(text) as Record<string, any>;
}

const featureSchema = [{ name: "practiceAccuracy", type: "number" }, { name: "completedTests", type: "number" }];
const samples = [
  { practiceAccuracy: 0.4, completedTests: 2, ready: "no" },
  { practiceAccuracy: 0.7, completedTests: 5, ready: "yes" },
  { practiceAccuracy: 0.9, completedTests: 8, ready: "yes" },
];
const verificationSamples = [
  { practiceAccuracy: 0.35, completedTests: 3, ready: "no" },
  { practiceAccuracy: 0.65, completedTests: 6, ready: "yes" },
  { practiceAccuracy: 0.85, completedTests: 9, ready: "yes" },
];
const verificationSamplesTwo = [
  { practiceAccuracy: 0.25, completedTests: 1, ready: "no" },
  { practiceAccuracy: 0.55, completedTests: 4, ready: "yes" },
  { practiceAccuracy: 0.75, completedTests: 7, ready: "yes" },
];

describe("administrator MCP model control", () => {
  beforeAll(async () => {
    server = await startTestServer(buildApp);
    const admin = await server.db.user.create({ data: { email: "admin-model-mcp@arctester.test", passwordHash: "test-only", role: "ADMIN" } });
    adminId = admin.id;
    bearer = "arc_admin_" + randomBytes(32).toString("base64url");
    const key = await server.db.adminMcpKey.create({ data: {
      userId: admin.id,
      name: "model-control-test",
      keyHash: digest(bearer),
      scopes: ["models:read", "models:dataset:create", "models:verification:read", "models:train", "models:register", "models:evaluate", "models:activate"],
    } });
    adminKeyId = key.id;
  });

  afterAll(async () => { await server.close(); });

  it("creates fingerprinted datasets, queues training, verifies and activates a candidate", async () => {
    const training = await callTool("create_model_dataset", {
      name: "readiness-training-fixture", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema, samples, sourceDescription: "Synthetic test fixture generated for model-control tests.",
      sourceAttested: false, datasetKind: "synthetic",
    });
    expect(training.dataset).toMatchObject({ rowCount: 3, datasetKind: "synthetic" });
    expect(training.dataset.fingerprint).toMatch(/^[a-f0-9]{64}$/);

    const verification = await callTool("create_model_dataset", {
      name: "readiness-verification-fixture", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema, samples: verificationSamples, sourceDescription: "Human-reviewed verification fixture for isolated tests.",
      sourceAttested: true, confirmSourceAttestation: true, datasetKind: "verification",
    });
    const page = await callTool("get_model_verification_data", { datasetId: verification.dataset.id, offset: 0, limit: 2 });
    expect(page.rows).toHaveLength(2);
    expect(page.dataset.fingerprint).toBe(verification.dataset.fingerprint);

    const job = await callTool("queue_model_training", { datasetId: training.dataset.id, modelId: "readiness_classifier", confirm: true, seed: 42 });
    expect(job.job).toMatchObject({ status: "QUEUED", progress: 0, modelId: "readiness_classifier" });

    const artifact = { artifactUri: "https://models.example.test/readiness/model.bin", sha256: "a".repeat(64), framework: "sklearn", inputSchema: { features: featureSchema }, outputSchema: { label: "string" }, confirm: true };
    await callTool("register_model_version", { modelId: "readiness_classifier", version: 1, algorithm: "random_forest", task: "classification", datasetId: training.dataset.id, ...artifact });
    await callTool("register_model_version", { modelId: "readiness_classifier", version: 2, algorithm: "random_forest", task: "classification", datasetId: training.dataset.id, ...artifact, sha256: "b".repeat(64) });

    const evaluation = await callTool("record_model_evaluation", {
      modelId: "readiness_classifier", candidateVersion: 2, baselineVersion: 1, datasetId: verification.dataset.id,
      sampleCount: verification.dataset.rowCount, metrics: { accuracy: 0.9, baselineAccuracy: 0.8, precision: 0.9, recall: 0.9, f1: 0.9 }, confirm: true,
    });
    expect(evaluation.evaluation.status).toBe("PASSED");
    await callTool("activate_model_version", { modelId: "readiness_classifier", version: 2, confirm: true });
    const registered = await server.db.registeredModel.findMany({ where: { modelId: "readiness_classifier" }, orderBy: { version: "asc" } });
    expect(registered.map(model => model.isActive)).toEqual([false, true]);
    expect(await server.db.modelRegistryAudit.count({ where: { modelId: "readiness_classifier" } })).toBeGreaterThanOrEqual(4);
  });

  it("rejects verification data as a training source", async () => {
    const verification = await callTool("create_model_dataset", {
      name: "verification-not-training", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema, samples: verificationSamplesTwo, sourceDescription: "Synthetic verification fixture with labels held out from training.",
      sourceAttested: true, confirmSourceAttestation: true, datasetKind: "verification",
    });
    await expect(callTool("queue_model_training", { datasetId: verification.dataset.id, modelId: "readiness_classifier", confirm: true })).rejects.toThrow(/training or synthetic dataset/i);
  });

  it("rejects direct student identifiers in dataset columns", async () => {
    await expect(callTool("create_model_dataset", {
      name: "private-id-fixture", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema: [{ name: "studentId", type: "number" }], samples: [{ studentId: 42, ready: "yes" }],
      sourceDescription: "Identifier fixture used to verify privacy validation.", datasetKind: "synthetic",
    })).rejects.toThrow(/identifier|personal/i);
    expect(await server.db.modelDataset.count({ where: { name: "private-id-fixture" } })).toBe(0);
  });

  it("rejects malformed dataset columns before persistence", async () => {
    await expect(callTool("create_model_dataset", {
      name: "bad-fixture", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema, samples: [{ practiceAccuracy: 0.4, ready: "no" }],
      sourceDescription: "Malformed fixture intentionally missing one feature.", datasetKind: "synthetic",
    })).rejects.toThrow();
    expect(await server.db.modelDataset.count({ where: { name: "bad-fixture" } })).toBe(0);
  });

  it("computes native candidate evaluation from held-out verification rows", async () => {
    const trainingRows = Array.from({ length: 20 }, (_value, index) => {
      const practiceAccuracy = index / 19;
      return { practiceAccuracy, completedTests: index + 1, ready: practiceAccuracy < 0.5 ? "no" : "yes" };
    });
    const verificationRows = Array.from({ length: 8 }, (_value, index) => {
      const practiceAccuracy = (index + 0.25) / 8;
      return { practiceAccuracy, completedTests: index + 2, ready: practiceAccuracy < 0.5 ? "no" : "yes" };
    });
    const training = await callTool("create_model_dataset", {
      name: "native-evaluation-training", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema, samples: trainingRows, sourceDescription: "Synthetic fixture for native evaluation test.", datasetKind: "synthetic",
    });
    const verification = await callTool("create_model_dataset", {
      name: "native-evaluation-verification", task: "classification", targetColumn: "ready", targetType: "string",
      featureSchema, samples: verificationRows, sourceDescription: "Attested held-out fixture for native evaluation test.",
      sourceAttested: true, confirmSourceAttestation: true, datasetKind: "verification",
    });
    const modelInput = {
      task: "classification" as const,
      targetColumn: "ready",
      featureSchemaJson: JSON.stringify({ features: featureSchema, targetColumn: "ready", targetType: "string" }),
      samplesJson: JSON.stringify(trainingRows),
    };
    const candidate = trainModel(modelInput, { seed: 7, epochs: 100, batchSize: 8 });
    const baseline = trainModel(modelInput, { seed: 13, epochs: 1, batchSize: 8 });
    const modelId = "native_eval_fixture";
    for (const [version, trained] of [[1, candidate], [2, baseline]] as const) {
      const artifactJson = stableModelJson({
        uri: "db://test-model/" + modelId + "/" + version,
        sha256: digest(stableModelJson(trained.artifact)),
        framework: "arctester-native",
        metrics: trained.metrics,
        version,
        algorithm: trained.algorithm,
        modelArtifact: trained.artifact,
      });
      await server.db.registeredModel.create({
        data: {
          id: randomBytes(16).toString("hex"), modelId, version, algorithm: trained.algorithm,
          task: "classification", dataset: training.dataset.name, trainingDatasetId: training.dataset.id,
          artifactJson, isActive: false,
        },
      });
    }
    await expect(callTool("record_model_evaluation", {
      modelId, candidateVersion: 1, baselineVersion: 2, datasetId: verification.dataset.id,
      sampleCount: verification.dataset.rowCount, metrics: { accuracy: 1, baselineAccuracy: 0, precision: 1, recall: 1, f1: 1 }, confirm: true,
    })).rejects.toThrow(/Native model artifacts must use evaluate_registered_model/);
    const result = await callTool("evaluate_registered_model", {
      modelId, candidateVersion: 1, baselineVersion: 2, datasetId: verification.dataset.id, confirm: true,
    });
    expect(result.evaluation).toMatchObject({ status: expect.stringMatching(/PASSED|FAILED/), sampleCount: verification.dataset.rowCount });
    expect(result.metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(result.metrics.accuracy).toBeLessThanOrEqual(1);
    expect(result.metrics.baselineAccuracy).toBeGreaterThanOrEqual(0);
    expect(result.metrics.baselineAccuracy).toBeLessThanOrEqual(1);
  });

  it("enforces missing tool scopes", async () => {
    await expect(callTool("create_questions", { questions: [] })).rejects.toThrow(/Missing questions:create scope/i);
  });

  it("re-checks administrator role and key revocation on every MCP request", async () => {
    await server.db.user.update({ where: { id: adminId }, data: { role: "STUDENT" } });
    await expect(callTool("list_registered_models", { limit: 5 })).rejects.toThrow(/MCP request failed \(403\)/);
    await server.db.user.update({ where: { id: adminId }, data: { role: "ADMIN" } });
    await server.db.adminMcpKey.update({ where: { id: adminKeyId }, data: { revokedAt: new Date() } });
    await expect(callTool("list_registered_models", { limit: 5 })).rejects.toThrow(/MCP request failed \((401|403)\)/);
  });
});