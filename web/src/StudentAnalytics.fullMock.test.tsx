import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentAnalytics from "./StudentAnalytics";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

describe("Mock test performance analytics", () => {
  it("shows full mock aggregate and subject accuracy without topic mastery", async () => {
    vi.mocked(request).mockImplementation(async (path: string) => {
      if (path === "/analytics/overview") return {
        practice: { completedAttempts: 0, questions: 0, correct: 0, incorrect: 0, unanswered: 0, accuracy: null },
        formalExams: { graded: 0, scorePercentage: null, score: null, maximumScore: null, reviewRequired: 0 },
      } as never;
      if (path === "/analytics/full-mock-performance") return {
        generatedAt: "2026-11-22T00:00:00.000Z", completedFullMocks: 1, latestMockAt: "2026-11-21T00:00:00.000Z",
        questionCount: 200, answeredQuestions: 180, correct: 80, incorrect: 100, unanswered: 20, accuracy: 80 / 180,
        subjects: [{ subject: "Maths", topic: null, questionCount: 100, answeredQuestions: 80, correct: 20, incorrect: 60, unanswered: 20, accuracy: 0.25 }],
        topics: [],
      } as never;
      throw new Error("Unexpected analytics endpoint: " + path);
    });
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Mock Test Analytics" })).toBeInTheDocument();
    expect(screen.getByText("80 correct / 180 answered")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subject-wise mock accuracy" })).toBeInTheDocument();
    expect(screen.getByText("Maths")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
    expect(screen.queryByText(/topic breakdown|topic mastery/i)).not.toBeInTheDocument();
  });
});
