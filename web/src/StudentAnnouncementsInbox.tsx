import type { StudentAnnouncement } from "./useStudentCommunications";

interface StudentAnnouncementsInboxProps {
  items: StudentAnnouncement[];
  onRefresh: () => void;
  onAcknowledge: (id: string) => void;
}

export default function StudentAnnouncementsInbox({
  items,
  onRefresh,
  onAcknowledge,
}: StudentAnnouncementsInboxProps) {
  return (
    <section className="student-announcements">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STUDENT COMMUNICATION</p>
          <h1>Announcements</h1>
          <p className="muted">Notices published by your ArcTester administrator.</p>
        </div>
        <button className="ghost" onClick={onRefresh}>Refresh</button>
      </div>
      {items.length === 0 ? (
        <div className="panel empty-state">
          <h2>No announcements yet</h2>
          <p className="muted">New notices from your administrator will appear here automatically.</p>
        </div>
      ) : items.map((item) => (
        <article className="panel announcement-row" key={item.id}>
          <div className="announcement-meta">
            <span className={item.seenAt ? "status status-used" : "status status-pending"}>{item.seenAt ? "SEEN" : "UNREAD"}</span>
            <small>{new Date(item.publishedAt).toLocaleString()}</small>
          </div>
          <h2>{item.title}</h2>
          <p>{item.message}</p>
          {item.expiresAt ? <small className="muted">Expires {new Date(item.expiresAt).toLocaleString()}</small> : null}
          {item.acknowledgedAt
            ? <small className="muted" role="status">Acknowledged {new Date(item.acknowledgedAt).toLocaleString()}</small>
            : <button className="ghost" onClick={() => onAcknowledge(item.id)}>Acknowledge</button>}
        </article>
      ))}
    </section>
  );
}
