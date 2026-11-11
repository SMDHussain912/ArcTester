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
                  topic: "Data Structures",
                  relatedConcepts: [{ slug: "stack", title: "Stack" }],
                  text: "Which order does a stack follow?",
                  options: ["FIFO", "LIFO", "Random", "Sorted"],
                  correctIndex: 1,
                  explanation: "A stack follows last-in, first-out.",
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
    expect(screen.getByText("Which order does a stack follow?")).toBeInTheDocument();
    expect(screen.getByText("A stack follows last-in, first-out.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stack" })).toHaveAttribute("href", "/learning#stack");
    expect(screen.getByText("Correct answer")).toBeInTheDocument();
  });
  it("shows the review-pending message instead of an empty score for ungraded submissions", async () => {
    fetchMock.mockImplementation((url: string) => {
      const path = String(url);
      if (path.endsWith("/auth/me")) {
        return Promise.resolve(jsonResponse(200, {
          ok: true,
          user: { id: 12, email: "student@example.com", role: "STUDENT" },
        }));
      }
      if (path.endsWith("/exams/assignments/assignment-1/result")) {
        return Promise.resolve(jsonResponse(200, {
          ok: true,
          result: {
            submissionId: "submission-review-1",
            status: "REVIEW_REQUIRED",
            score: null,
            maximumScore: null,
            submittedAt: "2026-11-10T10:00:00.000Z",
            receivedAt: "2026-11-10T10:00:02.000Z",
            questions: [],
          },
        }));
      }
      return Promise.resolve(jsonResponse(404, { error: "Unknown route." }));
    });

    render(
      <SessionProvider>
        <AssignedExamResultPage />
      </SessionProvider>
    );

    expect(await screen.findByRole("status")).toHaveTextContent("Submitted - awaiting invigilator review");
    expect(screen.queryByText(/— \/ —/)).not.toBeInTheDocument();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
  });

});
