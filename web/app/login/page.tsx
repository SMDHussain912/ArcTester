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
      if (mode === "register") {
        // Registering does not sign you in, so log straight in afterwards.
        await api.register(email.trim(), password);
      }
      await signIn(email.trim(), password);
      router.push("/");
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e.message : "Could not sign you in.");
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Sign in</h1>
      <p className="mute">
        Your attempts, statistics and progress belong to your account. The question bank is shared.
      </p>

      {error ? <p className="error">{error}</p> : null}

      <div className="card">
        <form onSubmit={submit}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="mute">Account</legend>
            {(
              [
                ["login", "Sign in"],
                ["register", "Create an account"],
              ] as [Mode, string][]
            ).map(([value, label]) => (
              <label key={value} style={{ border: 0, padding: "2px 0" }}>
                <input
                  type="radio"
                  name="mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                />
                <span>{label}</span>
              </label>
            ))}
          </fieldset>

          <label style={{ display: "block" }}>
            <span className="mute">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          <label style={{ display: "block" }}>
            <span className="mute">Password</span>
            <input
              type="password"
              name="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
              minLength={mode === "register" ? 8 : 1}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: "100%" }}
            />
          </label>

          {mode === "register" ? (
            <p className="mute">Use at least 8 characters. Your progress is stored on this device only.</p>
          ) : null}

          <button type="submit" disabled={busy || status === "loading"}>
            {busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>

      {status === "authenticated" ? (
        <div className="card">
          <p>You are already signed in.</p>
          <button
            className="alt"
            onClick={() => {
              void signOut();
              router.push("/");
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </>
  );
}