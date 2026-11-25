import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import StudentAnalytics from "./StudentAnalytics";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

describe("Performance analytics scope", () => {
  it("does not load learning recommendations or topic mastery data in performance analytics", async () => {
    vi.mocked(request).mockImplementation(async (path: string) => {
      if (path === "/analytics/overview") return {
        practice: { completedAttempts: 1, questions: 20, correct: 12, incorrect: 8, unanswered: 0, accuracy: 0.6 },
        formalExams: { graded: 0, scorePercentage: null, score: null, maximumScore: null, reviewRequired: 0 },
      } as never;
      if (path === "/analytics/full-mock-performance") return {
        generatedAt: "2026-11-22T00:00:00.000Z", completedFullMocks: 0, latestMockAt: null,
        questionCount: 0, answeredQuestions: 0, correct: 0, incorrect: 0, unanswered: 0, accuracy: null, subjects: [], topics: [],
      } as never;
      throw new Error("Learning endpoint must not be requested from performance analytics: " + path);
    });
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Practice performance" })).toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
    expect(screen.queryByText("Your next study steps")).not.toBeInTheDocument();
    expect(screen.queryByText("Areas to strengthen")).not.toBeInTheDocument();
    expect(screen.queryByText(/topic breakdown/i)).not.toBeInTheDocument();
  });
});
