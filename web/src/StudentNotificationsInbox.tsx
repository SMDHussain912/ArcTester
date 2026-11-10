import type { StudentNotification } from "./useStudentCommunications";

interface StudentNotificationsInboxProps {
  items: StudentNotification[];
  onRefresh: () => void;
  onRead: (id: string) => void;
  onOpen: (id: string) => void;
}

export default function StudentNotificationsInbox({
  items,
  onRefresh,
  onRead,
  onOpen,
}: StudentNotificationsInboxProps) {
  return (
    <section className="student-notifications-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STUDENT COMMUNICATION</p>
          <h1>Notification inbox</h1>
          <p className="muted">New exam assignments, graded results and submissions awaiting review.</p>
        </div>
        <button className="ghost" onClick={onRefresh}>Refresh</button>
      </div>
      {items.length === 0 ? (
        <div className="panel empty-state">
          <h2>No notifications yet</h2>
          <p className="muted">New assignments and exam results will appear here.</p>
        </div>
      ) : items.map((item) => (
        <article className="panel notification-row" key={item.id}>
          <div className="announcement-meta">
            <span className={item.readAt ? "status status-used" : "status status-pending"}>{item.readAt ? "READ" : "UNREAD"}</span>
            <small>{new Date(item.createdAt).toLocaleString()}</small>
          </div>
          <h2>{item.title}</h2>
          <p>{item.message}</p>
          <div className="row">
            <button className="ghost" onClick={() => onOpen(item.id)}>Open</button>
            {!item.readAt ? <button className="ghost" onClick={() => onRead(item.id)}>Mark as read</button> : null}
          </div>
        </article>
      ))}
    </section>
  );
}
