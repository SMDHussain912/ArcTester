import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AuthScreen from "./AuthScreen";
function renderAuth(overrides: Partial<React.ComponentProps<typeof AuthScreen>> = {}) {
  const props = { email: "", password: "", register: false, busy: false, error: "", academicProfile: { fullName: "", collegeName: "", collegeCode: "", postalPin: "", branchName: "", branchCode: "" }, onAcademicChange: vi.fn(), onEmailChange: vi.fn(), onPasswordChange: vi.fn(), onRegisterChange: vi.fn(), onAuthenticate: vi.fn(), ...overrides };
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
  it("shows self-registration without an invitation code and requires a strong password", () => {
    renderAuth({ register: true });
    expect(screen.getByRole("heading", { name: "Create your account" })).toBeTruthy();
    expect(screen.queryByLabelText("Invitation code")).toBeNull();
    expect(screen.getByLabelText("Password").getAttribute("minLength")).toBe("8");
    expect(screen.getByLabelText("Full name")).toBeTruthy();
    expect(screen.getByLabelText("College / Polytechnic")).toBeTruthy();
    expect(screen.getByLabelText("College PIN / institute code")).toBeTruthy();
    expect(screen.getByLabelText("Diploma branch")).toBeTruthy();
    expect(screen.getByLabelText("College / Polytechnic").getAttribute("list")).toBe("ap-polytechnic-options");
    expect(screen.getByLabelText("Diploma branch").getAttribute("list")).toBe("ap-diploma-branch-options");
    expect(screen.getByText(/administrator will review your account/i)).toBeTruthy();
  });
  it("allows custom college and branch names when catalog suggestions do not match", () => {
    const props = renderAuth({ register: true });
    fireEvent.change(screen.getByLabelText("College / Polytechnic"), { target: { value: "My Unlisted Polytechnic" } });
    fireEvent.change(screen.getByLabelText("Diploma branch"), { target: { value: "Diploma in New Engineering Branch" } });
    expect(props.onAcademicChange).toHaveBeenCalledWith("collegeName", "My Unlisted Polytechnic");
    expect(props.onAcademicChange).toHaveBeenCalledWith("branchName", "Diploma in New Engineering Branch");
  });
  it("autofills institute and course codes from known catalog matches", () => {
    const props = renderAuth({ register: true });
    fireEvent.change(screen.getByLabelText("College / Polytechnic"), { target: { value: "Andhra Polytechnic, Kakinada" } });
    fireEvent.change(screen.getByLabelText("Diploma branch"), { target: { value: "Diploma in Computer Engineering (Artificial Intelligence)" } });
    expect(props.onAcademicChange).toHaveBeenCalledWith("collegeCode", "010");
    expect(props.onAcademicChange).toHaveBeenCalledWith("branchCode", "CAI");
  });
  it("disables submission while busy and exposes API errors", () => {
    renderAuth({ busy: true, error: "The invitation has expired." });
    expect(screen.getByRole("button", { name: "Please wait…" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText("The invitation has expired.")).toBeTruthy();
  });
  it("delegates switching between sign-in and registration", () => {
    const props = renderAuth();
    fireEvent.click(screen.getByRole("button", { name: "New student? Create an account" }));
    expect(props.onRegisterChange).toHaveBeenCalledWith(true);
  });
});
