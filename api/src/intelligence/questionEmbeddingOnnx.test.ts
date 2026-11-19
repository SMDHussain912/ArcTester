import { describe, expect, it } from "vitest";
import {
  createOnnxQuestionEmbeddingEncoder,
  QUESTION_EMBEDDING_MODEL_ID,
  QUESTION_EMBEDDING_MODEL_REVISION,
} from "./questionEmbeddingOnnx.js";

describe("pinned ONNX question embedding encoder", () => {
  it("loads the pinned multilingual quantized model and returns normalized 384d vectors", async () => {
    let loaded: unknown[] = [];
    const encoder = await createOnnxQuestionEmbeddingEncoder({
      cacheDir: "/tmp/arctester-model-cache",
      localFilesOnly: true,
      pipelineFactory: async (task, modelId, options) => {
        loaded = [task, modelId, options];
        return async (_text, inferenceOptions) => {
          expect(inferenceOptions).toEqual({ pooling: "mean", normalize: true });
          return { dims: [1, 384], data: new Float32Array(384).fill(1 / Math.sqrt(384)) };
        };
      },
    });
    expect(loaded).toEqual([
      "feature-extraction",
      QUESTION_EMBEDDING_MODEL_ID,
      {
        revision: QUESTION_EMBEDDING_MODEL_REVISION,
        dtype: "q8",
        device: "cpu",
        cache_dir: "/tmp/arctester-model-cache",
        local_files_only: true,
      },
    ]);
    expect(encoder.modelName).toContain(QUESTION_EMBEDDING_MODEL_REVISION);
    expect(encoder.modelVersion).toBe(1);
    const vector = await encoder.encode("Matrices and determinants");
    expect(vector).toHaveLength(384);
    expect(vector.every(Number.isFinite)).toBe(true);
  });

  it("rejects unexpected ONNX tensor dimensions and empty input", async () => {
    const encoder = await createOnnxQuestionEmbeddingEncoder({
      pipelineFactory: async () => async () => ({ dims: [1, 3], data: [1, 2, 3] }),
    });
    await expect(encoder.encode("question")).rejects.toThrow("[1, 384]");
    await expect(encoder.encode(" ")).rejects.toThrow("cannot be empty");
  });
});
