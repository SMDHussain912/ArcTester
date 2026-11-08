"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { api, ApiError, type Announcement } from "../../../lib/api";
import { useSession } from "../../../lib/session";

export default function AdminAnnouncementsPage() {
  const { status, user } = useSession();
  const [items, setItems] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const result = await api.adminAnnouncements();
    setItems(result.announcements);
  }, []);

  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") {
      load().catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Could not load announcements."))
        .finally(() => setLoading(false));
    } else if (status !== "loading") setLoading(false);
  }, [status, user?.role, load]);

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(""); setNotice("");
    try {
      await api.createAnnouncement({
        title: title.trim(),
        message: message.trim(),
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      });
      setTitle(""); setMessage(""); setExpiresAt("");
      await load();
      setNotice("Announcement published. It is now available in student accounts.");
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.message : "Could not publish announcement.");
    } finally { setSaving(false); }
  }

  if (status === "loading") return <p className="mute">Checking administrator access…</p>;
  if (status !== "authenticated") return <section className="panel"><h1>Announcements</h1><p>Sign in to continue.</p><Link className="button button-primary" href="/login">Sign in</Link></section>;
  if (user?.role !== "ADMIN") return <section className="panel"><h1>Access restricted</h1><p className="muted">Administrator access is required.</p><Link className="button button-secondary" href="/">Back to dashboard</Link></section>;

  return (
    <div className="stack">
      <section className="page-intro">
        <p className="eyebrow">Administrator tools</p>
        <h1>Announcements</h1>
        <p className="muted">Publish notices for every student account. Published announcements appear in the student Announcements page.</p>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {notice ? <p className="warn" role="status">{notice}</p> : null}
      <section className="panel">
        <h2>Publish a notice</h2>
        <form onSubmit={publish}>
          <label className="auth-field">Title<input required minLength={2} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. ECET mock test schedule" /></label>
          <label className="auth-field">Message<textarea required maxLength={4000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Write the announcement for students…" /></label>
          <label className="auth-field">Expiry (optional)<input type="datetime-local" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label>
          <button disabled={saving || title.trim().length < 2 || !message.trim()}>{saving ? "Publishing…" : "Publish announcement"}</button>
        </form>
      </section>
      <section className="panel">
        <div className="panel-header"><h2>Published announcements</h2><button className="button button-secondary button-small" disabled={loading} onClick={() => { setLoading(true); load().catch((cause: unknown) => setError(cause instanceof ApiError ? cause.message : "Refresh failed.")).finally(() => setLoading(false)); }}>Refresh</button></div>
        {loading ? <p className="mute">Loading announcements…</p> : null}
        {!loading && items.length === 0 ? <p className="mute">No announcements have been published yet.</p> : null}
        {items.map((item) => <article className="card" key={item.id}>
          <div className="row" style={{ justifyContent: "space-between" }}><h3>{item.title}</h3><span className="pill">PUBLISHED</span></div>
          <p style={{ whiteSpace: "pre-wrap" }}>{item.message}</p>
          <p className="mute">Published {new Date(item.publishedAt).toLocaleString()}{item.expiresAt ? " · Expires " + new Date(item.expiresAt).toLocaleString() : " · No expiry"}</p>
        </article>)}
      </section>
      <div className="row"><Link className="button button-secondary" href="/admin">Back to admin workspace</Link></div>
    </div>
  );
}
