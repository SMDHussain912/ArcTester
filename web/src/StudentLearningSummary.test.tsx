import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import StudentLearningSummary from "./StudentLearningSummary";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn(), API: "/api" }));
const mockedRequest = vi.mocked(request);
const overview = {
  practice: { completedAttempts: 4, correct: 32, incorrect: 8, accuracy: 0.8, trend: [{ attemptId: 44, finishedAt: "2026-11-20T12:00:00.000Z", accuracy: 0.8, correct: 8, total: 10 }] },
  formalExams: { submissions: 2, graded: 1, scorePercentage: 0.75, score: 30, maximumScore: 40 },
};
const rewards = {
  totalXp: 240, xpBalance: 140, level: 3, xpIntoLevel: 40, xpToNextLevel: 60,
  currentStreak: 5, longestStreak: 9, dailyGoalXp: 50,
  today: { xpEarned: 30, goalReachedAt: null },
};
const topics = [{ topicId: 7, subject: "CSE", topic: "Arrays", totalQuestions: 12, answeredQuestions: 5, coveragePct: 42, masteryPct: 60 }];
describe("StudentLearningSummary", () => {
  beforeEach(() => {
    mockedRequest.mockReset();
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === "/analytics/overview") return overview as never;
      if (path === "/gamification") return rewards as never;
      if (path === "/learning/mastery") return { topics } as never;
      throw new Error("Unexpected endpoint");
    });
  });
  it("combines authoritative progress, rewards and topic mastery", async () => {
    const navigate = vi.fn();
    render(<StudentLearningSummary setActivePage={navigate} />);
    expect(await screen.findByRole("heading", { name: "Learning summary" })).toBeTruthy();
    expect(await screen.findByText("80%")).toBeTruthy();
    expect(screen.getByText("240")).toBeTruthy();
    expect(screen.getByText("Arrays")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Manage XP goal & streak freeze" }));
    expect(navigate).toHaveBeenCalledWith("rewards");
  });

  it("renders safe defaults when the API returns incomplete nested objects", async () => {
    mockedRequest.mockImplementation(async (path: string) => {
      if (path === "/analytics/overview") return { practice: {}, formalExams: {} } as never;
      if (path === "/gamification") return {} as never;
      if (path === "/learning/mastery") return {} as never;
      throw new Error("Unexpected endpoint");
    });
    render(<StudentLearningSummary setActivePage={() => undefined} />);
    expect(await screen.findByRole("heading", { name: "Learning summary" })).toBeTruthy();
    expect(screen.getByText("0")).toBeTruthy();
    expect(screen.getByText("Level 1")).toBeTruthy();
    expect(screen.getByText("Completed practice attempts will show here.")).toBeTruthy();
  });

  it("reports unavailable data without inventing a summary", async () => {
    mockedRequest.mockRejectedValue(new Error("API unavailable"));
    render(<StudentLearningSummary setActivePage={() => undefined} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("API unavailable");
    expect(await screen.findByText("Your learning summary is unavailable. Refresh to try again.")).toBeTruthy();
  });
});
