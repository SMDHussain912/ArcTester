import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import NotificationsPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("student notification inbox", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists assignment and result notices and persists the read state", async () => {
    fetchMock.mockImplementation((input: string, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) return Promise.resolve(jsonResponse(200, {
        ok: true,
        user: { id: 12, email: "student@example.com", role: "STUDENT" },
      }));
      if (path.endsWith("/notifications")) return Promise.resolve(jsonResponse(200, {
        ok: true,
        unreadCount: 2,
        serverTime: "2026-11-10T10:00:00.000Z",
        notifications: [
          {
            id: "notification-assignment",
            kind: "EXAM_ASSIGNMENT",
            title: "New exam assigned",
            message: "AP ECET Mock 1 has been assigned.",
            href: "/assignments",
            createdAt: "2026-11-10T09:00:00.000Z",
            readAt: null,
            expiresAt: null,
          },
          {
            id: "notification-result",
            kind: "EXAM_RESULT",
            title: "Exam result available",
            message: "Your result is ready.",
            href: "/assignments/assignment-1/result",
            createdAt: "2026-11-10T09:30:00.000Z",
            readAt: null,
            expiresAt: null,
          },
        ],
      }));
      if (path.endsWith("/notifications/notification-assignment/read") && init?.method === "POST") {
        return Promise.resolve(jsonResponse(200, { ok: true, readAt: "2026-11-10T10:01:00.000Z", alreadyRead: false }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(<SessionProvider><NotificationsPage /></SessionProvider>);

    expect(await screen.findByRole("heading", { name: "New exam assigned" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exam result available" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Open" })[0]).toHaveAttribute("href", "/assignments");

    fireEvent.click(screen.getAllByRole("button", { name: "Mark as read" })[0]);
    await waitFor(() => expect(screen.getByText("Read")).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/notifications/notification-assignment/read"),
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("does not request notifications for a signed-out visitor", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Not signed in." }));
    render(<SessionProvider><NotificationsPage /></SessionProvider>);
    expect(await screen.findByText("Sign in to view your notifications.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/notifications"))).toBe(false);
  });
});
