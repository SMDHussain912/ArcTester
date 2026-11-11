import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StudentQuestionBankStats from "./StudentQuestionBankStats";

describe("StudentQuestionBankStats", () => {
  it("renders the question and subject counts from the bank", () => {
    render(<StudentQuestionBankStats bank={{ total: 240, subjects: [{}, {}, {}] }} visible />);
    expect(screen.getByText("240")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Available questions")).toBeInTheDocument();
    expect(screen.getByText("In your question bank")).toBeInTheDocument();
  });

  it("uses placeholders before the bank loads and preserves dashboard visibility", () => {
    const { container, rerender } = render(<StudentQuestionBankStats bank={null} visible={false} />);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(container.querySelector(".stats-row")).toHaveAttribute("hidden");
    rerender(<StudentQuestionBankStats bank={null} visible />);
    expect(container.querySelector(".stats-row")).not.toHaveAttribute("hidden");
  });
});
