import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StudentAnalytics from "./StudentAnalytics";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

describe("StudentAnalytics focused recommendation action", () => {
  it("shows verified mock evidence and invokes the focused-practice callback", async () => {
    const recommendation = {
      id: "full-mock-focus-math",
      title: "Practice Matrices from your last full mock",
      reason: "35% accuracy across 20 answered full-mock questions.",
      priority: "high",
      questionCount: 15,
      mode: "practice" as const,
      subject: "Mathematics",
      topic: "Matrices",
      evidence: {
        answeredQuestions: 20,
        incorrectAnswers: 13,
        accuracy: 0.35,
        minimumAnswers: 5,
        weakAccuracyThreshold: 0.6,
        source: "completed-full-mock" as const,
      },
    };
    vi.mocked(request).mockImplementation(async (path: string) => {
      if (path === "/analytics/overview") return { practice: { completedAttempts: 1, questions: 200, correct: 100, incorrect: 80, unanswered: 20, accuracy: 0.55 }, formalExams: { submissions: 0, graded: 0, reviewRequired: 0, score: 0, maximumScore: 0, scorePercentage: null } } as never;
      if (path === "/analytics/weak-topics") return { subjects: [], topics: [], weakest: null } as never;
      if (path === "/analytics/recommendations") return {
        basedOnAttempts: 1, basedOnFullMocks: 1, latestFullMockAt: "2026-11-21T10:00:00.000Z",
        minimumAnswers: 5, weakAccuracyThreshold: 0.6,
        performanceExplanation: { headline: "Focus Matrices", details: [], answeredQuestions: 20, incorrectAnswers: 13, evidenceThreshold: 5, weakAccuracyThreshold: 0.6 },
        recommendations: [recommendation],
      } as never;
      throw new Error("Unexpected API path");
    });
    const start = vi.fn();
    render(<StudentAnalytics setActivePage={vi.fn()} onStartRecommendedPractice={start} />);
    expect(await screen.findByText(/latest completed 200-question mock/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Start focused practice" }));
    expect(start).toHaveBeenCalledWith(expect.objectContaining({ subject: "Mathematics", topic: "Matrices", questionCount: 15 }));
  });
});
