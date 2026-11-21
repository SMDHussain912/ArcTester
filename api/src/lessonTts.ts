import { z } from "zod";

const TtsConfigSchema = z.object({
  baseUrl: z.string().url(),
  language: z.string().regex(/^[a-z]{2,3}-[A-Z]{2}$/),
  voice: z.string().trim().min(1).max(160),
  apiKey: z.string().min(1),
});

export class LessonTtsError extends Error {
  constructor(code: "LESSON_TTS_NOT_CONFIGURED" | "LESSON_TTS_RATE_LIMITED" | "LESSON_TTS_PROVIDER_ERROR" | "LESSON_TTS_INVALID_AUDIO") {
    super(code);
    this.name = "LessonTtsError";
  }
}

export function getLessonTtsConfig() {
  const baseUrl = process.env.NVIDIA_TTS_BASE_URL?.trim() || "https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com";
  const language = process.env.NVIDIA_TTS_LANGUAGE?.trim() || "en-US";
  const voice = process.env.NVIDIA_TTS_VOICE?.trim() || "Magpie-Multilingual.EN-US.Aria";
  const apiKey = process.env.NVIDIA_TTS_API_KEY?.trim() || process.env.NVIDIA_API_KEY?.trim();
  if (!apiKey) throw new LessonTtsError("LESSON_TTS_NOT_CONFIGURED");
  const parsed = TtsConfigSchema.safeParse({ baseUrl, language, voice, apiKey });
  if (!parsed.success) throw new LessonTtsError("LESSON_TTS_NOT_CONFIGURED");
  return parsed.data;
}

/** Uses NVIDIA Speech NIM's multipart HTTP TTS API; the provider key stays server-side. */
export async function synthesizeLessonSpeech(text: string): Promise<Buffer> {
  const config = getLessonTtsConfig();
  const cleanText = text.trim();
  if (!cleanText || cleanText.length > 1900) throw new LessonTtsError("LESSON_TTS_PROVIDER_ERROR");
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
    return bytes;
  } catch (error) {
    if (error instanceof LessonTtsError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new LessonTtsError("LESSON_TTS_PROVIDER_ERROR");
  } finally {
    clearTimeout(timeout);
  }
}
