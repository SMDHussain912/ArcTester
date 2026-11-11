"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type StudentNotification } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function NotificationsPage() {
  const { status, user } = useSession();
  const [items, setItems] = useState<StudentNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await api.notifications();
    setItems(result.notifications);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "STUDENT") {
      load().catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Could not load notifications."))
        .finally(() => setLoading(false));
    } else if (status !== "loading") setLoading(false);
  }, [status, user?.role, load]);

  async function markRead(id: string) {
    setSavingId(id);
    setError("");
    try {
      const result = await api.readNotification(id);
      setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: result.readAt } : item));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not update this notification.");
    } finally {
      setSavingId(null);
    }
  }

  if (status === "loading") return <p className="mute">Checking your account…</p>;
  if (status !== "authenticated") return <section className="panel"><h1>Notifications</h1><p>Sign in to view your notifications.</p><Link className="button button-primary" href="/login">Sign in</Link></section>;
  if (user?.role !== "STUDENT") return <section className="panel"><h1>Notifications</h1><p className="muted">Student notifications appear in student accounts.</p><Link className="button button-secondary" href="/">Back to dashboard</Link></section>;

  return (
    <div className="stack">
      <section className="page-intro">
        <p className="eyebrow">Student updates</p>
        <h1>Notification inbox</h1>
        <p className="muted">New assignments, graded results and submissions awaiting review.</p>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="panel stack">
        <div className="panel-header">
          <h2>Recent notifications</h2>
          <button className="button button-secondary button-small" disabled={loading} onClick={() => { setLoading(true); setError(""); load().catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Refresh failed.")).finally(() => setLoading(false)); }}>Refresh</button>
        </div>
        {loading ? <p className="mute">Loading notifications…</p> : null}
        {!loading && !error && items.length === 0 ? <p className="muted">You have no notifications right now.</p> : null}
        {items.map((item) => (
          <article className="card stack" key={item.id} aria-label={item.title}>
            <div className="panel-header">
              <h3>{item.title}</h3>
              <span className="pill">{item.readAt ? "Read" : "Unread"}</span>
            </div>
            <p>{item.message}</p>
            <p className="mute">Received {new Date(item.createdAt).toLocaleString()}</p>
            <div className="row">
              <Link className="button button-secondary button-small" href={item.href}>Open</Link>
              {!item.readAt ? <button className="button button-primary button-small" disabled={savingId === item.id} onClick={() => void markRead(item.id)}>{savingId === item.id ? "Saving…" : "Mark as read"}</button> : null}
            </div>
          </article>
        ))}
      </section>
      <div className="row"><Link className="button button-secondary" href="/">Back to dashboard</Link></div>
    </div>
  );
}
