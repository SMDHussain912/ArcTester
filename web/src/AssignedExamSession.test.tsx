import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AssignedExamSession from "./AssignedExamSession";
import type { AssignedExamPackage } from "./types/assignedExams";

vi.mock("./useExamIntegrity", () => ({
  useExamIntegrity: () => ({
    flagged: false, warn: false, violationCount: 0, maxViolations: 10,
    requestFullscreen: vi.fn(),
  }),
}));

const examPackage: AssignedExamPackage = {
  assignmentId: "assignment-1",
  title: "CSE Mock Exam",
  version: 1,
  instructions: "Choose one answer.",
  durationMinutes: 60,
  integrityLevel: "OFF",
  dueAt: null,
  questions: [{
    id: "question-1", position: 0, subject: "Mathematics", topic: "Algebra",
    text: "What is 2 + 2?", options: ["1", "2", "3", "4"],
    marks: 1, negativeMarks: 0.25, optionOrder: [0, 1, 2, 3],
  }],
};

describe("AssignedExamSession leave action", () => {
  afterEach(() => vi.restoreAllMocks());

  it("leaves the exam screen after explicit confirmation", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const leaveAssignedExam = vi.fn().mockResolvedValue(undefined);
    render(
      <AssignedExamSession
        package={examPackage} answers={{}} saveStatus="saved" paused={false}
        remainingSeconds={3600} busy={false} error={null}
        selectAssignedAnswer={vi.fn()} submitAssignedExam={vi.fn()}
        leaveAssignedExam={leaveAssignedExam}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave exam" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(leaveAssignedExam).toHaveBeenCalledTimes(1);
  });

  it("does not leave when the confirmation is cancelled", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const leaveAssignedExam = vi.fn().mockResolvedValue(undefined);
    render(
      <AssignedExamSession
        package={examPackage} answers={{}} saveStatus="saved" paused={false}
        remainingSeconds={3600} busy={false} error={null}
        selectAssignedAnswer={vi.fn()} submitAssignedExam={vi.fn()}
        leaveAssignedExam={leaveAssignedExam}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Leave exam" }));
    expect(leaveAssignedExam).not.toHaveBeenCalled();
  });
});
