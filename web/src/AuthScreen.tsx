import { useEffect, useRef, useState, type FormEvent } from "react";
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
  onRegisterChange: (value: boolean) => void; onAuthenticate: (captchaToken?: string) => void;
};

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY?.trim() ?? "";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: {
        sitekey: string;
        callback: (token: string) => void;
        "expired-callback"?: () => void;
        "error-callback"?: () => void;
      }) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function AuthScreen({ email, password, register, busy, error, academicProfile, onAcademicChange, onEmailChange, onPasswordChange, onRegisterChange, onAuthenticate }: AuthScreenProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaError, setCaptchaError] = useState("");
  const captchaContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!register || !TURNSTILE_SITE_KEY || !captchaContainerRef.current) return;
    let widgetId: string | undefined;
    let cancelled = false;
    const renderWidget = () => {
      if (cancelled || !window.turnstile || !captchaContainerRef.current) return;
      widgetId = window.turnstile.render(captchaContainerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => { setCaptchaToken(token); setCaptchaError(""); },
        "expired-callback": () => setCaptchaToken(""),
        "error-callback": () => { setCaptchaToken(""); setCaptchaError("The security check failed. Please retry."); },
      });
    };
    let script = document.querySelector<HTMLScriptElement>('script[data-arctester-turnstile="true"]');
    if (window.turnstile) {
      renderWidget();
    } else {
      if (!script) {
        script = document.createElement("script");
        script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
        script.async = true;
        script.defer = true;
        script.dataset.arctesterTurnstile = "true";
        document.head.appendChild(script);
      }
      script.addEventListener("load", renderWidget);
    }
    return () => {
      cancelled = true;
      script?.removeEventListener("load", renderWidget);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [register]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (register && (!TURNSTILE_SITE_KEY || !captchaToken)) {
      setCaptchaError(!TURNSTILE_SITE_KEY ? "CAPTCHA is not configured yet. Registration is temporarily unavailable." : "Complete the security check before requesting an account.");
      return;
    }
    onAuthenticate(register ? captchaToken : undefined);
  }

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

  function toggleRegister() {
    setCaptchaToken("");
    setCaptchaError("");
    setPasswordVisible(false);
    onRegisterChange(!register);
  }

  return (
    <main className="auth-shell"><section className="auth-card">
      <a className="brand" href="#dashboard"><span className="brand-mark">A</span><span>ArcTester</span></a>
      <p className="eyebrow">{register ? "YOUR COLLEGE. YOUR BRANCH. YOUR PREPARATION." : "YOUR PERSONAL PRACTICE SPACE"}</p>
      <h1>{register ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">{register ? "Join ArcTester with your institute and diploma branch. An administrator will review your account before student access." : "Sign in to continue your preparation."}</p>
      <form onSubmit={handleSubmit} className={register ? "auth-register-form" : ""}>
        {register ? (
          <div className="auth-register-grid">
            <label>Full name<input autoComplete="name" required minLength={2} maxLength={100} value={academicProfile.fullName} onChange={(event) => onAcademicChange("fullName", event.target.value)} /></label>
            <label>College / Polytechnic<input list="ap-polytechnic-options" autoComplete="organization" required minLength={2} maxLength={180} placeholder="Search or type college" value={academicProfile.collegeName} onChange={(event) => changeAcademic("collegeName", event.target.value)} /></label>
            <datalist id="ap-polytechnic-options">{AP_POLYTECHNIC_COLLEGES.map((college) => <option key={college.code} value={college.name} label={college.code + (college.district ? " · " + college.district : "")} />)}</datalist>
            <p className="auth-field-hint">College not listed? Type its full name.</p>
            <label>College PIN / institute code<input required maxLength={16} inputMode="text" autoComplete="off" placeholder="SBTET code, e.g. 010" value={academicProfile.collegeCode} onChange={(event) => onAcademicChange("collegeCode", event.target.value)} /></label>
            <label>Postal PIN (optional)<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="postal-code" placeholder="6-digit postal PIN" value={academicProfile.postalPin} onChange={(event) => onAcademicChange("postalPin", event.target.value)} /></label>
            <label>Diploma branch<input list="ap-diploma-branch-options" required minLength={2} maxLength={120} placeholder="Search or type branch" value={academicProfile.branchName} onChange={(event) => changeAcademic("branchName", event.target.value)} /></label>
            <label>Branch code (optional)<input maxLength={24} placeholder="Auto-filled if listed" value={academicProfile.branchCode} onChange={(event) => onAcademicChange("branchCode", event.target.value)} /></label>
            <datalist id="ap-diploma-branch-options">{AP_DIPLOMA_BRANCHES.map((branch) => <option key={branch.code} value={branch.name} label={branch.code} />)}</datalist>
            <p className="auth-field-hint">Branch not listed? Enter its official name. The catalog will expand.</p>
            <label className="auth-field-wide">Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} /></label>
            <label className="auth-field-wide">Password
              <span className="auth-password-input-wrap">
                <input type={passwordVisible ? "text" : "password"} autoComplete="new-password" minLength={8} maxLength={128} required value={password} onChange={(event) => onPasswordChange(event.target.value)} />
                <button type="button" className="auth-password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide password" : "Show password"}>{passwordVisible ? "Hide" : "Show"}</button>
              </span>
            </label>
          </div>
        ) : (
          <>
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} /></label>
            <label>Password
              <span className="auth-password-input-wrap">
                <input type={passwordVisible ? "text" : "password"} autoComplete="current-password" minLength={1} required value={password} onChange={(event) => onPasswordChange(event.target.value)} />
                <button type="button" className="auth-password-toggle" onClick={() => setPasswordVisible((visible) => !visible)} aria-label={passwordVisible ? "Hide password" : "Show password"}>{passwordVisible ? "Hide" : "Show"}</button>
              </span>
            </label>
          </>
        )}
        {register ? <div className="auth-captcha auth-field-wide">
          <strong>Security check</strong>
          {TURNSTILE_SITE_KEY ? <div ref={captchaContainerRef} /> : <p className="auth-captcha-unconfigured">CAPTCHA site key is not configured.</p>}
          {captchaError ? <p className="auth-captcha-error" role="alert">{captchaError}</p> : null}
        </div> : null}
        <Button className="auth-submit" fullWidth type="submit" loading={busy} disabled={busy || (register && !TURNSTILE_SITE_KEY)}>{busy ? "Please wait…" : register ? "Request account" : "Sign in"}</Button>
      </form>
      <button className="text-button" onClick={toggleRegister}>{register ? "Already have an account? Sign in" : "New student? Create an account"}</button>
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
