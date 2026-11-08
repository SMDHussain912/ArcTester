import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, isAuthError } from "./api";

/** Build a `Response`-like object for the fake fetch. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends credentials so the httpOnly session cookie is included", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true, user: { id: 1, email: "a@b.c" } }));

    await api.me();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/auth\/me$/);
    expect(init.credentials).toBe("include");
  });

  it("sends credentials on protected POSTs too", async () => {
    fetchMock.mockResolvedValue(jsonResponse(201, { attemptId: 7 }));

    await api.createTest({ mode: "practice", subject: "Maths", count: 5 });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({
      mode: "practice",
      subject: "Maths",
      count: 5,
    });
  });

  it("turns a server error body into an ApiError with that status", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Sign in before using the test engine." }));

    await expect(api.getAttempt(1)).rejects.toBeInstanceOf(ApiError);
    await expect(api.getAttempt(1)).rejects.toMatchObject({
      status: 403,
      message: "Sign in before using the test engine.",
    });
  });

  it("falls back to a friendly message when the body has no error field", async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));

    await expect(api.getAttempt(1)).rejects.toMatchObject({
      status: 500,
      message: "Something went wrong on our side. Please try again.",
    });
  });

  it("reports an unreachable server as 503", async () => {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(api.bank()).rejects.toMatchObject({ status: 503 });
  });

  it("asks a signed-out visitor to sign in on a 401", async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));

    await expect(api.createTest({ mode: "mock" })).rejects.toMatchObject({
      status: 401,
      message: "Please sign in to continue.",
    });
  });
});

describe("isAuthError", () => {
  it("treats 401 and 403 as auth failures", () => {
    expect(isAuthError(new ApiError(401, "no"))).toBe(true);
    expect(isAuthError(new ApiError(403, "no"))).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isAuthError(new ApiError(404, "no"))).toBe(false);
    expect(isAuthError(new Error("boom"))).toBe(false);
  });
});
