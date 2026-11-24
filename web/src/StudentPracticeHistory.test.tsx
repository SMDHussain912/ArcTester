import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import StudentPracticeHistory from "./StudentPracticeHistory";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));
const mockedRequest = vi.mocked(request);

describe("StudentPracticeHistory", () => {
  beforeEach(() => mockedRequest.mockReset());

  it("lists completed attempts and opens the saved answer review", async () => {
    mockedRequest
      .mockResolvedValueOnce({
        items: [{ attemptId: 41, mode: "mock", startedAt: "2026-11-24T02:00:00.000Z", finishedAt: "2026-11-24T05:00:00.000Z", score: 150, total: 200, expired: false }],
        page: 1, limit: 10, total: 1, totalPages: 1,
      } as never)
      .mockResolvedValueOnce({
        attemptId: 41, mode: "mock", score: 1, incorrect: 0, unanswered: 0, total: 1,
        breakdown: [{ subject: "CSE", correct: 1, incorrect: 0, unanswered: 0, total: 1 }],
        questions: [{ questionId: 7, text: "A review test question", options: ["A", "B"], questionType: "mcq", answerData: {}, response: 0, selectedIndex: 0, correctIndex: 0, isCorrect: true, explanation: "Correct." }],
      } as never);

    render(<StudentPracticeHistory />);
    expect(await screen.findByRole("heading", { name: "Full mock · Attempt #41" })).toBeInTheDocument();
    expect(screen.getByText("150/200")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review answers" }));
    expect(await screen.findByText("A review test question")).toBeInTheDocument();
    await waitFor(() => expect(mockedRequest).toHaveBeenCalledWith("/tests/41/result"));
  });
});
