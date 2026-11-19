import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminResultsAnalytics, { type AdminExamResult } from "./AdminResultsAnalytics";

const results: AdminExamResult[] = [
  { id: "result-1", status: "GRADED", score: 82, maximumScore: 100, submittedAt: "2026-11-10T08:00:00.000Z", receivedAt: "2026-11-10T08:00:01.000Z", student: { id: 1, email: "graded@example.test" }, exam: { id: "exam-1", title: "AP ECET Mock" }, version: 2 },
  { id: "result-2", status: "REVIEW_REQUIRED", score: null, maximumScore: 100, submittedAt: "2026-11-10T09:00:00.000Z", receivedAt: "2026-11-10T09:00:01.000Z", student: { id: 2, email: "review@example.test" }, exam: { id: "exam-1", title: "AP ECET Mock" }, version: 2 },
];

describe("AdminResultsAnalytics", () => {
  it("renders submission metrics, average and student result rows", () => {
    render(<AdminResultsAnalytics results={results} onRefresh={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Results & analytics" })).toBeTruthy();
    expect(screen.getByText("82 / 100")).toBeTruthy();
    expect(screen.getByText("GRADED")).toBeTruthy();
    expect(screen.getByText("REVIEW REQUIRED")).toBeTruthy();
    expect(screen.getByText("graded@example.test")).toBeTruthy();
    expect(screen.getByText("review@example.test")).toBeTruthy();
  });

  it("renders empty results and delegates refresh", () => {
    const onRefresh = vi.fn();
    render(<AdminResultsAnalytics results={[]} onRefresh={onRefresh} />);
    expect(screen.getByText("No submissions have been received yet.")).toBeTruthy();
    expect(screen.getAllByText("0")).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Refresh results" }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
