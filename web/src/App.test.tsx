import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe("live Vite application", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("localStorage", {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loads published announcements into the student dashboard and announcements view", async () => {
    fetchMock.mockImplementation((input: RequestInfo | URL) => {
      const path = String(input);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, {
          user: { id: 4, email: "student@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/bank")) {
        return Promise.resolve(response(200, { total: 1, subjects: [{ subject: "Maths", count: 1 }] }));
      }
      if (path.endsWith("/announcements/notice-1/read")) {
        return Promise.resolve(response(200, { ok: true, seenAt: "2026-11-08T09:00:00.000Z" }));
      }
      if (path.endsWith("/announcements")) {
        return Promise.resolve(response(200, {
          announcements: [{
            id: "notice-1",
            title: "ECET mock exam schedule",
            message: "The mock exam starts tomorrow at 10 AM.",
            createdAt: "2026-11-08T08:00:00.000Z",
            publishedAt: "2026-11-08T08:00:00.000Z",
            expiresAt: null,
          }],
        }));
      }
      return Promise.resolve(response(200, { ok: true }));
    });

    render(<App />);

    const popup = await screen.findByRole("dialog", { name: "ECET mock exam schedule" });
    expect(within(popup).getByText("The mock exam starts tomorrow at 10 AM.")).toBeInTheDocument();

    fireEvent.click(within(popup).getByRole("button", { name: /Got it/ }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/announcements/notice-1/read"))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Announcements/ }));
    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Announcements" })).toBeInTheDocument();
    });
    expect(screen.getByText("ECET mock exam schedule")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/announcements"))).toBe(true);
  });
});
