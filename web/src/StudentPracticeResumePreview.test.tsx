import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticeResumePreview from "./StudentPracticeResumePreview";

describe("StudentPracticeResumePreview", () => {
  it("shows the answered-question count and browser-save message", () => {
    render(<StudentPracticeResumePreview answeredCount={4} totalQuestions={20} onResume={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Resume your practice session" })).toBeInTheDocument();
    expect(screen.getByText("4 of 20 questions answered. Your selections are saved in this browser.")).toBeInTheDocument();
  });

  it("delegates Continue practice to the parent", () => {
    const onResume = vi.fn();
    render(<StudentPracticeResumePreview answeredCount={0} totalQuestions={10} onResume={onResume} />);
    fireEvent.click(screen.getByRole("button", { name: "Continue practice" }));
    expect(onResume).toHaveBeenCalledTimes(1);
  });
});
