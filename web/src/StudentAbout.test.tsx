import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import StudentAbout from "./StudentAbout";

describe("StudentAbout", () => {
  it("shows product, developer and contact information", () => {
    render(<StudentAbout />);
    expect(screen.getByRole("heading", { name: "About ArcTester" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About the developer" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Project overview" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /smdgameking@gmail.com/ })).toHaveAttribute("href", "mailto:smdgameking@gmail.com");
    expect(screen.getByRole("link", { name: /\+91 76749 33732/ })).toHaveAttribute("href", "tel:+917674933732");
  });
});
