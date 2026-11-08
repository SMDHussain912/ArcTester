import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import PracticePage from "./page";
import { SessionProvider } from "../../lib/session";

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("practice paper selection", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    pushMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(response(200, {
          ok: true,
          user: { id: 5, email: "student@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/bank")) {
        return Promise.resolve(response(200, {
          subjects: [{ subject: "Mathematics", count: 120 }],
          total: 120,
          serverNow: "2026-11-08T00:00:00.000Z",
        }));
      }
      if (path.endsWith("/tests")) {
        return Promise.resolve(response(201, {
          attemptId: 81, mode: "mock", deadline: "2026-11-08T03:00:00.000Z", questions: [], warnings: [],
        }));
      }
      return Promise.resolve(response(404, { error: "Unknown route." }));
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("requires the candidate to review instructions before creating an attempt", async () => {
    const user = userEvent.setup();
    render(<SessionProvider><PracticePage /></SessionProvider>);

    await waitFor(() => expect(screen.getByRole("button", { name: /Review paper details/ })).toBeEnabled());
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/tests"))).toBe(false);

    await user.click(screen.getByRole("button", { name: /Review paper details/ }));
    expect(screen.getByRole("heading", { name: "Confirm your paper" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some((call) => String(call[0]).endsWith("/tests"))).toBe(false);

    await user.click(screen.getByRole("button", { name: /I understand — Start exam/ }));
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/test/81"));
  });
});
