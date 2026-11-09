"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, isAuthError, type AuthUser } from "./api";

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";
export interface SessionValue {
  status: SessionStatus; user: AuthUser | null; refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>; signOut: () => Promise<void>;
}
const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const refresh = useCallback(async () => {
    try { const session = await api.me(); setUser(session.user); setStatus("authenticated"); }
    catch (error) {
      if (!isAuthError(error)) console.warn("Could not read the session.", error);
      setUser(null); setStatus("unauthenticated");
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  const signIn = useCallback(async (email: string, password: string) => {
    await api.login(email, password); await refresh();
  }, [refresh]);
  const signOut = useCallback(async () => {
    try { await api.logout(); } finally { setUser(null); setStatus("unauthenticated"); }
  }, []);
  const value = useMemo<SessionValue>(() => ({ status, user, refresh, signIn, signOut }),
    [status, user, refresh, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside a <SessionProvider>.");
  return value;
}
export function RequireSession({ children }: { children: React.ReactNode }) {
  const { status } = useSession();
  if (status === "loading") return <p className="mute">Checking your session…</p>;
  if (status === "unauthenticated") return (
    <div className="card"><h2>Sign in to continue</h2>
      <p className="mute">Your attempts, statistics and progress are saved to your account.</p>
      <a href="/login"><button>Sign in</button></a></div>
  );
  return <>{children}</>;
}
