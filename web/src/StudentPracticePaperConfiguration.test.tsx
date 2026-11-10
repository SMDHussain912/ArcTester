import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticePaperConfiguration from "./StudentPracticePaperConfiguration";
describe("StudentPracticePaperConfiguration", () => {
  it("renders question count, difficulty and even subject quotas", () => {
    render(<StudentPracticePaperConfiguration selectedSubjects={["Math", "Physics", "Chemistry"]} questionCount={20} difficulty="medium" onQuestionCountChange={vi.fn()} onDifficultyChange={vi.fn()} />);
    expect(screen.getByLabelText("Number of questions")).toHaveValue(20);
    expect(screen.getByLabelText("Difficulty")).toHaveValue("medium");
    expect(screen.getByText("Math").nextSibling).toHaveTextContent("7");
    expect(screen.getByText("Physics").nextSibling).toHaveTextContent("7");
    expect(screen.getByText("Chemistry").nextSibling).toHaveTextContent("6");
  });
  it("clamps the requested question count between 1 and 200", () => {
    const onQuestionCountChange = vi.fn();
    render(<StudentPracticePaperConfiguration selectedSubjects={[]} questionCount={20} difficulty="any" onQuestionCountChange={onQuestionCountChange} onDifficultyChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Number of questions"), { target: { value: "999" } });
    expect(onQuestionCountChange).toHaveBeenCalledWith(200);
    fireEvent.change(screen.getByLabelText("Number of questions"), { target: { value: "0" } });
    expect(onQuestionCountChange).toHaveBeenCalledWith(1);
  });
  it("delegates difficulty changes to the parent", () => {
    const onDifficultyChange = vi.fn();
    render(<StudentPracticePaperConfiguration selectedSubjects={[]} questionCount={10} difficulty="any" onQuestionCountChange={vi.fn()} onDifficultyChange={onDifficultyChange} />);
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "hard" } });
    expect(onDifficultyChange).toHaveBeenCalledWith("hard");
  });
});
