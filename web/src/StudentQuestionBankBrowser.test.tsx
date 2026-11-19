import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentQuestionBankBrowser from "./StudentQuestionBankBrowser";

describe("StudentQuestionBankBrowser", () => {
  it("renders each subject with its question count", () => {
    render(<StudentQuestionBankBrowser subjects={[{ subject: "Mathematics", count: 80 }, { subject: "Physics", count: 60 }]} visible disabled={false} onChooseSubject={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Practice by subject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Mathematics.*80 questions/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Physics.*60 questions/ })).toBeInTheDocument();
  });

  it("delegates the selected subject to the parent", () => {
    const onChooseSubject = vi.fn();
    render(<StudentQuestionBankBrowser subjects={[{ subject: "Chemistry", count: 25 }]} visible disabled={false} onChooseSubject={onChooseSubject} />);
    fireEvent.click(screen.getByRole("button", { name: /Chemistry/ }));
    expect(onChooseSubject).toHaveBeenCalledWith("Chemistry");
  });

  it("filters subjects case-insensitively and clears the search", () => {
    render(<StudentQuestionBankBrowser subjects={[{ subject: "Mathematics", count: 80 }, { subject: "Physics", count: 60 }]} visible disabled={false} onChooseSubject={vi.fn()} />);
    const search = screen.getByRole("searchbox", { name: "Search question bank subjects" });
    fireEvent.change(search, { target: { value: "math" } });
    expect(screen.getByRole("button", { name: "Mathematics, 80 questions" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Physics, 60 questions" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear subject search" }));
    expect(screen.getByRole("button", { name: "Physics, 60 questions" })).toBeInTheDocument();
  });

  it("shows useful empty states for unmatched searches and an empty bank", () => {
    const { rerender } = render(<StudentQuestionBankBrowser subjects={[{ subject: "Physics", count: 12 }]} visible disabled={false} onChooseSubject={vi.fn()} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Search question bank subjects" }), { target: { value: "biology" } });
    expect(screen.getByRole("status")).toHaveTextContent("No subjects match");
    rerender(<StudentQuestionBankBrowser subjects={[]} visible disabled={false} onChooseSubject={vi.fn()} />);
    expect(screen.getByRole("status")).toHaveTextContent("No question bank available yet");
  });

  it("preserves hidden state and disabled state", () => {
    const { container, rerender } = render(<StudentQuestionBankBrowser subjects={[]} visible={false} disabled onChooseSubject={vi.fn()} />);
    expect(container.querySelector("section")).toHaveAttribute("hidden");
    rerender(<StudentQuestionBankBrowser subjects={[{ subject: "Math", count: 1 }]} visible disabled onChooseSubject={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Math/ })).toBeDisabled();
  });
});
