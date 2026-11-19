import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticeSession, { type PracticeSessionTest } from "./StudentPracticeSession";
const test: PracticeSessionTest = { attemptId: 12, mode: "practice", deadline: "2026-11-10T10:00:00.000Z", questions: [
 { id: 1, subject: "Mathematics", topic: "Algebra", text: "What is 2 + 2?", options: ["3", "4", "5", "6"] },
 { id: 2, subject: "Physics", topic: null, text: "Which is a unit of force?", options: ["Watt", "Newton", "Joule", "Volt"] },
], warnings: ["Some requested topics had fewer questions than expected."] };
describe("StudentPracticeSession", () => {
 it("renders session progress, server countdown, warnings and questions", () => {
  render(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={125} busy={false} onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("heading", { name: "Stay focused." })).toBeTruthy(); expect(screen.getByText(/2 questions.*1 answered/)).toBeTruthy();
  expect(screen.getByText("02:05 remaining")).toBeTruthy(); expect(screen.getByText(test.warnings[0])).toBeTruthy();
  expect(screen.getByRole("heading", { name: "What is 2 + 2?" })).toBeTruthy(); expect(screen.getByRole("button", { name: "Go to question 1, answered" })).toBeTruthy();
 });
 it("delegates answer selection, leave and submit actions", () => {
  const onLeave=vi.fn(),onSelectAnswer=vi.fn(),onSubmit=vi.fn();
  render(<StudentPracticeSession test={test} answers={{}} remainingSeconds={null} busy={false} onLeave={onLeave} onSelectAnswer={onSelectAnswer} onSubmit={onSubmit} />);
  fireEvent.click(screen.getByRole("button", { name: /B\s*4/ })); fireEvent.click(screen.getByRole("button", { name: "Leave session" })); fireEvent.click(screen.getByRole("button", { name: /Submit answers/ }));
  expect(onSelectAnswer).toHaveBeenCalledWith(1,1); expect(onLeave).toHaveBeenCalledTimes(1); expect(onSubmit).toHaveBeenCalledTimes(1);
 });
 it("supports next, previous and direct question navigation with an active state", () => {
  render(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={null} busy={false} onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  const first = screen.getByRole("button", { name: "Go to question 1, answered" });
  const second = screen.getByRole("button", { name: "Go to question 2, unanswered" });
  expect(first).toHaveAttribute("aria-current", "step");
  fireEvent.click(screen.getByRole("button", { name: "Next question" }));
  expect(second).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Viewing question 2 of 2")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Next question" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Previous question" }));
  expect(first).toHaveAttribute("aria-current", "step");
  fireEvent.click(second);
  expect(second).toHaveAttribute("aria-pressed", "true");
 });

 it("announces answer progress and exposes selected options accessibly", () => {
  render(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={null} busy={false} onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("progressbar", { name: "Answered questions" })).toHaveAttribute("aria-valuenow", "1");
  expect(screen.getByText(/1 \/ 2 answered · 1 remaining/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /B\s*4/ })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Submit answers/ })).toHaveTextContent("1/2");
 });

 it("disables submission while busy and omits countdown for untimed practice", () => {
  render(<StudentPracticeSession test={{ ...test, deadline: null }} answers={{}} remainingSeconds={null} busy onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Submitting…" }).hasAttribute("disabled")).toBe(true); expect(screen.queryByText(/remaining/)).toBeNull();
 });
});
