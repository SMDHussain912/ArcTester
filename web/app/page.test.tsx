import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import HomePage from "./page";
import { SessionProvider } from "../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

const BANK = {
  subjects: [{ subject: "Maths", count: 120 }],
  total: 120,
  serverNow: "2026-01-01T00:00:00.000Z",
};

const fetchMock = vi.fn();

/** The fake API: /bank is public, everything else needs the session cookie. */
function fakeApi(options: { signedIn: () => boolean; onTests?: () => unknown } = {
  signedIn: () => false,
}) {
  fetchMock.mockImplementation((url: string) => {
    const path = String(url);
    if (path.endsWith("/auth/me")) {
      return Promise.resolve(
        options.signedIn()
          ? jsonResponse(200, { ok: true, user: { id: 1, email: "me@example.com" } })
          : jsonResponse(403, { error: "Not signed in." })
      );
    }
    if (path.endsWith("/bank")) {
      return Promise.resolve(jsonResponse(200, BANK));
    }
    if (path.endsWith("/tests")) {
      const result = options.onTests?.();
      return Promise.resolve(
        result ??
          jsonResponse(201, {
            attemptId: 42,
            mode: "mock",
            deadline: null,
            questions: [],
            warnings: [],
          })
      );
    }
    return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
  });
}

describe("home page", () => {
  beforeEach(() => {
    pushMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides the test controls from signed-out visitors", async () => {
    fakeApi({ signedIn: () => false });

    render(
      <SessionProvider>
        <HomePage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("Sign in to continue")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Start test" })).not.toBeInTheDocument();
  });

  it("shows the test controls to a signed-in user", async () => {
    fakeApi({ signedIn: () => true });

    render(
      <SessionProvider>
        <HomePage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start test" })).toBeInTheDocument()
    );
    expect(screen.queryByText("Sign in to continue")).not.toBeInTheDocument();
    expect(screen.getByText("me@example.com")).toBeInTheDocument();
  });

  it("still shows the shared question bank to signed-out visitors", async () => {
    fakeApi({ signedIn: () => false });

    render(
      <SessionProvider>
        <HomePage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("Question bank by subject")).toBeInTheDocument());
    expect(screen.getByText("Maths")).toBeInTheDocument();
  });

  it("starts a test and navigates to it", async () => {
    fakeApi({ signedIn: () => true });

    const user = userEvent.setup();
    render(
      <SessionProvider>
        <HomePage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start test" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Start test" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/test/42"));
  });

  it("recovers from an expired session when starting a test", async () => {
    let signedIn = true;
    fakeApi({
      signedIn: () => signedIn,
      onTests: () => {
        // The session died between the page load and the click.
        signedIn = false;
        return jsonResponse(403, { error: "Sign in before using the test engine." });
      },
    });

    const user = userEvent.setup();
    render(
      <SessionProvider>
        <HomePage />
      </SessionProvider>
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Start test" })).toBeInTheDocument()
    );
    await user.click(screen.getByRole("button", { name: "Start test" }));

    await waitFor(() =>
      expect(
        screen.getByText("Your session expired. Please sign in again to start a test.")
      ).toBeInTheDocument()
    );
    // The gate takes over once the session is known to be gone.
    await waitFor(() => expect(screen.getByText("Sign in to continue")).toBeInTheDocument());
    expect(pushMock).not.toHaveBeenCalled();
  });
});