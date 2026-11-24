import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticeResults, { type PracticeResult } from "./StudentPracticeResults";

const result: PracticeResult = {
  attemptId: 4,
  score: 2,
  incorrect: 1,
  unanswered: 1,
  total: 3,
  breakdown: [
    { subject: "Mathematics", correct: 2, incorrect: 0, unanswered: 0, total: 2 },
    { subject: "Physics", correct: 0, incorrect: 1, unanswered: 0, total: 1 },
  ],
  questions: [
    { questionId: 1, text: "What is 1 + 1?", options: ["1", "2", "3", "4"], selectedIndex: 1, correctIndex: 1, isCorrect: true, explanation: "Addition combines quantities." },
    { questionId: 2, text: "What is the unit of force?", options: ["Watt", "Newton", "Joule", "Volt"], selectedIndex: 0, correctIndex: 1, isCorrect: false, explanation: "Force is measured in newtons." },
    { questionId: 3, text: "Which is a prime number?", options: ["4", "6", "7", "9"], selectedIndex: null, correctIndex: 2, isCorrect: false, explanation: "Seven has only two factors." },
  ],
};

describe("StudentPracticeResults", () => {
  it("renders score and reviews one answer at a time", () => {
    render(<StudentPracticeResults result={result} onBack={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Your result" })).toBeTruthy();
    expect(screen.getByText("2 / 3")).toBeTruthy();
    expect(screen.getByText("1 incorrect · 1 unanswered")).toBeTruthy();
    expect(screen.getByText("Addition combines quantities.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Review question 1 correct" })).toHaveAttribute("aria-current", "step");
    expect(screen.queryByRole("heading", { name: "What is the unit of force?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Review question 2 incorrect" }));
    expect(screen.getByText("Force is measured in newtons.")).toBeInTheDocument();
    expect(screen.getByText("Incorrect")).toBeInTheDocument();
    expect(screen.getByText("Your answer:").parentElement).toHaveTextContent("Watt");
    expect(screen.getByText("Correct answer:").parentElement).toHaveTextContent("Newton");

    fireEvent.click(screen.getByRole("button", { name: "Review question 3 unanswered" }));
    expect(screen.getAllByText("Not answered")).toHaveLength(2);
    expect(screen.getByText("Seven has only two factors.")).toBeInTheDocument();
  });

  it("delegates the back action", () => {
    const onBack = vi.fn();
    render(<StudentPracticeResults result={result} onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "Back to dashboard" }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("labels full mock score and paginated answer review distinctly", () => {
    render(<StudentPracticeResults result={{ ...result, mode: "mock" }} onBack={vi.fn()} />);
    expect(screen.getByText("AP ECET FULL MOCK · RESULTS")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Full mock answer review/ })).toBeInTheDocument();
  });
});
