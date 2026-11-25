import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StudentAbout from "./StudentAbout";

describe("StudentAbout", () => {
  it("shows product, developer and contact information", () => {
    render(<StudentAbout />);
    expect(screen.getByRole("heading", { name: "About ArcTester" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About me" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Shaik Mahammad Hussain" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Aster, the ArcTester owl mascot" })).toHaveAttribute("src", "/brand/aster-mascot.svg");
    expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /smdgameking@gmail.com/ })).toHaveAttribute("href", "mailto:smdgameking@gmail.com");
    expect(screen.getByRole("link", { name: /\+91 76749 33732/ })).toHaveAttribute("href", "tel:+917674933732");
  });
});
