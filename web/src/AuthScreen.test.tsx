import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthScreen from "./AuthScreen";
function renderAuth(overrides: Partial<React.ComponentProps<typeof AuthScreen>> = {}) {
  const props = { email: "", password: "", invitationToken: "", register: false, busy: false, error: "", onEmailChange: vi.fn(), onPasswordChange: vi.fn(), onInvitationTokenChange: vi.fn(), onRegisterChange: vi.fn(), onAuthenticate: vi.fn(), ...overrides };
  render(<AuthScreen {...props} />); return props;
}
describe("AuthScreen", () => {
  it("renders the sign-in form and delegates field changes and submission", () => {
    const props = renderAuth();
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "student@example.test" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "secret123" } });
    fireEvent.submit(screen.getByRole("button", { name: "Sign in" }).closest("form")!);
    expect(props.onEmailChange).toHaveBeenCalledWith("student@example.test");
    expect(props.onPasswordChange).toHaveBeenCalledWith("secret123");
    expect(props.onAuthenticate).toHaveBeenCalledTimes(1);
  });
  it("shows the invitation field and registration password requirements", () => {
    const props = renderAuth({ register: true });
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.getByLabelText("Invitation code")).toBeTruthy();
    expect(screen.getByLabelText("Password").getAttribute("minLength")).toBe("8");
    fireEvent.change(screen.getByLabelText("Invitation code"), { target: { value: "invite-code" } });
    expect(props.onInvitationTokenChange).toHaveBeenCalledWith("invite-code");
  });
  it("disables submission while busy and exposes API errors", () => {
    renderAuth({ busy: true, error: "The invitation has expired." });
    expect(screen.getByRole("button", { name: "Please wait…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("The invitation has expired.")).toBeTruthy();
  });
  it("delegates switching between sign-in and registration", () => {
    const props = renderAuth();
    fireEvent.click(screen.getByRole("button", { name: "Have an invitation? Create account" }));
    expect(props.onRegisterChange).toHaveBeenCalledWith(true);
  });
});
