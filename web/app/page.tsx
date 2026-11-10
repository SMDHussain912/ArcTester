"use client";

import Link from "next/link";
import { useSession } from "../lib/session";
import "./student-dashboard.css";

const studentActions = [
  { href: "/practice", icon: "✦", eyebrow: "Practice", title: "Build a practice paper", description: "Choose a full mock, focus on selected subjects, or revise previous mistakes.", action: "Start practicing" },
  { href: "/assignments", icon: "▣", eyebrow: "Examinations", title: "Assigned exams", description: "Check availability windows, deadlines and submitted examination results.", action: "View my exams" },
  { href: "/analytics", icon: "↗", eyebrow: "Progress", title: "Performance insights", description: "Review your practice history, accuracy and subject-wise progress.", action: "View performance" },
  { href: "/learning", icon: "⌘", eyebrow: "Study", title: "Concept library", description: "Study concise explanations, worked examples and common mistakes.", action: "Explore concepts" },
  { href: "/materials", icon: "▤", eyebrow: "Resources", title: "Study materials", description: "Open the learning resources shared for your preparation.", action: "Browse materials" },
  { href: "/announcements", icon: "◉", eyebrow: "Updates", title: "Announcements", description: "Read important notices and updates from your administrators.", action: "Read announcements" },
];

export default function HomePage() {
  const { status, user } = useSession();

  if (status === "loading") return <section className="panel dashboard-loading" role="status">Loading your workspace…</section>;

  if (user?.role === "ADMIN") {
    return (
      <>
        <section className="page-intro">
          <p className="eyebrow">ArcTester administration</p>
          <h1>Examination control room</h1>
          <p className="muted">Create question papers, publish exams, assign students and review submissions.</p>
        </section>
        <div className="dashboard-grid">
          <section className="panel stack">
            <h2>Administration</h2>
            <Link className="button button-primary" href="/admin">Open admin workspace →</Link>
            <Link className="button button-secondary" href="/admin/questions">Manage question bank</Link>
            <Link className="button button-secondary" href="/admin/submissions">Review submissions</Link>
            <Link className="button button-secondary" href="/admin/announcements">Manage announcements</Link>
          </section>
        </div>
      </>
    );
  }

  if (!user) {
    return (
      <>
        <section className="student-hero">
          <p className="eyebrow">Your AP ECET CSE preparation space</p>
          <h1>Prepare with focus. Track your progress.</h1>
          <p className="muted">Practice with configurable papers, complete assigned examinations and build stronger subject knowledge in one place.</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/login">Sign in to your workspace →</Link>
          </div>
        </section>
        <section className="panel student-welcome">
          <h2>Your preparation, organised</h2>
          <p className="muted">Sign in to access your assigned exams, practice papers, study materials and saved results.</p>
        </section>
      </>
    );
  }

  return (
    <div className="student-dashboard">
      <section className="student-hero">
        <div>
          <p className="eyebrow">Student workspace</p>
          <h1>Welcome back.</h1>
          <p className="muted">Your next step towards AP ECET starts here. Pick up your preparation where you need it most.</p>
        </div>
        <div className="hero-actions">
          <Link className="button button-primary" href="/practice">Start a practice paper →</Link>
          <Link className="button button-secondary" href="/assignments">Check assigned exams</Link>
        </div>
      </section>

      <section className="student-section" aria-labelledby="student-tools-title">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Your workspace</p>
            <h2 id="student-tools-title">Learn, practice and improve</h2>
          </div>
          <p>Everything you need, one place.</p>
        </div>
        <div className="student-action-grid">
          {studentActions.map((item) => (
            <Link className="student-action-card" href={item.href} key={item.href}>
              <span className="student-action-icon" aria-hidden="true">{item.icon}</span>
              <span className="eyebrow">{item.eyebrow}</span>
              <span className="student-action-title">{item.title}</span>
              <span className="student-action-description">{item.description}</span>
              <span className="student-action-link">{item.action} <span aria-hidden="true">→</span></span>
            </Link>
          ))}
          <Link className="student-action-card student-notification-card" href="/notifications">
            <span className="student-action-icon" aria-hidden="true">✉</span>
            <span className="eyebrow">Inbox</span>
            <span className="student-action-title">Notifications</span>
            <span className="student-action-description">Check messages and mark updates as read when you have reviewed them.</span>
            <span className="student-action-link">Open notification inbox <span aria-hidden="true">→</span></span>
          </Link>
        </div>
      </section>

      <section className="student-reminder" aria-label="Examination preparation reminder">
        <span className="student-reminder-mark" aria-hidden="true">i</span>
        <div>
          <h2>Before an examination</h2>
          <p>Check the exam instructions, availability window and deadline. Keep your device charged, and make sure your answers are saved before submitting.</p>
        </div>
        <Link href="/assignments">Review exams →</Link>
      </section>
    </div>
  );
}
