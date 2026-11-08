import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LearningPage from "./page";
import { SessionProvider } from "../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("concept library page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse(200, {
          ok: true,
          user: { id: 7, email: "learner@example.com", role: "STUDENT" },
        }));
      }
      if (path.includes("/learning/concepts")) {
        const queue = {
          slug: "queue",
          title: "Queue",
          subject: "Computer Science",
          topic: "Data Structures",
          definition: "A queue follows FIFO order.",
          examples: ["Printer job scheduling"],
          relatedConcepts: ["Stack"],
          commonMistakes: ["Confusing FIFO with LIFO"],
        };
        return Promise.resolve(jsonResponse(200, { total: 1, concepts: [queue] }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads curated concepts for signed-in students", async () => {
    render(<SessionProvider><LearningPage /></SessionProvider>);
    expect(await screen.findByRole("heading", { name: "Concept library" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Queue" })).toBeInTheDocument();
    expect(screen.getByText("A queue follows FIFO order.")).toBeInTheDocument();
    expect(screen.getByText("Confusing FIFO with LIFO")).toBeInTheDocument();
  });

  it("submits a search query to the concept API", async () => {
    render(<SessionProvider><LearningPage /></SessionProvider>);
    const search = await screen.findByRole("textbox", { name: "Search concepts" });
    fireEvent.change(search, { target: { value: "queue" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("/learning/concepts?q=queue"))).toBe(true);
    });
  });
});
