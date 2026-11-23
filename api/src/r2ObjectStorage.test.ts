import { describe, expect, it, vi } from "vitest";
import { getR2StorageConfig, R2ObjectStorage } from "./r2ObjectStorage.js";

const config = {
  accountId: "a".repeat(32),
  bucket: "arctester-static-lessons",
  accessKeyId: "test-access-key",
  secretAccessKey: "test-secret-key",
  region: "auto",
};

describe("Cloudflare R2 object storage adapter", () => {
  it("requires a complete private bucket configuration", () => {
    expect(() => getR2StorageConfig({})).toThrow(/R2 storage is not configured/);
    expect(getR2StorageConfig({
      R2_ACCOUNT_ID: config.accountId,
      R2_BUCKET_NAME: config.bucket,
      R2_ACCESS_KEY_ID: config.accessKeyId,
      R2_SECRET_ACCESS_KEY: config.secretAccessKey,
    })).toMatchObject({ region: "auto", bucket: config.bucket });
    expect(() => getR2StorageConfig({
      R2_ACCOUNT_ID: "invalid",
      R2_BUCKET_NAME: config.bucket,
      R2_ACCESS_KEY_ID: config.accessKeyId,
      R2_SECRET_ACCESS_KEY: config.secretAccessKey,
    })).toThrow(/account ID/);
  });

  it("signs uploads and returns stored metadata without exposing credentials", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, {
      status: 200,
      headers: { etag: '"etag-1"' },
    }));
    const storage = new R2ObjectStorage(config, fetchMock);
    const bytes = new TextEncoder().encode('{"scene":"stack"}');
    const result = await storage.putObject("lessons/l1/versions/v1/scenes/s1.json", bytes, "application/json");

    expect(result).toMatchObject({ sizeBytes: bytes.byteLength, etag: '"etag-1"', contentType: "application/json" });
    const [url, request] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/arctester-static-lessons/lessons/l1/versions/v1/scenes/s1.json");
    expect(request?.method).toBe("PUT");
    expect(request?.headers).toMatchObject({
      "content-type": "application/json",
      "x-amz-content-sha256": expect.stringMatching(/^[a-f0-9]{64}$/),
      authorization: expect.stringMatching(/^AWS4-HMAC-SHA256 Credential=test-access-key\//),
    });
    expect(JSON.stringify(request?.headers)).not.toContain(config.secretAccessKey);
  });

  it("reads object bytes and head metadata through signed requests", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(new TextEncoder().encode("audio"), {
        status: 200,
        headers: { "content-length": "5", "content-type": "audio/mpeg", etag: '"audio-etag"' },
      }))
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { "content-length": "5", "content-type": "audio/mpeg", etag: '"audio-etag"' },
      }));
    const storage = new R2ObjectStorage(config, fetchMock);
    const object = await storage.getObject("lessons/l1/versions/v1/assets/a1.mp3");
    const metadata = await storage.headObject("lessons/l1/versions/v1/assets/a1.mp3");
    expect(new TextDecoder().decode(object.bytes)).toBe("audio");
    expect(object.metadata.sizeBytes).toBe(5);
    expect(metadata).toMatchObject({ sizeBytes: 5, contentType: "audio/mpeg", etag: '"audio-etag"' });
    expect(fetchMock.mock.calls.map((call) => call[1]?.method)).toEqual(["GET", "HEAD"]);
  });

  it("rejects unsafe object keys before sending a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const storage = new R2ObjectStorage(config, fetchMock);
    await expect(storage.putObject("../outside", new Uint8Array([1]), "application/octet-stream")).rejects.toThrow(/object key/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
