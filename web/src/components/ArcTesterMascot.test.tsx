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
    const image = container.querySelector("img");
    expect(image).toHaveAttribute("src", "/brand/aster-mark.svg");
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("aria-hidden", "true");
  });
});
