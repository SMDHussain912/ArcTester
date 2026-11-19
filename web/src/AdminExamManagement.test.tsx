import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminExamManagement, { type AdminManagedExam, type AdminExamPreview, type AdminExamStudent } from "./AdminExamManagement";

const exams: AdminManagedExam[] = [{ id: "exam-1", title: "AP ECET Mock", status: "PUBLISHED", versions: [{ version: 2, durationMinutes: 180, publishedAt: "2026-11-10T08:00:00.000Z", _count: { questions: 100, assignments: 4 } }] }];
const students: AdminExamStudent[] = [{ id: 7, email: "student@example.test", createdAt: "2026-11-01T00:00:00.000Z" }];
const preview: AdminExamPreview = { version: 2, title: "AP ECET Mock", durationMinutes: 180, instructions: "Choose one answer.", questions: [{ id: "q1", position: 0, subject: "Maths", topic: "Algebra", marks: 1, negativeMarks: 0.25, text: "What is 2 + 2?", options: ["1", "2", "3", "4"], correctIndex: 3, explanation: "Addition." }] };
const props = { exams, students, assignmentExam: "exam-1", assignedStudents: [7], availableFrom: "", dueAt: "", preview: null, busy: false, onNewExam: vi.fn(), onPreview: vi.fn(), onPublish: vi.fn(), onToggleAssignment: vi.fn(), onToggleStudent: vi.fn(), onAvailableFromChange: vi.fn(), onDueAtChange: vi.fn(), onCancelAssignment: vi.fn(), onAssign: vi.fn(), onClosePreview: vi.fn() };

describe("AdminExamManagement", () => {
  it("renders exam status, version metadata and student assignment controls", () => {
    render(<AdminExamManagement {...props} />);
    expect(screen.getByRole("heading", { name: "Exam management" })).toBeTruthy();
    expect(screen.getByText("100 questions · 180 minutes · 4 assignments")).toBeTruthy();
    expect(screen.getByText("student@example.test")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assign to 1 student(s)" })).toBeTruthy();
  });

  it("delegates exam navigation, preview, assignment selection and schedule changes", () => {
    const handlers = { onNewExam: vi.fn(), onPreview: vi.fn(), onToggleAssignment: vi.fn(), onToggleStudent: vi.fn(), onAvailableFromChange: vi.fn(), onDueAtChange: vi.fn(), onAssign: vi.fn() };
    render(<AdminExamManagement {...props} {...handlers} />);
    fireEvent.click(screen.getByRole("button", { name: "＋ New mock test" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview paper" }));
    fireEvent.click(screen.getByRole("button", { name: "Assign students" }));
    fireEvent.click(screen.getByLabelText("student@example.test"));
    fireEvent.change(screen.getByLabelText("Available from"), { target: { value: "2026-11-20T09:00" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-11-21T09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign to 1 student(s)" }));
    expect(handlers.onNewExam).toHaveBeenCalledTimes(1);
    expect(handlers.onPreview).toHaveBeenCalledWith("exam-1");
    expect(handlers.onToggleAssignment).toHaveBeenCalledWith("exam-1");
    expect(handlers.onToggleStudent).toHaveBeenCalledWith(7, false);
    expect(handlers.onAvailableFromChange).toHaveBeenCalledWith("2026-11-20T09:00");
    expect(handlers.onDueAtChange).toHaveBeenCalledWith("2026-11-21T09:00");
    expect(handlers.onAssign).toHaveBeenCalledTimes(1);
  });

  it("renders the preview answer key and delegates preview close", () => {
    const onClosePreview = vi.fn();
    render(<AdminExamManagement {...props} assignmentExam={null} preview={preview} onClosePreview={onClosePreview} />);
    expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
    expect(screen.getByText("4 ✓")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    expect(onClosePreview).toHaveBeenCalledTimes(1);
  });
});
