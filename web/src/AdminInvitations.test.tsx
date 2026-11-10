import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AdminInvitations, { type AdminInvitation } from "./AdminInvitations";

const invitations: AdminInvitation[] = [
  { id: "invite-1", email: "pending@example.test", expiresAt: "2026-11-12T10:00:00.000Z", status: "PENDING" },
  { id: "invite-2", email: "used@example.test", expiresAt: "2026-11-09T10:00:00.000Z", status: "USED" },
];

describe("AdminInvitations", () => {
  it("renders invitation form, status history and revocation for pending codes", () => {
    const onRevoke = vi.fn();
    render(<AdminInvitations invitations={invitations} inviteEmail="" createdInvitation={null} busy={false} onInviteEmailChange={vi.fn()} onCreate={vi.fn()} onRevoke={onRevoke} />);
    expect(screen.getByRole("heading", { name: "Invitations" })).toBeTruthy();
    expect(screen.getByText("pending@example.test")).toBeTruthy();
    expect(screen.getByText("used@example.test")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Revoke" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(onRevoke).toHaveBeenCalledWith("invite-1");
  });

  it("shows the created invitation token and expiry", () => {
    render(<AdminInvitations invitations={[]} inviteEmail="" createdInvitation={{ email: "new@example.test", token: "one-time-code", expiresAt: "2026-11-12T10:00:00.000Z" }} busy={false} onInviteEmailChange={vi.fn()} onCreate={vi.fn()} onRevoke={vi.fn()} />);
    expect(screen.getByText("one-time-code")).toBeTruthy();
    expect(screen.getByText("new@example.test")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy code" })).toBeTruthy();
  });

  it("delegates email changes and invitation form submission", () => {
    const onInviteEmailChange = vi.fn(), onCreate = vi.fn();
    render(<AdminInvitations invitations={[]} inviteEmail="student@example.test" createdInvitation={null} busy={true} onInviteEmailChange={onInviteEmailChange} onCreate={onCreate} onRevoke={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "next@example.test" } });
    expect(onInviteEmailChange).toHaveBeenCalledWith("next@example.test");
    expect(screen.getByRole("button", { name: "Create invitation" }).hasAttribute("disabled")).toBe(true);
    fireEvent.submit(screen.getByRole("button", { name: "Create invitation" }).closest("form")!);
    expect(onCreate).toHaveBeenCalledTimes(1);
  });
});
