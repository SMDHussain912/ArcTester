import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replaceMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: replaceMock, refresh: vi.fn() }),
  useParams: () => ({ id: "7" }),
}));

import ResultPage from "./page";
import { SessionProvider } from "../../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("result page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    replaceMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("asks a signed-out visitor to sign in instead of loading the result", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse(403, { error: "Not signed in." }));
      }
      return Promise.resolve(jsonResponse(200, { ok: true, result: "should not be fetched" }));
    });

    render(
      <SessionProvider>
        <ResultPage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("Sign in to continue")).toBeInTheDocument());
    // The protected result endpoint must not be called for a signed-out visitor.
    const calls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(calls.some((c) => c.includes("/tests/7/result"))).toBe(false);
  });

  it("loads the result for a signed-in user", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, { ok: true, user: { id: 1, email: "me@example.com" } })
        );
      }
      if (path.endsWith("/tests/7/result")) {
        return Promise.resolve(
          jsonResponse(200, {
            attemptId: 7,
            mode: "practice",
            score: 3,
            total: 5,
            expired: false,
            breakdown: [{ subject: "Maths", correct: 3, total: 5 }],
            questions: [],
          })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <ResultPage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("3 / 5")).toBeInTheDocument());
    expect(screen.queryByText("Sign in to continue")).not.toBeInTheDocument();
  });

  it("drops back to the sign-in prompt when the session expires mid-load", async () => {
    let meCalls = 0;
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        meCalls += 1;
        // The first probe succeeds; the refresh after the failure does not.
        return Promise.resolve(
          meCalls === 1
            ? jsonResponse(200, { ok: true, user: { id: 1, email: "me@example.com" } })
            : jsonResponse(403, { error: "Not signed in." })
        );
      }
      if (path.endsWith("/tests/7/result")) {
        return Promise.resolve(
          jsonResponse(403, { error: "Invalid or expired session. Sign in again." })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <ResultPage />
      </SessionProvider>
    );

    // The expired session must end at the sign-in prompt, not a blank page.
    await waitFor(() => expect(screen.getByText("Sign in to continue")).toBeInTheDocument());
  });

  it("shows the API error when the session is still valid", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, { ok: true, user: { id: 1, email: "me@example.com" } })
        );
      }
      if (path.endsWith("/tests/7/result")) {
        return Promise.resolve(
          jsonResponse(403, { error: "Submit the test before viewing the result." })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <ResultPage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(screen.getByText("Submit the test before viewing the result.")).toBeInTheDocument()
    );
  });
});