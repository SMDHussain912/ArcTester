import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import AssignmentsPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("assigned exams page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not request assignments for a signed-out visitor", async () => {
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith("/auth/me")
          ? jsonResponse(403, { error: "Not signed in." })
          : jsonResponse(200, { ok: true, assignments: [] })
      )
    );

    render(
      <SessionProvider>
        <AssignmentsPage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("Sign in to continue")).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/exams/assigned"))).toBe(
      false
    );
  });

  it("lists an available exam for a signed-in student", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 12, email: "student@example.com", role: "STUDENT" },
          })
        );
      }
      if (String(url).endsWith("/exams/assigned")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            assignments: [
              {
                id: "assignment-1",
                status: "ASSIGNED",
                assignedAt: "2026-11-01T09:00:00.000Z",
                availableFrom: null,
                dueAt: null,
                exam: {
                  id: "exam-1",
                  title: "ECET Mathematics Mock",
                  description: "Practice set",
                },
                version: 1,
                durationMinutes: 60,
                questionCount: 40,
                submission: null,
              },
            ],
          })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AssignmentsPage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "ECET Mathematics Mock" })).toBeInTheDocument()
    );
    expect(screen.getByRole("link", { name: /Open exam/ })).toHaveAttribute(
      "href",
      "/assignments/assignment-1"
    );
  });
});
