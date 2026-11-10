import { describe, expect, it, vi } from "vitest";
import { createApiClient } from "./apiClient";
describe("API client", () => {
  it("normalizes the API base URL and sends cookie-authenticated JSON requests", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ user: { id: 7 } }), { status: 200 }));
    const request = createApiClient("https://api.example.test///", fetcher);
    await expect(request<{ user: { id: number } }>("/auth/me")).resolves.toEqual({ user: { id: 7 } });
    expect(fetcher).toHaveBeenCalledWith("https://api.example.test/auth/me", { credentials: "include", headers: { "content-type": "application/json" } });
  });
  it("preserves caller options and headers while enforcing cookie credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const request = createApiClient("http://localhost:4000/", fetcher);
    await request("/tests", { method: "POST", body: "{}", credentials: "omit", headers: { authorization: "Bearer token" } });
    expect(fetcher).toHaveBeenCalledWith("http://localhost:4000/tests", { method: "POST", body: "{}", credentials: "include", headers: { "content-type": "application/json", authorization: "Bearer token" } });
  });
  it("uses API error messages for failed responses", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: "Invitation expired." }), { status: 410 }));
    await expect(createApiClient("http://localhost:4000", fetcher)("/auth/register")).rejects.toThrow("Invitation expired.");
  });
  it("uses a stable fallback for non-JSON and invalid error payloads", async () => {
    const nonJson = vi.fn<typeof fetch>().mockResolvedValue(new Response("not json", { status: 502 }));
    const invalidError = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ error: { detail: "bad" } }), { status: 400 }));
    await expect(createApiClient("http://localhost:4000", nonJson)("/broken")).rejects.toThrow("The request failed.");
    await expect(createApiClient("http://localhost:4000", invalidError)("/broken")).rejects.toThrow("The request failed.");
  });
  it("uses the current global fetch implementation when no override is supplied", async () => {
    const request = createApiClient("http://localhost:4000");
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const originalFetch = globalThis.fetch; globalThis.fetch = fetcher;
    try { await expect(request<{ ok: boolean }>("/health")).resolves.toEqual({ ok: true }); expect(fetcher).toHaveBeenCalledTimes(1); }
    finally { globalThis.fetch = originalFetch; }
  });
});
