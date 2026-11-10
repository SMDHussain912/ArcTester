"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ApiError, type Announcement } from "../../lib/api";
import { useSession } from "../../lib/session";

export default function AnnouncementsPage() {
  const { status, user } = useSession();
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const result = await api.announcements();
    setItems(result.announcements);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "STUDENT") {
      load().catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Could not load announcements."))
        .finally(() => setLoading(false));
    } else if (status !== "loading") setLoading(false);
  }, [status, user?.role, load]);

  async function acknowledge(id: string) {
    setError("");
    try {
      const result = await api.acknowledgeAnnouncement(id);
      setItems((current) => current.map((item) => item.id === id
        ? { ...item, seenAt: result.seenAt, acknowledgedAt: result.acknowledgedAt }
        : item));
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not acknowledge this announcement.");
    }
  }

  if (status === "loading") return <p className="mute">Checking your account…</p>;
  if (status !== "authenticated") return <section className="panel"><h1>Announcements</h1><p>Sign in to view announcements from your administrator.</p><Link className="button button-primary" href="/login">Sign in</Link></section>;
  if (user?.role !== "STUDENT") return <section className="panel"><h1>Student announcements</h1><p className="muted">This page is for student accounts.</p><Link className="button button-secondary" href="/admin/announcements">Manage announcements</Link></section>;

  return (
    <div>
      <section className="page-intro">
        <p className="eyebrow">Student updates</p>
        <h1>Announcements</h1>
        <p className="muted">Important notices and updates published by your ArcTester administrator.</p>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <section className="panel">
        <div className="panel-header">
          <h2>Latest notices</h2>
          <button className="button button-secondary button-small" disabled={loading} onClick={() => { setLoading(true); setError(""); load().catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Refresh failed.")).finally(() => setLoading(false)); }}>Refresh</button>
        </div>
        {loading ? <p className="mute">Loading announcements…</p> : null}
        {!loading && !error && items.length === 0 ? <p className="muted">No announcements right now. New notices from your administrator will appear here.</p> : null}
        {items.map((item) => <article className="card" key={item.id}>
          <h3>{item.title}</h3>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p>
          <p className="mute">Published {new Date(item.publishedAt).toLocaleString()}{item.expiresAt ? " · Expires " + new Date(item.expiresAt).toLocaleString() : ""}</p>
          {item.acknowledgedAt ? (
            <p className="mute" role="status">Acknowledged {new Date(item.acknowledgedAt).toLocaleString()}</p>
          ) : (
            <button className="button button-primary button-small" onClick={() => void acknowledge(item.id)}>Acknowledge</button>
          )}
        </article>)}
      </section>
      <div className="row" style={{ marginTop: 16 }}><Link className="button button-secondary" href="/">Back to dashboard</Link></div>
    </div>
  );
}
