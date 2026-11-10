import type { FormEvent } from "react";

export type AdminAnnouncement = {
  id: string;
  title: string;
  message: string;
  startsAt: string;
  expiresAt: string | null;
  createdAt: string;
  _count: { views: number };
};

type AdminAnnouncementsProps = {
  announcements: AdminAnnouncement[];
  title: string;
  message: string;
  expiry: string;
  busy: boolean;
  onTitleChange: (value: string) => void;
  onMessageChange: (value: string) => void;
  onExpiryChange: (value: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onRefresh: () => void;
  onDelete: (id: string) => void;
};

export default function AdminAnnouncements({ announcements, title, message, expiry, busy, onTitleChange, onMessageChange, onExpiryChange, onCreate, onRefresh, onDelete }: AdminAnnouncementsProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">STUDENT COMMUNICATION</p><h1>Announcements</h1><p>Publish important notices. Students see each announcement once, and expired notices disappear automatically.</p></div></div>
      <div className="admin-two-col">
        <form className="admin-panel announcement-form" onSubmit={onCreate}>
          <div className="admin-panel-head"><div><p className="eyebrow">NEW NOTICE</p><h2>Compose announcement</h2></div></div>
          <label>Title<input required minLength={2} maxLength={120} value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="e.g. Mock test schedule update" /></label>
          <label>Message<textarea required maxLength={5000} value={message} onChange={(event) => onMessageChange(event.target.value)} placeholder="Write the announcement for students…" /></label>
          <label>Expiry date and time <small>Leave empty for no expiry.</small><input type="datetime-local" value={expiry} onChange={(event) => onExpiryChange(event.target.value)} /></label>
          <button className="primary" disabled={busy}>Publish announcement</button>
        </form>
        <section className="admin-panel">
          <div className="admin-panel-head"><div><p className="eyebrow">NOTICE HISTORY</p><h2>Published notices</h2></div><button className="ghost" onClick={onRefresh}>Refresh</button></div>
          {announcements.length ? announcements.map((announcement) => <article className="announcement-row" key={announcement.id}><div><b>{announcement.title}</b><p>{announcement.message}</p><small>{announcement._count.views} students have seen this · {announcement.expiresAt ? "Expires " + new Date(announcement.expiresAt).toLocaleString() : "No expiry"}</small></div><button className="ghost danger-button" onClick={() => onDelete(announcement.id)}>Delete</button></article>) : <div className="empty-state">No announcements published yet.</div>}
        </section>
      </div>
    </>
  );
}
