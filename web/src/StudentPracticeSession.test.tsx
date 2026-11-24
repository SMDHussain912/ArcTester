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
  expect(screen.getByRole("heading", { name: "What is 2 + 2?" })).toBeTruthy(); expect(screen.getByRole("heading", { name: "Which is a unit of force?" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Go to question 1, answered" })).toBeTruthy();
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
  fireEvent.click(screen.getByRole("button", { name: "Next question in navigator" }));
  expect(second).toHaveAttribute("aria-current", "step");
  expect(screen.getByText("Viewing question 2 of 2")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Which is a unit of force?" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "Submit answers" })).toBeEnabled(); expect(screen.getByRole("heading", { name: "What is 2 + 2?" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Previous question in navigator" }));
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

 it("clearly reports when answers are saved locally while offline", () => {
  render(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={null} busy={false} isOnline={false} localSaveAvailable onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Offline — answers are saved on this device and will sync when you reconnect.");
 });

 it("shows server synchronization progress and pending retry state", () => {
  const view = render(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={null} busy={false} syncStatus="saving" onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Saving answers to the server");
  view.rerender(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={null} busy={false} syncStatus="saved" onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Answers synced to the server");
  view.rerender(<StudentPracticeSession test={test} answers={{ 1: 1 }} remainingSeconds={null} busy={false} syncStatus="pending" onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Server sync pending");
 });

 it("warns when browser storage cannot preserve the practice session", () => {
  render(<StudentPracticeSession test={test} answers={{}} remainingSeconds={null} busy={false} isOnline localSaveAvailable={false} onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("status")).toHaveTextContent("Local recovery is unavailable");
 });

 it("disables submission while busy and omits countdown for untimed practice", () => {
  render(<StudentPracticeSession test={{ ...test, deadline: null }} answers={{}} remainingSeconds={null} busy onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Submitting…" }).hasAttribute("disabled")).toBe(true); expect(screen.getByRole("button", { name: "Leave session" })).toBeDisabled(); expect(screen.queryByText(/\d{2}:\d{2} remaining/)).toBeNull();
 });

 it("requires a final review confirmation before submitting a full mock", () => {
  const onSubmit=vi.fn();
  render(<StudentPracticeSession test={{...test,mode:"mock"}} answers={{1:1}} remainingSeconds={700} busy={false} onLeave={vi.fn()} onSelectAnswer={vi.fn()} onSubmit={onSubmit} />);
  expect(screen.getByRole("heading",{name:"Full mock test"})).toBeInTheDocument();\n  expect(screen.getByRole("heading",{name:"What is 2 + 2?"})).toBeInTheDocument();\n  expect(screen.queryByRole("heading",{name:"Which is a unit of force?"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Review and submit full mock"}));
  expect(screen.getByRole("dialog",{name:"Submit your full mock?"})).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toHaveTextContent("You answered 1 of 2 questions.");
  expect(screen.getByRole("dialog")).toHaveTextContent("1 question is unanswered");
  expect(onSubmit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button",{name:"Continue reviewing"}));
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Review and submit full mock"}));
  fireEvent.click(screen.getByRole("button",{name:"Submit full mock"}));
  expect(onSubmit).toHaveBeenCalledTimes(1);
 });
});
