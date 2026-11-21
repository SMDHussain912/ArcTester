import { afterEach, describe, expect, it, vi } from "vitest";
import { getLessonTtsConfig, LessonTtsError, synthesizeLessonSpeech } from "./lessonTts.js";

const previous = {
  baseUrl: process.env.NVIDIA_TTS_BASE_URL,
  language: process.env.NVIDIA_TTS_LANGUAGE,
  voice: process.env.NVIDIA_TTS_VOICE,
  apiKey: process.env.NVIDIA_TTS_API_KEY,
  nvidiaApiKey: process.env.NVIDIA_API_KEY,
};

function makeWav() {
  const wav = Buffer.alloc(44);
  wav.write("RIFF", 0, "ascii");
  wav.writeUInt32LE(36, 4);
  wav.write("WAVE", 8, "ascii");
  wav.write("fmt ", 12, "ascii");
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(22050, 24);
  wav.writeUInt32LE(44100, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36, "ascii");
  return wav;
}

afterEach(() => {
  vi.unstubAllGlobals();
  const restore = (key: string, value: string | undefined) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  };
  restore("NVIDIA_TTS_BASE_URL", previous.baseUrl);
  restore("NVIDIA_TTS_LANGUAGE", previous.language);
  restore("NVIDIA_TTS_VOICE", previous.voice);
  restore("NVIDIA_TTS_API_KEY", previous.apiKey);
  restore("NVIDIA_API_KEY", previous.nvidiaApiKey);
});

describe("NVIDIA lesson TTS", () => {
  it("requires a configured server-side endpoint", () => {
    delete process.env.NVIDIA_TTS_BASE_URL;
    delete process.env.NVIDIA_TTS_API_KEY;
    delete process.env.NVIDIA_API_KEY;
    expect(() => getLessonTtsConfig()).toThrowError(new LessonTtsError("LESSON_TTS_NOT_CONFIGURED"));
  });

  it("posts text as multipart and validates WAV output", async () => {
    process.env.NVIDIA_TTS_BASE_URL = "https://speech.example.test";
    process.env.NVIDIA_TTS_LANGUAGE = "en-US";
    process.env.NVIDIA_TTS_VOICE = "TestVoice";
    process.env.NVIDIA_TTS_API_KEY = "server-secret";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.headers).toEqual({ authorization: "Bearer server-secret" });
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init?.body as FormData;
      expect(form.get("text")).toBe("Hello lesson.");
      expect(form.get("language")).toBe("en-US");
      return new Response(makeWav(), { status: 200, headers: { "content-type": "audio/wav" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await synthesizeLessonSpeech("  Hello lesson.  ");
    expect(result.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("uses NVIDIA_API_KEY and reuses cached scene audio", async () => {
    process.env.NVIDIA_TTS_BASE_URL = "https://speech.example.test";
    delete process.env.NVIDIA_TTS_API_KEY;
    process.env.NVIDIA_API_KEY = "nvidia-server-key";
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.headers).toEqual({ authorization: "Bearer nvidia-server-key" });
      return new Response(makeWav(), { status: 200, headers: { "content-type": "audio/wav" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    await synthesizeLessonSpeech("Cache this unique narration.");
    await synthesizeLessonSpeech("Cache this unique narration.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects provider responses that are not WAV audio", async () => {
    process.env.NVIDIA_TTS_BASE_URL = "https://speech.example.test";
    process.env.NVIDIA_TTS_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not audio", { status: 200, headers: { "content-type": "text/plain" } })));
    await expect(synthesizeLessonSpeech("Speak this.")).rejects.toThrowError(new LessonTtsError("LESSON_TTS_INVALID_AUDIO"));
  });

  it("rejects narration that exceeds provider input bounds", async () => {
    process.env.NVIDIA_TTS_BASE_URL = "https://speech.example.test";
    process.env.NVIDIA_TTS_API_KEY = "test-key";
    await expect(synthesizeLessonSpeech("x".repeat(1901))).rejects.toThrowError(new LessonTtsError("LESSON_TTS_PROVIDER_ERROR"));
  });
});
