import { createHash } from "node:crypto";
import { z } from "zod";

const TtsConfigSchema = z.object({
  baseUrl: z.string().url(),
  language: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/),
  voice: z.string().trim().min(1).max(160),
  apiKey: z.string().min(1),
});

const audioCache = new Map<string, { audio: Buffer; createdAt: number; lastUsedAt: number }>();
const MAX_CACHE_BYTES = 20 * 1024 * 1024;
const CACHE_TTL_MS = 30 * 60 * 1000;
let cacheBytes = 0;

function cacheKey(text: string, config: z.infer<typeof TtsConfigSchema>): string {
  return createHash("sha256").update([config.baseUrl, config.language, config.voice, text].join("\\0")).digest("hex");
}

function getCachedAudio(key: string): Buffer | null {
  const entry = audioCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cacheBytes -= entry.audio.length;
    audioCache.delete(key);
    return null;
  }
  entry.lastUsedAt = Date.now();
  return entry.audio;
}

function storeAudio(key: string, audio: Buffer): void {
  if (audio.length > MAX_CACHE_BYTES) return;
  const existing = audioCache.get(key);
  if (existing) cacheBytes -= existing.audio.length;
  audioCache.delete(key);
  while (cacheBytes + audio.length > MAX_CACHE_BYTES) {
    const oldestKey = [...audioCache.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0]?.[0];
    if (!oldestKey) break;
    cacheBytes -= audioCache.get(oldestKey)!.audio.length;
    audioCache.delete(oldestKey);
  }
  audioCache.set(key, { audio, createdAt: Date.now(), lastUsedAt: Date.now() });
  cacheBytes += audio.length;
}

export class LessonTtsError extends Error {
  constructor(code: "LESSON_TTS_NOT_CONFIGURED" | "LESSON_TTS_RATE_LIMITED" | "LESSON_TTS_PROVIDER_ERROR" | "LESSON_TTS_INVALID_AUDIO") {
    super(code);
    this.name = "LessonTtsError";
  }
}

const NVIDIA_MAGPIE_TTS_ENDPOINT = "https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com";
const NVIDIA_MAGPIE_LANGUAGE = "en-US";
const NVIDIA_MAGPIE_VOICE = "Magpie-Multilingual.EN-US.Aria";

export function getLessonTtsConfig() {
  const apiKey = process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new LessonTtsError("LESSON_TTS_NOT_CONFIGURED");
  const parsed = TtsConfigSchema.safeParse({
    baseUrl: NVIDIA_MAGPIE_TTS_ENDPOINT,
    language: NVIDIA_MAGPIE_LANGUAGE,
    voice: NVIDIA_MAGPIE_VOICE,
    apiKey,
  });
  if (!parsed.success) throw new LessonTtsError("LESSON_TTS_NOT_CONFIGURED");
  return parsed.data;
}

/** Uses NVIDIA Speech NIM's multipart HTTP TTS API; the provider key stays server-side. */
export async function synthesizeLessonSpeech(text: string): Promise<Buffer> {
  const config = getLessonTtsConfig();
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 1900) throw new LessonTtsError("LESSON_TTS_PROVIDER_ERROR");
  const key = cacheKey(cleanText, config);
  const cached = getCachedAudio(key);
  if (cached) return cached;
  const form = new FormData();
  form.set("text", cleanText);
  form.set("language", config.language);
  form.set("voice", config.voice);
  form.set("sample_rate_hz", "22050");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    const response = await fetch(config.baseUrl.replace(/\/+$/, "") + "/v1/audio/synthesize", {
      method: "POST",
      headers: { authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: controller.signal,
    });
    if (!response.ok) {
      if (response.status === 429) throw new LessonTtsError("LESSON_TTS_RATE_LIMITED");
      throw new LessonTtsError("LESSON_TTS_PROVIDER_ERROR");
    }
    const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.includes("audio/wav") && !contentType.includes("audio/x-wav")) {
      throw new LessonTtsError("LESSON_TTS_INVALID_AUDIO");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 44 || bytes.length > 12 * 1024 * 1024 || bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WAVE") {
      throw new LessonTtsError("LESSON_TTS_INVALID_AUDIO");
    }
    storeAudio(key, bytes);
    return bytes;
  } catch (error) {
    if (error instanceof LessonTtsError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new LessonTtsError("LESSON_TTS_PROVIDER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
