import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminQuestionBank, { type AdminBankQuestion, type AdminQuestionCatalogSubject } from "./AdminQuestionBank";

const catalog: AdminQuestionCatalogSubject[] = [{ id: 1, name: "Mathematics", count: 20, topics: [{ id: 2, name: "Algebra", _count: { questions: 20 } }] }];
const question: AdminBankQuestion = { id: 7, subject: "Mathematics", topic: "Algebra", text: "What is 2 + 2?", options: ["1", "2", "3", "4"], correctIndex: 3, explanation: "Add the two values.", source: "Practice", difficulty: "easy" };

describe("AdminQuestionBank", () => {
  it("renders question metadata, options and the correct answer marker", () => {
    render(<AdminQuestionBank questions={[question]} total={1} page={1} query="" subject="" topic="" difficulty="" catalog={catalog} filteredTopics={catalog[0].topics} selected={[]} busy={false} onQueryChange={vi.fn()} onSubjectChange={vi.fn()} onTopicChange={vi.fn()} onDifficultyChange={vi.fn()} onToggleSelected={vi.fn()} onDeleteSelected={vi.fn()} onEditQuestion={vi.fn()} onUpload={vi.fn()} onPageChange={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Question bank" })).toBeTruthy();
    expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
    expect(screen.getByText("D. 4 ✓")).toBeTruthy();
    expect(screen.getByText("Explanation: Add the two values.")).toBeTruthy();
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
  });

  it("renders empty state and disables destructive actions without a selection", () => {
    render(<AdminQuestionBank questions={[]} total={0} page={1} query="" subject="" topic="" difficulty="" catalog={[]} filteredTopics={[]} selected={[]} busy={false} onQueryChange={vi.fn()} onSubjectChange={vi.fn()} onTopicChange={vi.fn()} onDifficultyChange={vi.fn()} onToggleSelected={vi.fn()} onDeleteSelected={vi.fn()} onEditQuestion={vi.fn()} onUpload={vi.fn()} onPageChange={vi.fn()} />);
    expect(screen.getByText("No questions match these filters")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Delete selected (0)" }).hasAttribute("disabled")).toBe(true);
  });

  it("delegates search, filters, selection, edit, upload and pagination", () => {
    const onQueryChange = vi.fn(), onSubjectChange = vi.fn(), onTopicChange = vi.fn(), onDifficultyChange = vi.fn(), onToggleSelected = vi.fn(), onEditQuestion = vi.fn(), onUpload = vi.fn(), onPageChange = vi.fn();
    render(<AdminQuestionBank questions={[question]} total={50} page={1} query="" subject="" topic="" difficulty="" catalog={catalog} filteredTopics={catalog[0].topics} selected={[7]} busy={false} onQueryChange={onQueryChange} onSubjectChange={onSubjectChange} onTopicChange={onTopicChange} onDifficultyChange={onDifficultyChange} onToggleSelected={onToggleSelected} onDeleteSelected={vi.fn()} onEditQuestion={onEditQuestion} onUpload={onUpload} onPageChange={onPageChange} />);
    fireEvent.change(screen.getByPlaceholderText(/Search question text/), { target: { value: "force" } });
    fireEvent.change(screen.getByDisplayValue("All subjects"), { target: { value: "Mathematics" } });
    fireEvent.change(screen.getByDisplayValue("All topics"), { target: { value: "Algebra" } });
    fireEvent.change(screen.getByDisplayValue("All difficulty"), { target: { value: "hard" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Select question 7" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit question" }));
    fireEvent.click(screen.getByRole("button", { name: /Upload questions/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    expect(onQueryChange).toHaveBeenCalledWith("force");
    expect(onSubjectChange).toHaveBeenCalledWith("Mathematics");
    expect(onTopicChange).toHaveBeenCalledWith("Algebra");
    expect(onDifficultyChange).toHaveBeenCalledWith("hard");
    expect(onToggleSelected).toHaveBeenCalledWith(7);
    expect(onEditQuestion).toHaveBeenCalledWith(question);
    expect(onUpload).toHaveBeenCalledTimes(1);
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
