import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentAnalytics from "./StudentAnalytics";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

describe("StudentAnalytics full-mock breakdown", () => {
  it("shows completed mock subject and topic counts with unanswered kept separate", async () => {
    vi.mocked(request).mockImplementation(async (path: string) => {
      if (path === "/analytics/overview") return {
        practice: { completedAttempts: 0, questions: 0, correct: 0, incorrect: 0, unanswered: 0, accuracy: null },
        formalExams: { graded: 0, scorePercentage: null, score: null, maximumScore: null, reviewRequired: 0 },
      } as never;
      if (path === "/analytics/weak-topics") return { subjects: [], topics: [], weakest: null } as never;
      if (path === "/analytics/recommendations") return {
        basedOnAttempts: 0, minimumAnswers: 5, weakAccuracyThreshold: 0.6,
        performanceExplanation: { headline: "Start with a baseline", details: [], answeredQuestions: 0, incorrectAnswers: 0, evidenceThreshold: 5, weakAccuracyThreshold: 0.6 },
        recommendations: [],
      } as never;
      if (path === "/analytics/full-mock-performance") return {
        generatedAt: "2026-11-22T00:00:00.000Z", completedFullMocks: 1, latestMockAt: "2026-11-21T00:00:00.000Z",
        questionCount: 200, answeredQuestions: 180, correct: 80, incorrect: 100, unanswered: 20, accuracy: 80 / 180,
        subjects: [{ subject: "Maths", topic: null, questionCount: 100, answeredQuestions: 80, correct: 20, incorrect: 60, unanswered: 20, accuracy: 0.25 }],
        topics: [{ subject: "Maths", topic: "Matrices", questionCount: 100, answeredQuestions: 80, correct: 20, incorrect: 60, unanswered: 20, accuracy: 0.25 }],
      } as never;
      throw new Error("Unexpected API path: " + path);
    });
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Full-mock subject & topic performance" })).toBeInTheDocument();
    expect(screen.getByText("Matrices")).toBeInTheDocument();
    expect(screen.getByText("25% (80 answered)")).toBeInTheDocument();
    expect(screen.getByText("Not counted as incorrect")).toBeInTheDocument();
  });
});
