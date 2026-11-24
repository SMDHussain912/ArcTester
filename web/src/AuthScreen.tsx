import type { FormEvent } from "react";
import { Button } from "./components/ui";
type AuthScreenProps = {
  email: string; password: string; register: boolean; busy: boolean; error: string;
  onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onRegisterChange: (value: boolean) => void; onAuthenticate: () => void;
};
export default function AuthScreen({ email, password, register, busy, error, onEmailChange, onPasswordChange, onRegisterChange, onAuthenticate }: AuthScreenProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onAuthenticate(); }
  return (
    <main className="auth-shell"><section className="auth-card">
      <a className="brand" href="#dashboard"><span className="brand-mark">A</span><span>ArcTester</span></a>
      <p className="eyebrow">YOUR PERSONAL PRACTICE SPACE</p>
      <h1>{register ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">{register ? "Register with your email. An administrator will review your account before you can access student features." : "Sign in to continue your preparation."}</p>
      <form onSubmit={handleSubmit}>
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
