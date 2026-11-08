import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useParams: () => ({ id: "assignment-1" }),
}));

import AssignedExamResultPage from "./page";
import { SessionProvider } from "../../../../lib/session";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe("assigned exam result page", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the submitted score and answer review", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            user: { id: 12, email: "student@example.com", role: "STUDENT" },
          })
        );
      }
      if (path.endsWith("/exams/assignments/assignment-1/result")) {
        return Promise.resolve(
          jsonResponse(200, {
            ok: true,
            result: {
              submissionId: "submission-1",
              status: "GRADED",
              score: 8,
              maximumScore: 10,
              submittedAt: "2026-11-08T10:00:00.000Z",
              receivedAt: "2026-11-08T10:00:01.000Z",
              questions: [
                {
                  id: "question-1",
                  position: 1,
                  subject: "Mathematics",
                  topic: "Algebra",
                  text: "What is 2 + 2?",
                  options: ["3", "4", "5", "6"],
                  correctIndex: 1,
                  explanation: "Two plus two equals four.",
                  marks: 2,
                  negativeMarks: 0,
                  selectedIndex: 1,
                  isCorrect: true,
                  awardedMarks: 2,
                },
              ],
            },
          })
        );
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AssignedExamResultPage />
      </SessionProvider>
    );

    await waitFor(() => expect(screen.getByText("80%")).toBeInTheDocument());
    expect(screen.getByText("What is 2 + 2?")).toBeInTheDocument();
    expect(screen.getByText("Two plus two equals four.")).toBeInTheDocument();
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
  });
});
