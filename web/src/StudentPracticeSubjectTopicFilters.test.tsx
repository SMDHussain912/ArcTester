import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticeSubjectTopicFilters from "./StudentPracticeSubjectTopicFilters";

const subjects = [
  { subject: "Mathematics", count: 40, topics: [{ topic: "Algebra", count: 20 }, { topic: "Calculus", count: 20 }] },
  { subject: "Physics", count: 30, topics: [{ topic: "Mechanics", count: 30 }] },
  { subject: "Chemistry", count: 15 },
];

function Harness({ onError = vi.fn() }: { onError?: (message: string) => void }) {
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [selectedTopicKeys, setSelectedTopicKeys] = useState<string[]>([]);
  return <StudentPracticeSubjectTopicFilters subjects={subjects} showEmptyMessage={false} selectedSubjects={selectedSubjects} selectedTopicKeys={selectedTopicKeys} onSubjectsChange={setSelectedSubjects} onTopicKeysChange={setSelectedTopicKeys} onError={onError} />;
}

describe("StudentPracticeSubjectTopicFilters", () => {
  it("selects subjects and displays only their available topic choices", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mathematics/ }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("Algebra")).toBeInTheDocument();
    expect(screen.getByText("Calculus")).toBeInTheDocument();
    expect(screen.queryByText("Mechanics")).not.toBeInTheDocument();
  });
  it("removes a subject and its topic filters when that subject is deselected", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mathematics/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Algebra/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Mathematics/ }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.queryByText("Algebra")).not.toBeInTheDocument();
  });
  it("clears all subject and topic filters", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Mathematics/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Algebra/ }));
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByText("All topics")).toBeInTheDocument();
  });
  it("enforces the 30-subject limit", () => {
    const onError = vi.fn();
    render(<StudentPracticeSubjectTopicFilters subjects={Array.from({ length: 31 }, (_, i) => ({ subject: `Subject ${i + 1}`, count: 1 }))} showEmptyMessage={false} onSubjectsChange={vi.fn()} selectedSubjects={Array.from({ length: 30 }, (_, i) => `Subject ${i + 1}`)} selectedTopicKeys={[]} onTopicKeysChange={vi.fn()} onError={onError} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Subject 31/ }));
    expect(onError).toHaveBeenCalledWith("You can select up to 30 subjects in one practice paper.");
  });
  it("shows the empty question-bank message when no subjects exist", () => {
    render(<StudentPracticeSubjectTopicFilters subjects={[]} showEmptyMessage selectedSubjects={[]} selectedTopicKeys={[]} onSubjectsChange={vi.fn()} onTopicKeysChange={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText("No subjects are available in the question bank yet.")).toBeInTheDocument();
  });
});
