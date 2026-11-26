import { describe, expect, it } from "vitest";
import { validateProductionSecurityConfig } from "../src/securityConfig.js";

describe("production security configuration", () => {
  const valid = {
    NODE_ENV: "production",
    CORS_ORIGINS: "https://study.example.com,https://admin.example.com",
    COOKIE_SAME_SITE: "lax",
    JWT_ISSUER: "arctester-api",
    JWT_AUDIENCE: "arctester-client",
  };

  it("accepts exact HTTPS frontend origins and supported cookie policy", () => {
    expect(() => validateProductionSecurityConfig(valid)).not.toThrow();
  });

  it("fails closed when production has no explicit frontend origin", () => {
    expect(() => validateProductionSecurityConfig({ NODE_ENV: "production" })).toThrow(/CORS_ORIGINS/);
  });

  it.each([
    "http://study.example.com",
    "https://*.example.com",
    "https://study.example.com/path",
    "https://user:password@study.example.com",
    "https://study.example.com?token=secret",
  ])("rejects unsafe or non-origin CORS entry %s", origin => {
    expect(() => validateProductionSecurityConfig({ ...valid, CORS_ORIGINS: origin })).toThrow(/exact HTTPS origins/);
  });

  it("rejects control characters in configured JWT issuer and audience", () => {
    expect(() => validateProductionSecurityConfig({ ...valid, JWT_ISSUER: "issuer\nforged" })).toThrow(/JWT_ISSUER/);
    expect(() => validateProductionSecurityConfig({ ...valid, JWT_AUDIENCE: "audience\u0000forged" })).toThrow(/JWT_AUDIENCE/);
  });

  it("rejects unsupported cookie SameSite values", () => {
    expect(() => validateProductionSecurityConfig({ ...valid, COOKIE_SAME_SITE: "strict" })).toThrow(/COOKIE_SAME_SITE/);
  });

  it("keeps local development configuration permissive", () => {
    expect(() => validateProductionSecurityConfig({ NODE_ENV: "development", CORS_ORIGINS: "" })).not.toThrow();
  });
});
