export interface StudentNotificationNotice {
  id: string;
  title: string;
  message: string;
  href: string;
}

interface StudentNotificationBannerProps {
  notification: StudentNotificationNotice;
  onRead: (id: string) => void;
  onOpen: (notification: StudentNotificationNotice) => void;
}

export default function StudentNotificationBanner({
  notification,
  onRead,
  onOpen,
}: StudentNotificationBannerProps) {
  return (
    <section className="panel student-notification-banner" role="status" aria-label="New notification">
      <div>
        <p className="eyebrow">NEW STUDENT UPDATE</p>
        <h2>{notification.title}</h2>
        <p>{notification.message}</p>
      </div>
      <div className="row">
        <button className="button button-secondary button-small" onClick={() => onOpen(notification)}>Open</button>
        <button className="button button-primary button-small" onClick={() => onRead(notification.id)}>
          Mark as read
        </button>
      </div>
    </section>
  );
}
