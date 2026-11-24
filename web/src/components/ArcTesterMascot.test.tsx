import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ArcTesterMascot from "./ArcTesterMascot";

describe("ArcTesterMascot", () => {
  it("renders Aster with an accessible name and requested dimensions", () => {
    render(<ArcTesterMascot size={144} />);
    const image = screen.getByRole("img", { name: "Aster, the ArcTester study owl" });
    expect(image).toHaveAttribute("src", "/brand/aster-mascot.svg");
    expect(image).toHaveAttribute("width", "144");
    expect(image).toHaveAttribute("height", "144");
  });

  it("uses the compact mark and hides decorative artwork from assistive technology", () => {
    const { container } = render(<ArcTesterMascot variant="mark" decorative size={40} />);
    const mark = container.querySelector("svg");
    expect(mark).toHaveAttribute("width", "40");
    expect(mark).toHaveAttribute("height", "40");
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).not.toHaveAttribute("role", "img");
  });
});
