import { afterEach, describe, expect, it } from "vitest";
import { decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, totpAt, verifyTotp } from "../src/totp.js";

describe("TOTP account security utilities", () => {
  const originalKey = process.env.TOTP_ENCRYPTION_KEY;
  afterEach(() => {
    if (originalKey === undefined) delete process.env.TOTP_ENCRYPTION_KEY;
    else process.env.TOTP_ENCRYPTION_KEY = originalKey;
  });
  it("matches the RFC 6238 SHA-1 test vector", () => {
    const secret = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
    expect(totpAt(secret, 1)).toBe("287082");
    expect(verifyTotp(secret, "287082", 30_000)).toBe(1);
    expect(verifyTotp(secret, "000000", 30_000)).toBeNull();
  });
  it("generates valid secrets and encrypts them with AES-GCM", () => {
    process.env.TOTP_ENCRYPTION_KEY = "ab".repeat(32);
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    const encrypted = encryptTotpSecret(secret);
    expect(encrypted).not.toContain(secret);
    expect(decryptTotpSecret(encrypted)).toBe(secret);
    process.env.TOTP_ENCRYPTION_KEY = "cd".repeat(32);
    expect(() => decryptTotpSecret(encrypted)).toThrow();
  });
  it("creates single-use recovery code hashes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    expect(hashRecoveryCode(codes[0]!)).toBe(hashRecoveryCode(codes[0]!.replace(/-/g, "")));
    expect(hashRecoveryCode(codes[0]!)).not.toBe(codes[1] && hashRecoveryCode(codes[1]!));
  });
});
