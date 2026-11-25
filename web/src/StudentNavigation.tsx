import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import FeedbackSettings from "./components/FeedbackSettings";
import ArcTesterMascot from "./components/ArcTesterMascot";

export type StudentPage =
  | "dashboard" | "path" | "lessons" | "learning-summary" | "practice" | "ai-practice"
  | "history" | "assignments" | "question-bank" | "announcements" | "notifications"
  | "account" | "settings" | "about" | "progress" | "rewards" | "analytics" | "learning"
  | "mastery" | "materials" | "concepts" | "coming-soon";

interface StudentNavigationProps {
  activePage: StudentPage;
  setActivePage: Dispatch<SetStateAction<StudentPage>>;
  unreadNotificationCount: number;
  theme: "light" | "dark";
  onToggleTheme: () => void;
  onOpenNotifications: () => void;
  email: string;
  busy: boolean;
  onSignOut: () => void;
}

type NavItem = { page: StudentPage; label: string; icon: string; group: "HOME" | "EXAMS" | "LEARNING" | "ACCOUNT" };
const NAV_ITEMS: NavItem[] = [
  { page: "dashboard", label: "Dashboard", icon: "⌂", group: "HOME" },
  { page: "practice", label: "Practice exams", icon: "✎", group: "EXAMS" },
  { page: "assignments", label: "Assigned / real exams", icon: "▣", group: "EXAMS" },
  { page: "analytics", label: "Performance analytics", icon: "▥", group: "EXAMS" },
  { page: "history", label: "Practice history", icon: "◷", group: "EXAMS" },
  { page: "question-bank", label: "Question bank", icon: "▦", group: "EXAMS" },
  { page: "concepts", label: "Concept library", icon: "✧", group: "LEARNING" },
  { page: "account", label: "Account", icon: "◉", group: "ACCOUNT" },
  { page: "about", label: "About & contact", icon: "ⓘ", group: "ACCOUNT" },
];

const GROUPS: { id: NavItem["group"]; label: string }[] = [
  { id: "EXAMS", label: "Exams & results" },
  { id: "LEARNING", label: "Learning" },
  { id: "ACCOUNT", label: "Account" },
];
const PRIMARY_MOBILE: StudentPage[] = ["dashboard", "practice", "analytics", "assignments"];
const MOBILE_MORE = NAV_ITEMS.filter(({ page }) => !PRIMARY_MOBILE.includes(page));

export default function StudentNavigation({
  activePage, setActivePage, unreadNotificationCount,
  theme, onToggleTheme, onOpenNotifications, email, busy, onSignOut,
}: StudentNavigationProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeItem = NAV_ITEMS.find(({ page }) => page === activePage);
  const activeLabel = activeItem?.label ?? (activePage === "notifications" ? "Notifications" : "ArcTester");
  const activeGroup = activeItem?.group ?? "HOME";

  useEffect(() => { setMoreOpen(false); }, [activePage]);

  const countFor = (page: StudentPage) => page === "notifications" ? unreadNotificationCount : 0;

  const renderItem = (item: NavItem, mobile = false) => {
    const count = countFor(item.page);
    const classes = "student-nav-item" + (activePage === item.page ? " active" : "") + (mobile ? " student-mobile-more-item" : "");
    return (
      <button
        key={item.page}
        type="button"
        className={classes}
        aria-current={activePage === item.page ? "page" : undefined}
        aria-label={count > 0 ? item.label + " (" + count + ")" : item.label}
        onClick={() => { setActivePage(item.page); setMoreOpen(false); }}
      >
        <span className="student-nav-icon" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
        {count > 0 ? <small aria-hidden="true">{count}</small> : null}
      </button>
    );
  };

  return (
    <>
      <aside className="student-sidebar" aria-label="Student workspace">
        <button type="button" className="student-brand brand-home-button" onClick={() => setActivePage("dashboard")} title="Go to student dashboard" aria-label="ArcTester dashboard">
          <ArcTesterMascot variant="mark" size={36} decorative className="student-brand-mark" />
          <span className="student-brand-copy"><b>ArcTester</b><small>STUDENT WORKSPACE</small></span>
        </button>
        <div className="student-sidebar-navigation">
          <nav aria-label="Student navigation" className="student-nav-groups">
            {renderItem(NAV_ITEMS.find((item) => item.page === "dashboard")!)}
            {GROUPS.map(({ id, label }) => (
              <details key={id} className="student-nav-group" open={activeGroup === id || id === "EXAMS"}>
                <summary><span>{label}</span><span className="student-nav-chevron" aria-hidden="true">⌄</span></summary>
                <div className="student-nav-group-items">
                  {NAV_ITEMS.filter((item) => item.group === id).map((item) => renderItem(item))}
                </div>
              </details>
            ))}
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
          {activePage === "dashboard" ? <button type="button" className="icon-button student-notification-button" onClick={onOpenNotifications} aria-label={unreadNotificationCount > 0 ? `Open notifications, ${unreadNotificationCount} unread` : "Open notifications"} title="Notifications">♢{unreadNotificationCount > 0 ? <small>{unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}</small> : null}</button> : null}
          <button type="button" className="icon-button" onClick={onToggleTheme} aria-label="Toggle theme">{theme === "light" ? "☾" : "☀"}</button>
          <FeedbackSettings />
          <span className="user-email">{email}</span>
          <button type="button" className="ghost" disabled={busy} onClick={onSignOut}>Sign out</button>
        </div>
      </header>

      <nav className="student-mobile-nav" aria-label="Mobile student navigation">
        {PRIMARY_MOBILE.map((page) => {
          const item = NAV_ITEMS.find((entry) => entry.page === page)!;
          return renderItem(item, true);
        })}
        <div className="student-mobile-more-wrap">
          <button type="button" className={"student-mobile-nav-button" + (moreOpen || MOBILE_MORE.some(({ page }) => page === activePage) ? " active" : "")} aria-expanded={moreOpen} aria-controls="student-mobile-more-menu" onClick={() => setMoreOpen((open) => !open)}>
            <span aria-hidden="true">•••</span><small>More</small>
          </button>
          {moreOpen ? (
            <div className="student-mobile-more-menu" id="student-mobile-more-menu" role="menu" aria-label="More student pages">
              <div className="student-mobile-more-heading">More pages</div>
              {MOBILE_MORE.map((item) => (
                <div role="none" key={item.page}>{renderItem(item, true)}</div>
              ))}
              <div className="student-mobile-menu-actions">
                <button type="button" onClick={onToggleTheme}>{theme === "light" ? "Switch to dark mode" : "Switch to light mode"}</button>
                <button type="button" disabled={busy} onClick={onSignOut}>Sign out</button>
              </div>
            </div>
          ) : null}
        </div>
      </nav>
    </>
  );
}
