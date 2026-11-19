import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminPaperBuilder, { type AdminPaperDraft, type AdminPaperCatalogSubject, type AdminPaperQuestion } from "./AdminPaperBuilder";

const exam: AdminPaperDraft = { title: "AP ECET Mock", description: "", instructions: "Choose one answer.", duration: "180", shuffleQuestions: true, shuffleOptions: false, marks: "1", negative: "0.25", selectionMode: "manual", perSubject: "20" };
const catalog: AdminPaperCatalogSubject[] = [{ id: 1, name: "Mathematics", count: 25, topics: [] }];
const questions: AdminPaperQuestion[] = [{ id: 7, subject: "Mathematics", topic: "Algebra", text: "What is 2 + 2?", options: ["1", "2", "3", "4"], correctIndex: 3, explanation: "", source: "", difficulty: "easy" }];
const props = { exam, examIds: [7], catalog, questions, page: 1, subject: "", difficulty: "", subjectQuotas: {}, difficultyMix: { easy: 30, medium: 50, hard: 20 }, subjectScoring: {}, busy: false, onExamChange: vi.fn(), onLoadPreset: vi.fn(), onSelectionModeChange: vi.fn(), onSubjectQuotaChange: vi.fn(), onDifficultyMixChange: vi.fn(), onSubjectChange: vi.fn(), onDifficultyChange: vi.fn(), onSelectVisible: vi.fn(), onToggleQuestion: vi.fn(), onPageChange: vi.fn(), onSubjectScoringChange: vi.fn(), onSubmit: vi.fn() };

describe("AdminPaperBuilder", () => {
  it("renders paper details, manual question selection and computed summary", () => {
    render(<AdminPaperBuilder {...props} />);
    expect(screen.getByRole("heading", { name: "Mock test builder" })).toBeTruthy();
    expect(screen.getByText("What is 2 + 2?")).toBeTruthy();
    expect(screen.getByText("180 min")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft exam →" }).hasAttribute("disabled")).toBe(false);
  });

  it("delegates paper fields, preset, selection mode and question actions", () => {
    const handlers = { onExamChange: vi.fn(), onLoadPreset: vi.fn(), onSelectionModeChange: vi.fn(), onSubjectChange: vi.fn(), onDifficultyChange: vi.fn(), onSelectVisible: vi.fn(), onToggleQuestion: vi.fn(), onPageChange: vi.fn() };
    render(<AdminPaperBuilder {...props} {...handlers} />);
    fireEvent.change(screen.getByLabelText("Test title"), { target: { value: "New paper" } });
    fireEvent.click(screen.getByRole("button", { name: "Load AP ECET CSE preset" }));
    fireEvent.click(screen.getByRole("button", { name: "Automatic draw" }));
    fireEvent.click(screen.getByRole("button", { name: "Select visible" }));
    fireEvent.click(screen.getAllByRole("checkbox")[2]);
    expect(handlers.onExamChange).toHaveBeenCalledWith("title", "New paper");
    expect(handlers.onLoadPreset).toHaveBeenCalledTimes(1);
    expect(handlers.onSelectionModeChange).toHaveBeenCalledWith("random");
    expect(handlers.onSelectVisible).toHaveBeenCalledTimes(1);
    expect(handlers.onToggleQuestion).toHaveBeenCalledWith(7);
  });

  it("renders random quotas and difficulty controls and disables invalid submission", () => {
    const randomExam = { ...exam, title: "", selectionMode: "random" as const };
    const onSubjectQuotaChange = vi.fn(), onDifficultyMixChange = vi.fn();
    render(<AdminPaperBuilder {...props} exam={randomExam} examIds={[]} onSubjectQuotaChange={onSubjectQuotaChange} onDifficultyMixChange={onDifficultyMixChange} />);
    fireEvent.change(screen.getAllByRole("spinbutton")[4], { target: { value: "30" } });
    fireEvent.change(screen.getAllByRole("spinbutton")[5], { target: { value: "40" } });
    expect(onSubjectQuotaChange).toHaveBeenCalledWith("Mathematics", 30);
    expect(onDifficultyMixChange).toHaveBeenCalledWith("easy", 40);
    expect(screen.getByRole("button", { name: "Save draft exam →" }).hasAttribute("disabled")).toBe(true);
  });
});
