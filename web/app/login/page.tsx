"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError } from "../../lib/api";
import { useSession } from "../../lib/session";

type Mode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signOut, status } = useSession();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") await api.register(email.trim(), password);
      await signIn(email.trim(), password);
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Could not sign you in.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-layout">
      <section className="auth-aside">
        <span className="brand"><span className="brand-mark">A</span> ArcTester</span>
        <div>
          <p className="eyebrow">Your study workspace</p>
          <h1>Build confidence, one question at a time.</h1>
          <p className="muted">Practice with purpose. Track your attempts. Keep your preparation organised.</p>
        </div>
        <p className="auth-footnote">A simpler way to prepare.</p>
      </section>

      <section className="auth-main">
        <div className="auth-card">
          <p className="eyebrow">{mode === "login" ? "Welcome back" : "Get started"}</p>
          <h1>{mode === "login" ? "Sign in" : "Create your account"}</h1>
          <p className="muted">Your attempts and progress are saved to your account. The question bank is shared.</p>

          {error ? <p className="error" role="alert">{error}</p> : null}

          <form onSubmit={submit}>
            <fieldset className="auth-mode">
              <legend className="mute">Account</legend>
              <div className="auth-tabs">
                <label className={mode === "login" ? "sel" : ""}>
                  <input type="radio" name="account-mode" value="login" checked={mode === "login"} onChange={() => setMode("login")} />
                  <span>Sign in</span>
                </label>
                <label className={mode === "register" ? "sel" : ""}>
                  <input type="radio" name="account-mode" value="register" checked={mode === "register"} onChange={() => setMode("register")} />
                  <span>Create an account</span>
                </label>
              </div>
            </fieldset>

            <label className="auth-field">
              <span>Email</span>
              <input type="email" name="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </label>

            <label className="auth-field">
              <span>Password</span>
              <input type="password" name="password" autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={mode === "register" ? 8 : 1} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" />
            </label>

            {mode === "register" ? <p className="muted">Use at least 8 characters. You can use this account to keep your progress together.</p> : null}

            <button className="button button-primary auth-submit" type="submit" disabled={busy || status === "loading"}>
              {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          {status === "authenticated" ? (
            <div className="auth-signed-in">
              <p>You are already signed in.</p>
              <button className="button button-secondary" onClick={() => { void signOut(); router.push("/"); }}>Sign out</button>
            </div>
          ) : null}
          <p className="auth-back"><a href="/">← Back to dashboard</a></p>
        </div>
      </section>
    </div>
  );
}
