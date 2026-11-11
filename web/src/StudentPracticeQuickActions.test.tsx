import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentPracticeQuickActions from "./StudentPracticeQuickActions";

describe("StudentPracticeQuickActions", () => {
  it("renders both practice modes and their descriptions", () => {
    render(<StudentPracticeQuickActions disabled={false} onStartMock={vi.fn()} onReviewMistakes={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "ECET mock test" })).toBeInTheDocument();
    expect(screen.getByText("Take a full-length paper using the configured AP ECET test pattern.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Review mistakes" })).toBeInTheDocument();
    expect(screen.getByText("Revisit questions you have answered incorrectly.")).toBeInTheDocument();
  });

  it("delegates each action to its parent callback", () => {
    const onStartMock = vi.fn();
    const onReviewMistakes = vi.fn();
    render(<StudentPracticeQuickActions disabled={false} onStartMock={onStartMock} onReviewMistakes={onReviewMistakes} />);
    fireEvent.click(screen.getByRole("button", { name: "Start mock test" }));
    fireEvent.click(screen.getByRole("button", { name: "Review mistakes" }));
    expect(onStartMock).toHaveBeenCalledTimes(1);
    expect(onReviewMistakes).toHaveBeenCalledTimes(1);
  });

  it("disables both actions while another request is busy", () => {
    render(<StudentPracticeQuickActions disabled onStartMock={vi.fn()} onReviewMistakes={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start mock test" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Review mistakes" })).toBeDisabled();
  });
});
