import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import AnalyticsPage from "./page";
import { SessionProvider } from "../../lib/session";

describe("student analytics page", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows a sign-in prompt when the visitor is signed out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => JSON.stringify({ error: "Not signed in." }),
      })
    );

    render(
      <SessionProvider>
        <AnalyticsPage />
      </SessionProvider>
    );

    expect(
      await screen.findByText("Sign in to see your progress, recent attempts and areas to revise.")
    ).toBeInTheDocument();
  });
});
