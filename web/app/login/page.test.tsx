import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import LoginPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("login page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    pushMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs in and goes back home", async () => {
    let signedIn = false;
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          signedIn
            ? jsonResponse(200, { ok: true, user: { id: 1, email: "me@example.com" } })
            : jsonResponse(403, { error: "Not signed in." })
        );
      }
      if (path.endsWith("/auth/login")) {
        signedIn = true;
        return Promise.resolve(
          jsonResponse(200, { ok: true, user: { id: 1, email: "me@example.com" } })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    const user = userEvent.setup();
    render(
      <SessionProvider>
        <LoginPage />
      </SessionProvider>
    );

    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "secret1234");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("registers the account and then signs in", async () => {
    const calls: string[] = [];
    let signedIn = false;
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      calls.push(path);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          signedIn
            ? jsonResponse(200, { ok: true, user: { id: 2, email: "new@example.com" } })
            : jsonResponse(403, { error: "Not signed in." })
        );
      }
      if (path.endsWith("/auth/register")) {
        return Promise.resolve(jsonResponse(201, { ok: true, message: "Account created." }));
      }
      if (path.endsWith("/auth/login")) {
        signedIn = true;
        return Promise.resolve(
          jsonResponse(200, { ok: true, user: { id: 2, email: "new@example.com" } })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    const user = userEvent.setup();
    render(
      <SessionProvider>
        <LoginPage />
      </SessionProvider>
    );

    await user.click(screen.getByLabelText("Create an account"));
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.type(screen.getByLabelText("Password"), "secret1234");
    await user.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));

    // Registration must come first, then the automatic sign-in.
    const registerIndex = calls.findIndex((c) => c.endsWith("/auth/register"));
    const loginIndex = calls.findIndex((c) => c.endsWith("/auth/login"));
    expect(registerIndex).toBeGreaterThanOrEqual(0);
    expect(loginIndex).toBeGreaterThan(registerIndex);
  });

  it("shows the server error when the credentials are wrong", async () => {
    fetchMock.mockImplementation((url: string) => {
      if (String(url).endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse(403, { error: "Not signed in." }));
      }
      if (String(url).endsWith("/auth/login")) {
        return Promise.resolve(jsonResponse(401, { error: "Email or password is wrong." }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    const user = userEvent.setup();
    render(
      <SessionProvider>
        <LoginPage />
      </SessionProvider>
    );

    await user.type(screen.getByLabelText("Email"), "me@example.com");
    await user.type(screen.getByLabelText("Password"), "wrongpass");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() =>
      expect(screen.getByText("Email or password is wrong.")).toBeInTheDocument()
    );
    expect(pushMock).not.toHaveBeenCalled();
  });
});