import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SessionProvider, RequireSession, useSession } from "./session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

/** Probe that shows the current session state and buttons to change it. */
function Probe() {
  const { status, user, signIn, signOut } = useSession();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="email">{user?.email ?? "-"}</span>
      <button onClick={() => void signIn("a@b.c", "secret1234")}>sign in</button>
      <button onClick={() => void signOut()}>sign out</button>
    </div>
  );
}

describe("SessionProvider", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("starts as unauthenticated when the API has no session", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Not signed in." }));

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("-");
  });

  it("picks up an existing session on load", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, user: { id: 3, email: "me@example.com" } })
    );

    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("me@example.com");
  });

  it("signs in and then signs out again", async () => {
    // The API keeps the session in a cookie, so `/auth/me` only knows about
    // the user *after* `/auth/login` has run. The fake mirrors that.
    let signedIn = false;
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          signedIn
            ? jsonResponse(200, { ok: true, user: { id: 4, email: "new@example.com" } })
            : jsonResponse(403, { error: "Not signed in." })
        );
      }
      if (path.endsWith("/auth/login")) {
        signedIn = true;
        return Promise.resolve(
          jsonResponse(200, { ok: true, user: { id: 4, email: "new@example.com" } })
        );
      }
      if (path.endsWith("/auth/logout")) {
        signedIn = false;
        return Promise.resolve(jsonResponse(200, { ok: true, message: "Signed out." }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    const user = userEvent.setup();
    render(
      <SessionProvider>
        <Probe />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));

    await user.click(screen.getByText("sign in"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("new@example.com");

    await user.click(screen.getByText("sign out"));

    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("unauthenticated"));
    expect(screen.getByTestId("email")).toHaveTextContent("-");
  });

  it("RequireSession shows a placeholder while the session is loading", async () => {
    // Never resolves, so the session stays in the loading state.
    fetchMock.mockImplementation(() => new Promise(() => {}));

    render(
      <SessionProvider>
        <RequireSession>
          <p>secret content</p>
        </RequireSession>
      </SessionProvider>
    );

    expect(screen.getByText("Checking your session…")).toBeInTheDocument();
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
  });

  it("RequireSession blocks signed-out visitors and links to the login page", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Not signed in." }));

    render(
      <SessionProvider>
        <RequireSession>
          <p>secret content</p>
        </RequireSession>
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("Sign in to continue")).toBeInTheDocument());
    expect(screen.queryByText("secret content")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });

  it("RequireSession renders the children for a signed-in user", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ok: true, user: { id: 9, email: "in@example.com" } })
    );

    render(
      <SessionProvider>
        <RequireSession>
          <p>secret content</p>
        </RequireSession>
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("secret content")).toBeInTheDocument());
    expect(screen.queryByText("Sign in to continue")).not.toBeInTheDocument();
  });
});