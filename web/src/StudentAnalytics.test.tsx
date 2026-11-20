import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentAnalytics from "./StudentAnalytics";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

const weakTopics = { subjects: [], topics: [], weakest: null };
const recommendations = {
  basedOnAttempts: 2,
  minimumAnswers: 5,
  weakAccuracyThreshold: 0.6,
  performanceExplanation: { headline: "Keep practising", details: ["Complete more questions."], answeredQuestions: 4, incorrectAnswers: 2, evidenceThreshold: 5, weakAccuracyThreshold: 0.6 },
  recommendations: [],
};
const prediction = {
  status: "insufficient_data" as const,
  completedAttempts: 2,
  availableSamples: 2,
  requiredSamples: 10,
  requiredCompletedAttempts: 5,
  message: "Complete more practice tests.",
};
const readiness = {
  status: "insufficient_data" as const,
  category: null,
  completedAttempts: 2,
  requiredCompletedAttempts: 5,
  message: "Complete five practice attempts before requesting a readiness estimate.",
};

describe("StudentAnalytics", () => {
  beforeEach(() => vi.mocked(request).mockReset());

  it("keeps successful sections visible when one analytics endpoint fails", async () => {
    vi.mocked(request)
      .mockRejectedValueOnce(new Error("Overview temporarily unavailable"))
      .mockResolvedValueOnce(weakTopics)
      .mockResolvedValueOnce(recommendations)
      .mockResolvedValueOnce(prediction)
      .mockResolvedValueOnce(readiness);

    render(<StudentAnalytics setActivePage={vi.fn()} />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Practice overview: Overview temporarily unavailable");
    expect(screen.getByRole("heading", { name: "Your next study steps" })).toBeInTheDocument();
    expect(screen.getByText("Keep practising")).toBeInTheDocument();
    expect(screen.getByText("Subjects to revise")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Exam readiness estimate" })).toBeInTheDocument();
  });

  it("shows the safe readiness data threshold without inventing a category", async () => {
    vi.mocked(request)
      .mockResolvedValueOnce({
        practice: { completedAttempts: 2, questions: 2, correct: 1, incorrect: 1, unanswered: 0, accuracy: 0.5 },
        formalExams: { graded: 0, scorePercentage: null, score: null, maximumScore: null, reviewRequired: 0 },
      })
      .mockResolvedValueOnce(weakTopics)
      .mockResolvedValueOnce(recommendations)
      .mockResolvedValueOnce(prediction)
      .mockResolvedValueOnce(readiness);
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Exam readiness estimate" })).toBeInTheDocument();
    expect(screen.getByText(readiness.message)).toBeInTheDocument();
    expect(screen.queryByText("READY", { exact: true })).not.toBeInTheDocument();
  });

  it("retries failed analytics and reports when the refresh finishes", async () => {
    const overview = {
      practice: { completedAttempts: 3, questions: 30, correct: 20, incorrect: 8, unanswered: 2, accuracy: 0.714 },
      formalExams: { graded: 1, scorePercentage: 70, score: 35, maximumScore: 50, reviewRequired: 0 },
    };
    vi.mocked(request)
      .mockRejectedValueOnce(new Error("Network unavailable"))
      .mockResolvedValueOnce(weakTopics)
      .mockResolvedValueOnce(recommendations)
      .mockResolvedValueOnce(prediction)
      .mockResolvedValueOnce(readiness)
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce(weakTopics)
      .mockResolvedValueOnce(recommendations)
      .mockResolvedValueOnce(prediction)
      .mockResolvedValueOnce(readiness);

    render(<StudentAnalytics setActivePage={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Practice overview: Network unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh analytics" }));
    expect(await screen.findByText("Completed attempts")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Analytics are up to date"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
