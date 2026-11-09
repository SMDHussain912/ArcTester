import { describe, expect, it } from "vitest";
import { isTrustedCookieMutation } from "../src/csrf.js";

const allowedOrigins = new Set(["https://study.example.com"]);

describe("cookie-session CSRF protection", () => {
  it("allows safe methods and requests without a session cookie", () => {
    expect(isTrustedCookieMutation({ method: "GET", cookie: "ecet_session=abc" }, allowedOrigins)).toBe(true);
    expect(isTrustedCookieMutation({ method: "POST", origin: "https://evil.example" }, allowedOrigins)).toBe(true);
  });

  it("allows bearer-token requests used by native clients", () => {
    expect(isTrustedCookieMutation({
      method: "POST",
      authorization: "Bearer native-token",
      cookie: "ecet_session=abc",
    }, allowedOrigins)).toBe(true);
  });

  it("allows cookie mutations only from an allowlisted or local origin", () => {
    expect(isTrustedCookieMutation({
      method: "POST",
      origin: "https://study.example.com",
      cookie: "ecet_session=abc",
    }, allowedOrigins)).toBe(true);
    expect(isTrustedCookieMutation({
      method: "DELETE",
      origin: "http://localhost:3000",
      cookie: "ecet_session=abc",
    }, allowedOrigins)).toBe(true);
  });

  it("rejects missing and untrusted origins for cookie-authenticated mutations", () => {
    expect(isTrustedCookieMutation({ method: "POST", cookie: "ecet_session=abc" }, allowedOrigins)).toBe(false);
    expect(isTrustedCookieMutation({
      method: "POST",
      origin: "https://evil.example",
      cookie: "ecet_session=abc",
    }, allowedOrigins)).toBe(false);
  });
});
