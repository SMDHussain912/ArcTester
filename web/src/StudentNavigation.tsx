import type { Dispatch, SetStateAction } from "react";
import FeedbackSettings from "./components/FeedbackSettings";
import ArcTesterMascot from "./components/ArcTesterMascot";

export type StudentPage =
  | "dashboard"
  | "path"
  | "lessons"
  | "learning-summary"
  | "practice"
  | "ai-practice"
  | "history"
  | "assignments"
  | "question-bank"
  | "announcements"
  | "notifications"
  | "account"
  | "settings"
  | "progress"
  | "rewards"
  | "analytics"
  | "learning"
  | "mastery"
  | "materials"
  | "coming-soon";

interface StudentNavigationProps {
  activePage: StudentPage;
  setActivePage: Dispatch<SetStateAction<StudentPage>>;
  unreadAnnouncementCount: number;
  unreadNotificationCount: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  email: string;
  busy: boolean;
  onSignOut: () => void;
}

const NAV_ITEMS: { page: StudentPage; label: string; icon: string; group: "LEARN" | "ACCOUNT" }[] = [
  { page: "dashboard", label: "Dashboard", icon: "⌂", group: "LEARN" },
  { page: "progress", label: "Progress", icon: "↗", group: "LEARN" },
  { page: "analytics", label: "Study analytics", icon: "▥", group: "LEARN" },
  { page: "mastery", label: "Topic mastery", icon: "◎", group: "LEARN" },
  { page: "practice", label: "Practice", icon: "✎", group: "LEARN" },
  { page: "ai-practice", label: "AI Practice & MCP", icon: "✧", group: "LEARN" },
  { page: "history", label: "Practice history", icon: "◷", group: "LEARN" },
  { page: "assignments", label: "Assigned exams", icon: "▣", group: "LEARN" },
  { page: "question-bank", label: "Question bank", icon: "▦", group: "LEARN" },
  { page: "coming-soon", label: "Coming Soon", icon: "✦", group: "LEARN" },
  { page: "announcements", label: "Announcements", icon: "◉", group: "ACCOUNT" },
  { page: "notifications", label: "Notifications", icon: "♢", group: "ACCOUNT" },
  { page: "account", label: "Account", icon: "◉", group: "ACCOUNT" },
  { page: "settings", label: "Settings", icon: "⚙", group: "ACCOUNT" },
];

export default function StudentNavigation({
  activePage,
  setActivePage,
  unreadAnnouncementCount,
  unreadNotificationCount,
  theme,
  onToggleTheme,
  email,
  busy,
  onSignOut,
}: StudentNavigationProps) {
  const activeLabel = NAV_ITEMS.find(({ page }) => page === activePage)?.label ?? "Coming Soon";

  return (
    <>
      <aside className="student-sidebar" aria-label="Student workspace">
        <button
          type="button"
          className="student-brand brand-home-button"
          onClick={() => setActivePage("dashboard")}
          title="Go to student dashboard"
          aria-label="ArcTester dashboard"
        >
          <ArcTesterMascot variant="mark" size={36} decorative className="student-brand-mark" />
          <span className="student-brand-copy"><b>ArcTester</b><small>STUDENT WORKSPACE</small></span>
        </button>

        <div className="student-sidebar-navigation">
          <p className="student-nav-label">LEARN</p>
          <nav aria-label="Student navigation">
            {NAV_ITEMS.filter(({ group }) => group === "LEARN").map(({ page, label, icon }) => {
              return (
                <button
                  key={page}
                  type="button"
                  className={activePage === page ? "student-nav-item active" : "student-nav-item"}
                  aria-current={activePage === page ? "page" : undefined}
                  aria-label={label}
                  onClick={() => setActivePage(page)}
                >
                  <span className="student-nav-icon" aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </nav>
          <p className="student-nav-label student-nav-label-secondary">ACCOUNT</p>
          <nav aria-label="Student updates">
            {NAV_ITEMS.filter(({ group }) => group === "ACCOUNT").map(({ page, label, icon }) => {
              const count = page === "announcements" ? unreadAnnouncementCount : unreadNotificationCount;
              return (
                <button
                  key={page}
                  type="button"
                  className={activePage === page ? "student-nav-item active" : "student-nav-item"}
                  aria-current={activePage === page ? "page" : undefined}
                  aria-label={count > 0 ? `${label} (${count})` : label}
                  onClick={() => setActivePage(page)}
                >
                  <span className="student-nav-icon" aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                  {count > 0 ? <small aria-hidden="true">{count}</small> : null}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="student-sidebar-footer">
          <span className="student-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span>
          <span className="student-account-copy"><b>Student account</b><small>Signed in</small></span>
        </div>
      </aside>

      <header className="student-topbar">
        <div className="student-breadcrumb"><span>ArcTester /</span><strong>{activeLabel}</strong></div>
        <div className="student-top-actions">
          <button type="button" className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme">
            {theme === "light" ? "☾" : "☀"}
          </button>
          <FeedbackSettings />
          <span className="user-email">{email}</span>
          <button type="button" className="ghost" disabled={busy} onClick={onSignOut}>Sign out</button>
        </div>
      </header>
    </>
  );
}
