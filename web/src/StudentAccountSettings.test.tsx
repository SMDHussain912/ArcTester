import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import StudentAccountSettings from "./StudentAccountSettings";
import { request } from "./apiClient";

vi.mock("./apiClient", () => ({ request: vi.fn() }));

describe("StudentAccountSettings", () => {
  it("opens settings from the account page and returns to account", () => {
    vi.mocked(request).mockResolvedValue({ sessions: [], events: [], passkeys: [], authenticatorEnabled: false, recoveryCodesRemaining: 0, passkeyCount: 0 });
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
        onProfileChanged={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "☾ Dark" }));
    expect(onThemeChange).toHaveBeenCalledWith("dark");
    fireEvent.click(screen.getByRole("button", { name: "← Back to account" }));
    expect(screen.getByRole("heading", { name: "Account" })).toBeInTheDocument();
  });

  it("changes password and shows authenticator and passkey security controls", async () => {
    vi.mocked(request).mockResolvedValue({ sessions: [], events: [], passkeys: [], authenticatorEnabled: false, recoveryCodesRemaining: 0, passkeyCount: 0 });
    render(<StudentAccountSettings page="settings" email="student@example.com" userId={12} role="STUDENT" theme="light" onThemeChange={vi.fn()} reduceMotion={false} onReduceMotionChange={vi.fn()} showAnnouncementPopups onShowAnnouncementPopupsChange={vi.fn()} busy={false} onSignOut={vi.fn()} onProfileChanged={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password" } });
    fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-12345" } });
    fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "new-password-12345" } });
    fireEvent.click(screen.getByRole("button", { name: "Update password" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/auth/change-password", expect.objectContaining({ method: "POST", body: JSON.stringify({ currentPassword: "old-password", newPassword: "new-password-12345" }) })));
    expect(screen.getByText("Two-factor authentication")).toBeInTheDocument();
    expect(screen.getByText(/Authenticator app/)).toBeInTheDocument();
    expect(screen.getByText("Passkeys")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Set up authenticator" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeInTheDocument();
  });

  it("requires reauthentication after an academic identity change", async () => {
    vi.mocked(request).mockResolvedValue({ changed: true, requiresReauthentication: true });
    const onProfileChanged = vi.fn();
    render(<StudentAccountSettings page="settings" email="student@example.com" userId={12} role="STUDENT" fullName="Test Student" registrationNumber="24999-CM-053" collegeName="Test Polytechnic" collegeCode="999" branchName="Computer Engineering (CME)" branchCode="CM" theme="light" onThemeChange={vi.fn()} reduceMotion={false} onReduceMotionChange={vi.fn()} showAnnouncementPopups onShowAnnouncementPopupsChange={vi.fn()} busy={false} onSignOut={vi.fn()} onProfileChanged={onProfileChanged} />);
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "Updated Test Student" } });
    fireEvent.click(screen.getByRole("button", { name: "Save academic profile" }));
    await waitFor(() => expect(request).toHaveBeenCalledWith("/auth/profile", expect.objectContaining({ method: "PATCH", body: expect.stringContaining("Updated Test Student") })));
    expect(screen.getByRole("dialog")).toHaveTextContent("Settings changed successfully. Please log in again.");
    fireEvent.click(screen.getByRole("button", { name: "Continue to login" }));
    expect(onProfileChanged).toHaveBeenCalledTimes(1);
  });
});
