import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAccountSettings from "./StudentAccountSettings";

describe("StudentAccountSettings", () => {
  it("opens settings from the account page and returns to account", () => {
    const onThemeChange = vi.fn();
    render(
      <StudentAccountSettings
        page="account"
        email="student@example.com"
        userId={12}
        role="STUDENT"
        theme="light"
        onThemeChange={onThemeChange}
        reduceMotion={false}
        onReduceMotionChange={vi.fn()}
        showAnnouncementPopups
        onShowAnnouncementPopupsChange={vi.fn()}
        busy={false}
        onSignOut={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "☾ Dark" }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("button", { name: "Back to account" }));
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  });
});
