import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import HomePage from "./page";
import { SessionProvider } from "../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("role-aware home dashboard", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows a sign-in workspace to visitors without a session", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(403, { error: "Not signed in." })));
    render(<SessionProvider><HomePage /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Prepare with focus. Track your progress." })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Sign in to your workspace/ })).toHaveAttribute("href", "/login");
    expect(screen.queryByRole("link", { name: /Start a practice paper/ })).not.toBeInTheDocument();
  });

  it("shows the complete student workspace and its destinations", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {
      ok: true,
      user: { id: 12, email: "student@example.com", role: "STUDENT" },
    })));
    render(<SessionProvider><HomePage /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Welcome back." })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Start a practice paper/ })).toHaveAttribute("href", "/practice");
    expect(screen.getByRole("link", { name: /Assigned exams/ })).toHaveAttribute("href", "/assignments");
    expect(screen.getByRole("link", { name: /Performance insights/ })).toHaveAttribute("href", "/analytics");
    expect(screen.getByRole("link", { name: /Concept library/ })).toHaveAttribute("href", "/learning");
    expect(screen.getByRole("link", { name: /Study materials/ })).toHaveAttribute("href", "/materials");
    expect(screen.getByRole("link", { name: /Announcements/ })).toHaveAttribute("href", "/announcements");
    expect(screen.getByRole("link", { name: /Notifications/ })).toHaveAttribute("href", "/notifications");
    expect(screen.getByRole("heading", { name: "Before an examination" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Manage question bank/ })).not.toBeInTheDocument();
  });

  it("shows administration shortcuts to administrators", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {
      ok: true,
      user: { id: 1, email: "admin@example.com", role: "ADMIN" },
    })));
    render(<SessionProvider><HomePage /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Examination control room" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Manage question bank/ })).toHaveAttribute("href", "/admin/questions");
    expect(screen.queryByRole("link", { name: /Start a practice paper/ })).not.toBeInTheDocument();
  });
});
