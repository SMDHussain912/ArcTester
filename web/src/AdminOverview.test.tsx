import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminOverview, { type AdminOverviewExam, type AdminOverviewSubject } from "./AdminOverview";

const exams: AdminOverviewExam[] = [{ id: "exam-1", title: "AP ECET Mock", status: "PUBLISHED" }, { id: "exam-2", title: "Draft mock", status: "DRAFT" }];
const catalog: AdminOverviewSubject[] = [{ id: 1, name: "Mathematics", count: 50 }, { id: 2, name: "Physics", count: 25 }];

describe("AdminOverview", () => {
  it("renders summary metrics and proportional subject coverage", () => {
    const { container } = render(<AdminOverview stats={{ subjects: 2, topics: 8, questions: 75 }} exams={exams} invitationsCount={12} catalog={catalog} onNavigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Build better exams." })).toBeTruthy();
    expect(screen.getByText("75")).toBeTruthy();
    expect(screen.getByText("8 topics mapped")).toBeTruthy();
    expect(screen.getAllByText("2")).toHaveLength(2);
    expect(screen.getByText("1 published")).toBeTruthy();
    expect(screen.getByText("12")).toBeTruthy();
    expect(container.querySelector(".coverage-row i")?.getAttribute("style")).toContain("66.666");
  });

  it("delegates all quick navigation actions", () => {
    const onNavigate = vi.fn();
    render(<AdminOverview stats={{ subjects: 0, topics: 0, questions: 0 }} exams={[]} invitationsCount={0} catalog={[]} onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: "＋ Create mock test" }));
    fireEvent.click(screen.getByRole("button", { name: "Manage subjects →" }));
    fireEvent.click(screen.getByRole("button", { name: /Upload questions/ }));
    fireEvent.click(screen.getByRole("button", { name: /Review question bank/ }));
    fireEvent.click(screen.getByRole("button", { name: /Build a mock paper/ }));
    expect(onNavigate.mock.calls).toEqual([["builder"], ["subjects"], ["import"], ["questions"], ["builder"]]);
  });
});
