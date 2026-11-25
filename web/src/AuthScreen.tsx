import type { FormEvent } from "react";
import { Button } from "./components/ui";
import { AP_DIPLOMA_BRANCHES, AP_POLYTECHNIC_COLLEGES } from "./polytechnicCatalog";

export type AcademicRegistration = {
  fullName: string;
  collegeName: string;
  collegeCode: string;
  postalPin: string;
  branchName: string;
  branchCode: string;
};
type AcademicField = keyof AcademicRegistration;
type AuthScreenProps = {
  email: string; password: string; register: boolean; busy: boolean; error: string;
  academicProfile: AcademicRegistration;
  onAcademicChange: (field: AcademicField, value: string) => void;
  onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onRegisterChange: (value: boolean) => void; onAuthenticate: () => void;
};
export default function AuthScreen({ email, password, register, busy, error, academicProfile, onAcademicChange, onEmailChange, onPasswordChange, onRegisterChange, onAuthenticate }: AuthScreenProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onAuthenticate(); }
  function changeAcademic(field: AcademicField, value: string) {
    onAcademicChange(field, value);
    if (field === "collegeName") {
      const match = AP_POLYTECHNIC_COLLEGES.find((college) => college.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
      if (match) onAcademicChange("collegeCode", match.code);
    }
    if (field === "branchName") {
      const matches = AP_DIPLOMA_BRANCHES.filter((branch) => branch.name.toLocaleLowerCase() === value.trim().toLocaleLowerCase());
      const uniqueCodes = [...new Set(matches.map((branch) => branch.code))];
      // A branch name may exist in both C-23 and C-26 with different codes.
      // Do not silently pick the wrong scheme when the name is ambiguous.
      onAcademicChange("branchCode", uniqueCodes.length === 1 ? uniqueCodes[0] : "");
    }
  }
  return (
    <main className="auth-shell"><section className="auth-card">
      <a className="brand" href="#dashboard"><span className="brand-mark">A</span><span>ArcTester</span></a>
      <p className="eyebrow">{register ? "YOUR COLLEGE. YOUR BRANCH. YOUR PREPARATION." : "YOUR PERSONAL PRACTICE SPACE"}</p>
      <h1>{register ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">{register ? "Join ArcTester with your institute and diploma branch. An administrator will review your account before student access." : "Sign in to continue your preparation."}</p>
      <form onSubmit={handleSubmit}>
        {register ? <>
          <label>Full name<input autoComplete="name" required minLength={2} maxLength={100} value={academicProfile.fullName} onChange={(event) => onAcademicChange("fullName", event.target.value)} /></label>
          <label>College / Polytechnic<input list="ap-polytechnic-options" autoComplete="organization" required minLength={2} maxLength={180} placeholder="Search or type your college name" value={academicProfile.collegeName} onChange={(event) => changeAcademic("collegeName", event.target.value)} /></label>
          <datalist id="ap-polytechnic-options">{AP_POLYTECHNIC_COLLEGES.map((college) => <option key={college.code} value={college.name} label={college.code + (college.district ? " · " + college.district : "")} />)}</datalist>
          <p className="auth-field-hint">College not listed? Type its full name. You can register with a custom college.</p>
          <label>College PIN / institute code<input required maxLength={16} inputMode="text" autoComplete="off" placeholder="SBTET institute code, e.g. 010" value={academicProfile.collegeCode} onChange={(event) => onAcademicChange("collegeCode", event.target.value)} /></label>
          <label>Postal PIN code (optional)<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="postal-code" placeholder="6-digit postal PIN" value={academicProfile.postalPin} onChange={(event) => onAcademicChange("postalPin", event.target.value)} /></label>
          <label>Diploma branch<input list="ap-diploma-branch-options" required minLength={2} maxLength={120} placeholder="Search or type your branch" value={academicProfile.branchName} onChange={(event) => changeAcademic("branchName", event.target.value)} /></label>
          <datalist id="ap-diploma-branch-options">{AP_DIPLOMA_BRANCHES.map((branch) => <option key={branch.code} value={branch.name} label={branch.code} />)}</datalist>
          <p className="auth-field-hint">Branch not listed? Enter the official branch name. The list is a starter catalog and will expand.</p>
          <label>Branch code (optional)<input maxLength={24} placeholder="Auto-filled for listed branches" value={academicProfile.branchCode} onChange={(event) => onAcademicChange("branchCode", event.target.value)} /></label>
        </> : null}
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : 1} required value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label>
        <Button className="auth-submit" fullWidth type="submit" loading={busy}>{busy ? "Please wait…" : register ? "Request account" : "Sign in"}</Button>
      </form>
      <button className="text-button" onClick={() => onRegisterChange(!register)}>{register ? "Already have an account? Sign in" : "New student? Create an account"}</button>
      {error && <p className={/submitted for administrator approval|account created/i.test(error) ? "success auth-feedback" : "error auth-feedback"} role="status">{error}</p>}
      {busy && <div className="auth-connecting" role="status" aria-live="polite">
        <div className="auth-orbit"><span /><i /><b /></div>
        <strong>{register ? "Creating your account request" : "Connecting securely"}</strong>
        <p>{register ? "Submitting your registration for review…" : "Verifying your credentials and preparing your workspace…"}</p>
        <div className="auth-connecting-track"><span /></div>
        <small>Please keep this page open</small>
      </div>}
    </section></main>
  );
}
