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

  it("shows a sign-in prompt to visitors without a session", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(403, { error: "Not signed in." })));
    render(<SessionProvider><HomePage /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in to continue" })).toBeInTheDocument());
    expect(screen.queryByRole("link", { name: /Browse practice papers/ })).not.toBeInTheDocument();
  });

  it("shows practice papers and assigned exams to students", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {
      ok: true,
      user: { id: 12, email: "student@example.com", role: "STUDENT" },
    })));
    render(<SessionProvider><HomePage /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("link", { name: /Browse practice papers/ })).toHaveAttribute("href", "/practice"));
    expect(screen.getByRole("link", { name: "My assigned exams" })).toHaveAttribute("href", "/assignments");
    expect(screen.queryByText("Question bank")).not.toBeInTheDocument();
  });

  it("shows administration shortcuts to administrators", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(200, {
      ok: true,
      user: { id: 1, email: "admin@example.com", role: "ADMIN" },
    })));
    render(<SessionProvider><HomePage /></SessionProvider>);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Examination control room" })).toBeInTheDocument());
    expect(screen.getByRole("link", { name: /Manage question bank/ })).toHaveAttribute("href", "/admin/questions");
    expect(screen.queryByRole("link", { name: /Browse practice papers/ })).not.toBeInTheDocument();
  });
});
