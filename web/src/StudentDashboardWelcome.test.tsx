import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentDashboardWelcome from "./StudentDashboardWelcome";

describe("StudentDashboardWelcome", () => {
  it("renders the learning dashboard introduction and primary actions", () => {
    render(<StudentDashboardWelcome visible onNavigate={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Make every practice count." })).toBeInTheDocument();
    expect(screen.getByText(/focused practice/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start practicing/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View assigned exams" })).toBeInTheDocument();
    expect(screen.getByText("LEARN · PRACTICE · IMPROVE")).toBeInTheDocument();
  });

  it("routes the primary actions to the correct student workspaces", () => {
    const onNavigate = vi.fn();
    render(<StudentDashboardWelcome visible onNavigate={onNavigate} />);
    fireEvent.click(screen.getByRole("button", { name: /Start practicing/ }));
    fireEvent.click(screen.getByRole("button", { name: "View assigned exams" }));
    expect(onNavigate).toHaveBeenNthCalledWith(1, "practice");
    expect(onNavigate).toHaveBeenNthCalledWith(2, "assigned-exams");
  });

  it("keeps the section hidden when another page is active", () => {
    const { container } = render(<StudentDashboardWelcome visible={false} onNavigate={vi.fn()} />);
    expect(container.querySelector("#dashboard")).toHaveAttribute("hidden");
  });
});
