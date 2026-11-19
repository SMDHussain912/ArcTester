import type { QuestionEmbeddingEncoder } from "./questionEmbeddings.js";

export const QUESTION_EMBEDDING_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const QUESTION_EMBEDDING_MODEL_REVISION = "2c4055b12046f11709e9df2c122e59ffbdc2f900";
export const QUESTION_EMBEDDING_MODEL_VERSION = 1;

type FeatureTensor = { data: ArrayLike<number>; dims: number[] };
type FeatureExtractor = (
  text: string,
  options: { pooling: "mean"; normalize: true },
) => Promise<FeatureTensor>;
export type FeaturePipelineFactory = (
  task: "feature-extraction",
  modelId: string,
  options: { revision: string; dtype: "q8"; device: "cpu"; cache_dir?: string; local_files_only?: boolean },
) => Promise<FeatureExtractor>;

export interface OnnxQuestionEmbeddingOptions {
  cacheDir?: string;
  localFilesOnly?: boolean;
  pipelineFactory?: FeaturePipelineFactory;
}

async function defaultPipelineFactory(
  task: "feature-extraction",
  modelId: string,
  options: { revision: string; quantized: true; cache_dir?: string; local_files_only?: boolean },
): Promise<FeatureExtractor> {
  const { pipeline } = await import("@huggingface/transformers");
  return await pipeline(task, modelId, options) as unknown as FeatureExtractor;
}

/** Loads a pinned multilingual 384-dimension ONNX model and mean-pools normalized output. */
export async function createOnnxQuestionEmbeddingEncoder(
  options: OnnxQuestionEmbeddingOptions = {},
): Promise<QuestionEmbeddingEncoder> {
  const factory = options.pipelineFactory ?? defaultPipelineFactory;
  const extractor = await factory("feature-extraction", QUESTION_EMBEDDING_MODEL_ID, {
    revision: QUESTION_EMBEDDING_MODEL_REVISION,
    dtype: "q8", device: "cpu",
    ...(options.cacheDir ? { cache_dir: options.cacheDir } : {}),
    ...(options.localFilesOnly !== undefined ? { local_files_only: options.localFilesOnly } : {}),
  });
  return {
    modelName: `${QUESTION_EMBEDDING_MODEL_ID}@${QUESTION_EMBEDDING_MODEL_REVISION}:onnx-q8`,
    modelVersion: QUESTION_EMBEDDING_MODEL_VERSION,
    async encode(text: string): Promise<number[]> {
      if (!text.trim()) throw new Error("Question embedding text cannot be empty.");
      const output = await extractor(text, { pooling: "mean", normalize: true });
      if (!Array.isArray(output.dims) || output.dims.length !== 2 ||
          output.dims[0] !== 1 || output.dims[1] !== 384 || output.data.length !== 384) {
        throw new Error("Pinned ONNX encoder must return a [1, 384] mean-pooled tensor.");
      }
      return Array.from(output.data, Number);
    },
  };
}

let defaultEncoderPromise: Promise<QuestionEmbeddingEncoder> | null = null;

/** Reuses one ONNX session per API process; callers can supply a custom cache for one-off jobs. */
export function getOnnxQuestionEmbeddingEncoder(): Promise<QuestionEmbeddingEncoder> {
  if (!defaultEncoderPromise) {
    defaultEncoderPromise = createOnnxQuestionEmbeddingEncoder().catch((error: unknown) => {
      defaultEncoderPromise = null;
      throw error;
    });
  }
  return defaultEncoderPromise;
}
