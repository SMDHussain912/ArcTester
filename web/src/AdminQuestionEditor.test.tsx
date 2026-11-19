import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminQuestionEditor, { type AdminQuestionForm } from "./AdminQuestionEditor";

const form: AdminQuestionForm = { subject: "Mathematics", topic: "Algebra", text: "What is 2 + 2?", a: "1", b: "2", c: "3", d: "4", correctIndex: "3", difficulty: "easy", explanation: "Addition.", source: "Practice" };

describe("AdminQuestionEditor", () => {
  it("renders a complete MCQ form with edit state and answer key", () => {
    render(<AdminQuestionEditor form={form} editing={true} busy={false} onChange={vi.fn()} onSubmit={vi.fn()} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Edit question" })).toBeTruthy();
    expect(screen.getByDisplayValue("What is 2 + 2?")).toBeTruthy();
    expect(screen.getByDisplayValue("4")).toBeTruthy();
    expect((screen.getByLabelText("Correct answer") as HTMLSelectElement).value).toBe("3");
    expect((screen.getByLabelText("Difficulty") as HTMLSelectElement).value).toBe("easy");
  });

  it("delegates all field changes, submit and back navigation", () => {
    const onChange = vi.fn(), onSubmit = vi.fn(), onBack = vi.fn();
    render(<AdminQuestionEditor form={form} editing={false} busy={false} onChange={onChange} onSubmit={onSubmit} onBack={onBack} />);
    fireEvent.change(screen.getByLabelText("Subject"), { target: { value: "Physics" } });
    fireEvent.change(screen.getByLabelText("Option A"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Correct answer"), { target: { value: "1" } });
    fireEvent.submit(screen.getByRole("button", { name: "Add to question bank" }).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onChange).toHaveBeenCalledWith("subject", "Physics");
    expect(onChange).toHaveBeenCalledWith("a", "9");
    expect(onChange).toHaveBeenCalledWith("correctIndex", "1");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("disables save while busy and delegates form submission", () => {
    const onSubmit = vi.fn();
    render(<AdminQuestionEditor form={form} editing={true} busy={true} onChange={vi.fn()} onSubmit={onSubmit} onBack={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Saving…" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Saving…" }).closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
