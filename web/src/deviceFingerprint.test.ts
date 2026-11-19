import { describe, expect, it, vi } from "vitest";
import { getBrowserDeviceFingerprint } from "./deviceFingerprint";
function memoryStorage(initial: string | null = null) {
  let value = initial;
  return { getItem: vi.fn(() => value), setItem: vi.fn((_key: string, next: string) => { value = next; return true; }) };
}
describe("browser device fingerprint", () => {
  it("reuses an existing installation fingerprint without generating a new one", () => {
    const storage = memoryStorage("existing-device-id");
    const fingerprint = getBrowserDeviceFingerprint(storage, { randomUUID: vi.fn(() => "new-id") });
    expect(fingerprint).toBe("existing-device-id"); expect(storage.setItem).not.toHaveBeenCalled();
  });
  it("creates and persists a UUID when the browser supports randomUUID", () => {
    const storage = memoryStorage(); const randomUUID = vi.fn(() => "uuid-device-id");
    expect(getBrowserDeviceFingerprint(storage, { randomUUID })).toBe("uuid-device-id");
    expect(storage.setItem).toHaveBeenCalledWith("arctester-device-fingerprint", "uuid-device-id");
  });
  it("uses the stable web fallback when randomUUID is unavailable", () => {
    const storage = memoryStorage(); const fingerprint = getBrowserDeviceFingerprint(storage, null, () => 36, () => 0.5);
    expect(fingerprint).toBe("web-10-i"); expect(storage.setItem).toHaveBeenCalledWith("arctester-device-fingerprint", "web-10-i");
  });
});
