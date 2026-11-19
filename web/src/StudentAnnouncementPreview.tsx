interface StudentAnnouncementPreviewProps {
  announcement: { title: string; message: string; publishedAt: string };
  announcementCount: number;
  onViewAll: () => void;
}

export default function StudentAnnouncementPreview({
  announcement,
  announcementCount,
  onViewAll,
}: StudentAnnouncementPreviewProps) {
  return (
    <section className="panel student-notice-preview">
      <div className="section-head">
        <div>
          <p className="eyebrow">IMPORTANT UPDATES</p>
          <h2>Latest announcement</h2>
        </div>
        <button className="ghost" onClick={onViewAll}>View all ({announcementCount}) →</button>
      </div>
      <strong>{announcement.title}</strong>
      <p>{announcement.message}</p>
      <small className="muted">{new Date(announcement.publishedAt).toLocaleString()}</small>
    </section>
  );
}
