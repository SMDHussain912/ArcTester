import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import AnnouncementsPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("student announcements page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows published announcements to the signed-in student", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse(200, {
          ok: true,
          user: { id: 12, email: "student@example.com", role: "STUDENT" },
        }));
      }
      if (String(url).endsWith("/announcements")) {
        return Promise.resolve(jsonResponse(200, {
          ok: true,
          serverTime: "2026-11-08T09:00:00.000Z",
          announcements: [{
            id: "notice-1",
            title: "Exam schedule updated",
            message: "Your mock exam starts at 10 AM tomorrow.",
            createdAt: "2026-11-08T08:00:00.000Z",
            publishedAt: "2026-11-08T08:00:00.000Z",
            expiresAt: null,
          }],
        }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(<SessionProvider><AnnouncementsPage /></SessionProvider>);

    expect(await screen.findByRole("heading", { name: "Exam schedule updated" })).toBeInTheDocument();
    expect(screen.getByText("Your mock exam starts at 10 AM tomorrow.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/announcements"),
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("does not request the student feed for a signed-out visitor", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Not signed in." }));
    render(<SessionProvider><AnnouncementsPage /></SessionProvider>);
    await waitFor(() => expect(screen.getByText("Sign in to view announcements from your administrator.")).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/announcements"))).toBe(false);
  });
});
