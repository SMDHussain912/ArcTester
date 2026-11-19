export interface StudentAnnouncement {
  id: string;
  title: string;
  message: string;
  expiresAt: string | null;
}

interface StudentAnnouncementDialogProps {
  announcement: StudentAnnouncement;
  onAcknowledge: (id: string) => void;
}

export default function StudentAnnouncementDialog({
  announcement,
  onAcknowledge,
}: StudentAnnouncementDialogProps) {
  return (
    <div className="student-announcement-backdrop">
      <section
        className="student-announcement panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="announcement-title"
      >
        <div className="announcement-mark">!</div>
        <p className="eyebrow">IMPORTANT ANNOUNCEMENT</p>
        <h2 id="announcement-title">{announcement.title}</h2>
        <p className="announcement-message">{announcement.message}</p>
        {announcement.expiresAt && (
          <small className="muted">
            Expires {new Date(announcement.expiresAt).toLocaleString()}
          </small>
        )}
        <button
          className="primary full"
          onClick={() => onAcknowledge(announcement.id)}
        >
          Got it
        </button>
        <small className="muted">
          This announcement will not pop up again after you acknowledge it.
        </small>
      </section>
    </div>
  );
}
