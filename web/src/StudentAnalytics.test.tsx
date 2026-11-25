import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentAnalytics from "./StudentAnalytics";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

const overview = {
  practice: { completedAttempts: 3, questions: 30, correct: 20, incorrect: 8, unanswered: 2, accuracy: 20 / 28 },
  formalExams: { graded: 2, scorePercentage: 76, score: 152, maximumScore: 200, reviewRequired: 1 },
};
const fullMock = {
  generatedAt: "2026-11-22T00:00:00.000Z", completedFullMocks: 1, latestMockAt: "2026-11-21T00:00:00.000Z",
  questionCount: 200, answeredQuestions: 180, correct: 120, incorrect: 60, unanswered: 20, accuracy: 2 / 3,
  subjects: [{ subject: "Maths", topic: null, questionCount: 100, answeredQuestions: 90, correct: 60, incorrect: 30, unanswered: 10, accuracy: 2 / 3 }],
  topics: [],
};

describe("Performance analytics", () => {
  beforeEach(() => vi.mocked(request).mockReset());

  it("shows separate practice, mock and assigned exam performance sections", async () => {
    vi.mocked(request).mockResolvedValueOnce(overview).mockResolvedValueOnce(fullMock);
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByRole("heading", { name: "Performance Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Practice Exam Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mock Test Analytics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assigned / Real Exam Results" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Practice answer breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Mock test answer breakdown" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Subject-wise mock accuracy" })).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
    expect(screen.queryByText(/topic mastery|learning progress|your next study steps|areas to strengthen/i)).not.toBeInTheDocument();
    expect(request).toHaveBeenCalledTimes(2);
    expect(request).toHaveBeenCalledWith("/analytics/overview");
    expect(request).toHaveBeenCalledWith("/analytics/full-mock-performance");
  });

  it("keeps mock analytics visible when the practice and assigned result endpoint fails", async () => {
    vi.mocked(request).mockRejectedValueOnce(new Error("Overview unavailable")).mockResolvedValueOnce(fullMock);
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Practice and assigned exam results: Overview unavailable");
    expect(screen.getByRole("heading", { name: "Mock Test Analytics" })).toBeInTheDocument();
    expect(screen.getByText("120 correct / 180 answered")).toBeInTheDocument();
  });

  it("retries performance data", async () => {
    vi.mocked(request)
      .mockRejectedValueOnce(new Error("Network unavailable")).mockResolvedValueOnce(fullMock)
      .mockResolvedValueOnce(overview).mockResolvedValueOnce(fullMock);
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Network unavailable"));
    fireEvent.click(screen.getByRole("button", { name: "Refresh performance" }));
    expect(await screen.findByText("Practice attempts")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Performance data is up to date"));
  });

  it("normalizes missing API data without showing learning recommendations", async () => {
    vi.mocked(request).mockResolvedValueOnce({} as never).mockResolvedValueOnce({} as never);
    render(<StudentAnalytics setActivePage={vi.fn()} />);
    expect(await screen.findByText("Practice attempts")).toBeInTheDocument();
    expect(screen.getByText("0 completed")).toBeInTheDocument();
    expect(screen.getByText("Graded exams")).toBeInTheDocument();
    expect(screen.queryByText(/focus area|study recommendation/i)).not.toBeInTheDocument();
  });
});
