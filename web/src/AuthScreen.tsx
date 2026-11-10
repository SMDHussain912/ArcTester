import type { FormEvent } from "react";
type AuthScreenProps = {
  email: string; password: string; invitationToken: string; register: boolean; busy: boolean; error: string;
  onEmailChange: (value: string) => void; onPasswordChange: (value: string) => void;
  onInvitationTokenChange: (value: string) => void; onRegisterChange: (value: boolean) => void; onAuthenticate: () => void;
};
export default function AuthScreen({ email, password, invitationToken, register, busy, error, onEmailChange, onPasswordChange, onInvitationTokenChange, onRegisterChange, onAuthenticate }: AuthScreenProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); onAuthenticate(); }
  return (
    <main className="auth-shell"><section className="auth-card">
      <a className="brand" href="#dashboard"><span className="brand-mark">A</span><span>ArcTester</span></a>
      <p className="eyebrow">YOUR PERSONAL PRACTICE SPACE</p>
      <h1>{register ? "Create your account" : "Welcome back"}</h1>
      <p className="muted">Sign in to continue your preparation.</p>
      <form onSubmit={handleSubmit}>
        <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => onEmailChange(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : 1} required value={password} onChange={(event) => onPasswordChange(event.target.value)} /></label>
        {register && <label>Invitation code<input type="text" autoComplete="one-time-code" required value={invitationToken} onChange={(event) => onInvitationTokenChange(event.target.value)} /></label>}
        <button className="primary full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
      </form>
      <button className="text-button" onClick={() => onRegisterChange(!register)}>{register ? "Already have an account? Sign in" : "Have an invitation? Create account"}</button>
      {error && <p className="error">{error}</p>}
    </section></main>
  );
}
