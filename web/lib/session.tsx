"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, isAuthError, type AuthUser } from "./api";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";
export interface SessionValue {
  status: SessionStatus;
  user: AuthUser | null;
  /** Re-read the session from the API (after login/logout or on 403). */
  refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Holds the signed-in account for the whole app. The session itself lives in
 * an httpOnly cookie, so this only mirrors *who* is signed in — the token is
 * never readable from JavaScript.
 */
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  const refresh = useCallback(async () => {
    try {
      const session = await api.me();
      setUser(session.user);
      setStatus("authenticated");
    } catch (error) {
      // 403 just means "nobody is signed in" — that is not a failure worth
      // showing. Any other error is also treated as signed out so the UI
      // never gets stuck behind a spinner.
      if (!isAuthError(error)) {
        console.warn("Could not read the session.", error);
      }
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      await api.login(email, password);
      await refresh();
    },
    [refresh]
  );

  const signOut = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  const value = useMemo<SessionValue>(
    () => ({ status, user, refresh, signIn, signOut }),
    [status, user, refresh, signIn, signOut]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Read the session. Must be used inside a `<SessionProvider>`. */
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a SessionProvider.");
  return value;
}

/**
 * Gate for pages that need a signed-in account (the test engine, results and
 * analytics). While the session is still being read it shows a neutral
 * placeholder instead of flashing the sign-in prompt at a signed-in user.
 */
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status } = useSession();

  if (status === "loading") {
    return <p className="mute">Checking your session…</p>;
  }

  if (status === "unauthenticated") {
    return (
      <div className="card">
        <h2>Sign in to continue</h2>
        <p className="mute">
          Your attempts, statistics and progress are saved to your account. The question bank is
          shared by everyone.
        </p>
        <a href="/login">
          <button>Sign in</button>
        </a>
      </div>
    );
  }

  return <>{children}</>;
}