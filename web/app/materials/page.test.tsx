import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import MaterialsPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("offline study materials page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("asks signed-out visitors to sign in", async () => {
    fetchMock.mockResolvedValue(jsonResponse(403, { error: "Not signed in." }));

    render(
      <SessionProvider>
        <MaterialsPage />
      </SessionProvider>
    );

    expect(await screen.findByRole("heading", { name: "Offline study materials" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("downloads the authenticated learner's complete study package", async () => {
    const studyPackage = {
      schemaVersion: 1,
      exportedAt: "2026-11-08T09:00:00.000Z",
      total: 2,
      subjects: ["Maths", "Physics"],
      questions: [],
    };
    fetchMock.mockImplementation((url: string) =>
      Promise.resolve(
        String(url).endsWith("/auth/me")
          ? jsonResponse(200, {
              ok: true,
              user: { id: 7, email: "learner@example.com", role: "STUDENT" },
            })
          : jsonResponse(200, studyPackage)
      )
    );
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn().mockReturnValue("blob:study-pack"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);

    render(
      <SessionProvider>
        <MaterialsPage />
      </SessionProvider>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Download offline study pack" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      "2 questions across 2 subjects"
    );
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/learning/package"),
      expect.objectContaining({ credentials: "include" })
    );
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:study-pack");
    expect(click).toHaveBeenCalledTimes(1);
  });
});
