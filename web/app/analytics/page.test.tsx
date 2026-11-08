import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import AnalyticsPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("student analytics page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a sign-in prompt to signed-out visitors", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith("/auth/me")
          ? jsonResponse(403, { error: "Not signed in." })
          : jsonResponse(200, {})
      )
    );

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(
        screen.getByText("Sign in to see your progress, recent attempts and areas to revise.")
      ).toBeInTheDocument()
    );
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/analytics/"))).toBe(
      false
    );
  });

  it("shows accuracy, weak subjects and recent practice history", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 7, email: "learner@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(
          jsonResponse(200, {
            subjects: [
              {
                subject: "Physics",
                topic: null,
                seen: 10,
                wrong: 7,
                accuracy: 0.3,
              },
              {
                subject: "Maths",
                topic: null,
                seen: 10,
                wrong: 2,
                accuracy: 0.8,
              },
            ],
            weakest: {
              subject: "Physics",
              topic: "Mechanics",
              seen: 10,
              wrong: 7,
              accuracy: 0.3,
            },
          })
        );
      }
      if (path.endsWith("/analytics/history")) {
        return Promise.resolve(
          jsonResponse(200, [
            {
              attemptId: 22,
              mode: "practice",
              startedAt: "2026-11-08T08:00:00.000Z",
              finishedAt: "2026-11-08T08:20:00.000Z",
              score: 8,
              total: 10,
              expired: false,
            },
          ])
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("80%")).toBeInTheDocument());
    expect(screen.getByText("Physics")).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName === "P" &&
          element.textContent?.includes("Focus next on Mechanics") === true
      )
    ).toBeInTheDocument();
    expect(screen.getByText("8 / 10")).toBeInTheDocument();
    expect(screen.getByRole("progressbar", { name: "Physics accuracy" })).toHaveAttribute(
      "aria-valuenow",
      "30"
    );
  });

  it("shows an empty-state message when there is no practice history", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 7, email: "learner@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(jsonResponse(200, { subjects: [], weakest: null }));
      }
      if (path.endsWith("/analytics/history")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    expect(
      await screen.findByText(
        "Your practice history will appear here after your first submitted test."
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText("Complete a practice session to unlock your subject performance breakdown.")
    ).toBeInTheDocument();
  });

  it("shows a friendly message when analytics cannot be loaded", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 7, email: "learner@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/analytics/weak-topics")) {
        return Promise.resolve(
          jsonResponse(500, { error: "Analytics are temporarily unavailable." })
        );
      }
      if (path.endsWith("/analytics/history")) {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Analytics are temporarily unavailable."
    );
  });
});
