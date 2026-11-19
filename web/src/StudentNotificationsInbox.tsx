import type { StudentNotification, StudentNotificationPreferences } from "./useStudentCommunications";

interface StudentNotificationsInboxProps {
  items: StudentNotification[];
  onRefresh: () => void;
  onRead: (id: string) => void;
  onMarkAllRead: () => void;
  preferences: StudentNotificationPreferences;
  onPreferenceChange: (patch: Partial<StudentNotificationPreferences>) => void;
  onOpen: (id: string) => void;
}

export default function StudentNotificationsInbox({
  items,
  onRefresh,
  onRead,
  onMarkAllRead,
  preferences,
  onPreferenceChange,
  onOpen,
}: StudentNotificationsInboxProps) {
  return (
    <section className="student-notifications-page" aria-labelledby="student-notifications-heading">
      <div className="page-heading">
        <div>
          <p className="eyebrow">STUDENT COMMUNICATION</p>
          <h1 id="student-notifications-heading">Notification inbox</h1>
          <p className="muted">New exam assignments, graded results and submissions awaiting review.</p>
        </div>
        <div className="row">
          <button className="ghost" onClick={onRefresh}>Refresh</button>
          {items.some((item) => !item.readAt) ? <button className="ghost" onClick={onMarkAllRead}>Mark all as read</button> : null}
        </div>
      </div>
      <article className="panel notification-preferences" aria-labelledby="notification-preferences-heading">
        <h2 id="notification-preferences-heading">Notification preferences</h2>
        <p className="muted">Choose which exam updates appear in your inbox.</p>
        <label><input type="checkbox" checked={preferences.examAssignments} onChange={(event) => onPreferenceChange({ examAssignments: event.target.checked })} /> Exam assignments</label>
        <label><input type="checkbox" checked={preferences.examResults} onChange={(event) => onPreferenceChange({ examResults: event.target.checked })} /> Exam results</label>
      </article>
      <div aria-live="polite" aria-relevant="additions text">
        {items.length === 0 ? (
          <div className="panel empty-state">
            <h2>No notifications yet</h2>
            <p className="muted">New assignments and exam results will appear here.</p>
          </div>
        ) : items.map((item) => (
          <article className="panel notification-row" key={item.id}>
            <div className="announcement-meta">
              <span className={item.readAt ? "status status-used" : "status status-pending"}>{item.readAt ? "READ" : "UNREAD"}</span>
              <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>
            </div>
            <h2>{item.title}</h2>
            <p>{item.message}</p>
            <div className="row">
              <button className="ghost" onClick={() => onOpen(item.id)}>Open</button>
              {!item.readAt ? <button className="ghost" onClick={() => onRead(item.id)}>Mark as read</button> : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
