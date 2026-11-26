import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge, Button, Card, ProgressBar } from "./ui";

describe("shared design system primitives", () => {
  it("renders a native submit button and exposes busy state", () => {
    render(<Button type="submit" loading>Continue</Button>);
    const button = screen.getByRole("button", { name: "Continue" });
    expect(button).toHaveAttribute("type", "submit");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button.querySelector('[aria-hidden="true"]')).toBeTruthy();
  });

  it("applies variant, size and full-width contracts", () => {
    render(<Button variant="secondary" size="lg" fullWidth>Back</Button>);
    expect(screen.getByRole("button", { name: "Back" })).toHaveClass(
      "ds-button--secondary",
      "ds-button--lg",
      "ds-button--full",
    );
  });

  it("provides controlled card padding and badge status", () => {
    render(<><Card padding="lg">Study card</Card><Badge variant="success">Mastered</Badge></>);
    expect(screen.getByText("Study card")).toHaveClass("ds-card--padding-lg");
    expect(screen.getByText("Mastered")).toHaveClass("ds-badge--success");
  });

  it("clamps progress to its accessible 0–100 range", () => {
    render(<ProgressBar value={145} label="Course progress" showValue />);
    expect(screen.getByRole("progressbar", { name: "Course progress" })).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByRole("progressbar").firstElementChild).toHaveStyle({ width: "100%" });
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("treats invalid progress as zero", () => {
    render(<ProgressBar value={Number.NaN} label="Daily goal" />);
    expect(screen.getByRole("progressbar", { name: "Daily goal" })).toHaveAttribute("aria-valuenow", "0");
  });
});
