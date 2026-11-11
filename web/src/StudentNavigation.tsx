import type { Dispatch, SetStateAction } from "react";

export type StudentPage =
  | "dashboard"
  | "practice"
  | "question-bank"
  | "announcements"
  | "notifications"
  | "assigned-exams"
  | "progress"
  | "analytics"
  | "learning"
  | "materials";

interface StudentNavigationProps {
  activePage: StudentPage;
  setActivePage: Dispatch<SetStateAction<StudentPage>>;
  examActive: boolean;
  pendingExamCount: number;
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
  { page: "practice", label: "Practice", icon: "✎", group: "LEARN" },
  { page: "assigned-exams", label: "Assigned exams", icon: "▤", group: "LEARN" },
  { page: "question-bank", label: "Question bank", icon: "▦", group: "LEARN" },
  { page: "progress", label: "Progress", icon: "↗", group: "LEARN" },
  { page: "analytics", label: "Analytics", icon: "▩", group: "LEARN" },
  { page: "learning", label: "Concept library", icon: "◎", group: "LEARN" },
  { page: "materials", label: "Study materials", icon: "⇣", group: "LEARN" },
  { page: "announcements", label: "Announcements", icon: "◉", group: "ACCOUNT" },
  { page: "notifications", label: "Notifications", icon: "♢", group: "ACCOUNT" },
];

export default function StudentNavigation({
  activePage,
  setActivePage,
  examActive,
  pendingExamCount,
  unreadAnnouncementCount,
  unreadNotificationCount,
  theme,
  onToggleTheme,
  email,
  busy,
  onSignOut,
}: StudentNavigationProps) {
  const activeLabel = NAV_ITEMS.find(({ page }) => page === activePage)?.label ?? "Dashboard";

  return (
    <>
      <aside className="student-sidebar" aria-label="Student workspace">
        <button
          type="button"
          className="student-brand brand-home-button"
          onClick={() => setActivePage("dashboard")}
          disabled={examActive}
          title={examActive ? "Dashboard navigation is locked while an assigned exam is active" : "Go to student dashboard"}
          aria-label="ArcTester dashboard"
        >
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="student-brand-copy"><b>ArcTester</b><small>STUDENT WORKSPACE</small></span>
        </button>

        <div className="student-sidebar-navigation">
          <p className="student-nav-label">LEARN</p>
          <nav aria-label="Student navigation">
            {NAV_ITEMS.filter(({ group }) => group === "LEARN").map(({ page, label, icon }) => {
              const count = page === "assigned-exams" ? pendingExamCount : 0;
              return (
                <button
                  key={page}
                  type="button"
                  disabled={examActive}
                  title={examActive ? "Navigation is locked while an assigned exam is active" : undefined}
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
          <p className="student-nav-label student-nav-label-secondary">UPDATES</p>
          <nav aria-label="Student updates">
            {NAV_ITEMS.filter(({ group }) => group === "ACCOUNT").map(({ page, label, icon }) => {
              const count = page === "announcements" ? unreadAnnouncementCount : unreadNotificationCount;
              return (
                <button
                  key={page}
                  type="button"
                  disabled={examActive}
                  title={examActive ? "Navigation is locked while an assigned exam is active" : undefined}
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
          <span className="user-email">{email}</span>
          <button type="button" className="ghost" disabled={busy} onClick={onSignOut}>Sign out</button>
        </div>
      </header>
    </>
  );
}
