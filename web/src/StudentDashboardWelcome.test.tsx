import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StudentDashboardWelcome from "./StudentDashboardWelcome";

describe("StudentDashboardWelcome", () => {
  it("renders the learning dashboard introduction", () => {
    render(<StudentDashboardWelcome visible />);
    expect(screen.getByRole("heading", { name: "Make every practice count." })).toBeInTheDocument();
    expect(screen.getByText("Pick a subject or start a mixed session. Your progress is saved to your account.")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("keeps the section hidden when another page is active", () => {
    const { container } = render(<StudentDashboardWelcome visible={false} />);
    expect(container.querySelector("#dashboard")).toHaveAttribute("hidden");
  });
});
