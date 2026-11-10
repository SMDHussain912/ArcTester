import type { Dispatch, SetStateAction } from "react";

export type StudentPage =
  | "dashboard"
  | "practice"
  | "question-bank"
  | "announcements"
  | "notifications"
  | "assigned-exams"
  | "progress";

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

const NAV_ITEMS: { page: StudentPage; label: string }[] = [
  { page: "dashboard", label: "Dashboard" },
  { page: "practice", label: "Practice" },
  { page: "assigned-exams", label: "Assigned exams" },
  { page: "question-bank", label: "Question bank" },
  { page: "announcements", label: "Announcements" },
  { page: "notifications", label: "Notifications" },
  { page: "progress", label: "Progress" },
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
  return (
    <header className="topbar">
      <a className="brand" href="#dashboard">
        <span className="brand-mark">A</span>
        <span>ArcTester</span>
      </a>
      <nav aria-label="Student navigation">
        {NAV_ITEMS.map(({ page, label }) => {
          const count =
            page === "assigned-exams"
              ? pendingExamCount
              : page === "announcements"
                ? unreadAnnouncementCount
                : page === "notifications"
                  ? unreadNotificationCount
                  : 0;

          return (
            <button
              key={page}
              type="button"
              disabled={examActive}
              title={examActive ? "Navigation is locked while an assigned exam is active" : undefined}
              className={activePage === page ? "nav-active" : "nav-button"}
              aria-current={activePage === page ? "page" : undefined}
              onClick={() => setActivePage(page)}
            >
              {label}{count > 0 ? ` (${count})` : ""}
            </button>
          );
        })}
      </nav>
      <div className="top-actions">
        <button
          type="button"
          className="icon-button"
          onClick={onToggleTheme}
          aria-label="Toggle theme"
        >
          {theme === "light" ? "☾" : "☀"}
        </button>
        <span className="user-email">{email}</span>
        <button type="button" className="ghost" disabled={busy} onClick={onSignOut}>
          Sign out
        </button>
      </div>
    </header>
  );
}
