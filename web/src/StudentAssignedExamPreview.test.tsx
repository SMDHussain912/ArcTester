import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAssignedExamPreview from "./StudentAssignedExamPreview";

const assignments = [
  { id: "a1", exam: { title: "ECET Mock Test 1" }, version: 2, questionCount: 100, durationMinutes: 120, availableFrom: null, dueAt: null, submission: null },
  { id: "a2", exam: { title: "ECET Mock Test 2" }, version: 1, questionCount: 50, durationMinutes: 60, availableFrom: "2026-11-11T10:00:00.000Z", dueAt: null, submission: null },
  { id: "a3", exam: { title: "Already submitted" }, version: 1, questionCount: 20, durationMinutes: 30, availableFrom: null, dueAt: null, submission: { id: "s1" } },
];

describe("StudentAssignedExamPreview", () => {
  it("shows pending assignments, count and schedule state while excluding submitted exams", () => {
    render(<StudentAssignedExamPreview assignments={assignments} onViewAll={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "Your assigned exams" })).toBeInTheDocument();
    expect(screen.getByText("2 exams awaiting submission")).toBeInTheDocument();
    expect(screen.getByText("ECET Mock Test 1")).toBeInTheDocument();
    expect(screen.getByText("ECET Mock Test 2")).toBeInTheDocument();
    expect(screen.queryByText("Already submitted")).not.toBeInTheDocument();
  });

  it("renders only the first three pending assignments and delegates View all", () => {
    const onViewAll = vi.fn();
    const many = [...assignments, ...[4, 5].map((n) => ({ id: `a${n}`, exam: { title: `Extra exam ${n}` }, version: 1, questionCount: 10, durationMinutes: 15, availableFrom: null, dueAt: null, submission: null }))];
    render(<StudentAssignedExamPreview assignments={many} onViewAll={onViewAll} />);

    expect(screen.getByText("Extra exam 4")).toBeInTheDocument();
    expect(screen.queryByText("Extra exam 5")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /View all exams/ }));
    expect(onViewAll).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when every assignment is already submitted", () => {
    const { container } = render(<StudentAssignedExamPreview assignments={[assignments[2]]} onViewAll={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
