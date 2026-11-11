import type { StudentPage } from "./StudentNavigation";

interface StudentDashboardWelcomeProps {
  visible: boolean;
  onNavigate: (page: StudentPage) => void;
  pendingExamCount?: number;
  unreadAnnouncementCount?: number;
  unreadNotificationCount?: number;
  questionCount?: number;
  subjectCount?: number;
}

export default function StudentDashboardWelcome({
  visible,
  onNavigate,
  pendingExamCount = 0,
  unreadAnnouncementCount = 0,
  unreadNotificationCount = 0,
  questionCount = 0,
  subjectCount = 0,
}: StudentDashboardWelcomeProps) {
  const actions: { page: StudentPage; icon: string; eyebrow: string; title: string; description: string; count: string }[] = [
    { page: "practice", icon: "✦", eyebrow: "LEARNING", title: "Start practice", description: "Build a question paper from your subjects and topics.", count: "Create a test" },
    { page: "assigned-exams", icon: "▣", eyebrow: "EXAM CENTRE", title: "Assigned exams", description: "Check availability, deadlines and pending examinations.", count: `${pendingExamCount} pending` },
    { page: "question-bank", icon: "▤", eyebrow: "STUDY", title: "Question bank", description: "Explore questions across your available subjects.", count: `${questionCount.toLocaleString()} questions · ${subjectCount} subjects` },
    { page: "progress", icon: "↗", eyebrow: "PERFORMANCE", title: "Your progress", description: "Review practice accuracy, exam scores and learning trends.", count: "View analytics" },
    { page: "announcements", icon: "▧", eyebrow: "UPDATES", title: "Announcements", description: "Read important notices and academic updates.", count: `${unreadAnnouncementCount} unread` },
    { page: "notifications", icon: "♧", eyebrow: "UPDATES", title: "Notifications", description: "See assignment, submission and result alerts.", count: `${unreadNotificationCount} unread` },
  ];

  return (
    <div hidden={!visible} className="student-dashboard-home">
      <section className="student-home-hero" id="dashboard" aria-labelledby="student-home-title">
        <div className="student-home-copy">
          <p className="eyebrow">YOUR LEARNING DASHBOARD</p>
          <h1 id="student-home-title">Make every practice count.</h1>
          <p>Build your skills with focused practice, keep track of assigned examinations, and use your progress to decide what to study next.</p>
          <div className="student-home-actions">
            <button type="button" className="primary" onClick={() => onNavigate("practice")}>Start practicing <span aria-hidden="true">→</span></button>
            <button type="button" className="student-home-secondary" onClick={() => onNavigate("assigned-exams")}>View assigned exams</button>
          </div>
        </div>
        <div className="student-home-mark" aria-hidden="true">
          <span>A</span>
          <small>LEARN · PRACTICE · IMPROVE</small>
        </div>
      </section>
      <section className="student-dashboard-actions" aria-labelledby="student-dashboard-actions-title">
        <div className="student-dashboard-section-heading">
          <div><p className="eyebrow">YOUR WORKSPACE</p><h2 id="student-dashboard-actions-title">What would you like to do?</h2></div>
          <p className="muted">Pick up where you left off or jump into another area.</p>
        </div>
        <div className="student-dashboard-action-grid">
          {actions.map((action) => (
            <button type="button" className="student-dashboard-action" key={action.page} onClick={() => onNavigate(action.page)} aria-label={`${action.title}: ${action.count}`}>
              <span className="student-dashboard-action-icon" aria-hidden="true">{action.icon}</span>
              <span className="student-dashboard-action-eyebrow">{action.eyebrow}</span>
              <strong>{action.title}</strong>
              <span className="student-dashboard-action-description">{action.description}</span>
              <span className="student-dashboard-action-count">{action.count}</span>
              <span className="student-dashboard-action-arrow" aria-hidden="true">→</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
