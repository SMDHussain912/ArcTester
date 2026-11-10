"use client";

import Link from "next/link";
import { useSession } from "../lib/session";

export default function HomePage() {
  const { status, user } = useSession();

  if (status === "loading") return <p className="mute">Loading your workspace…</p>;

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

  return (
    <>
      <section className="page-intro">
        <p className="eyebrow">Student workspace</p>
        <h1>{user ? "Ready for your next practice session?" : "Prepare for AP ECET with purpose."}</h1>
        <p className="muted">Choose a paper, read the instructions, and start when you're ready. Your progress stays connected to your account.</p>
      </section>
      {!user ? (
        <section className="panel">
          <h2>Sign in to continue</h2>
          <p className="muted">Sign in to access practice papers, assigned exams and saved results.</p>
          <Link className="button button-primary" href="/login">Sign in</Link>
        </section>
      ) : (
        <div className="dashboard-grid">
          <section className="panel stack">
            <div className="panel-header"><h2>Examination and practice</h2><span className="pill pill-accent">Student</span></div>
            <p className="muted">Start with a practice paper or open an exam assigned by your administrator.</p>
            <Link className="button button-primary" href="/practice">Browse practice papers →</Link>
            <Link className="button button-secondary" href="/assignments">My assigned exams</Link>
            <Link className="button button-secondary" href="/analytics">Performance and analytics</Link>
            <Link className="button button-secondary" href="/announcements">Announcements</Link>
            <Link className="button button-secondary" href="/notifications">Notification inbox</Link>
            <Link className="button button-secondary" href="/materials">Study materials</Link>
          </section>
          <aside className="panel stack">
            <h2>Before you start an exam</h2>
            <ul>
              <li>Check the paper duration and question count.</li>
              <li>Read all instructions before starting.</li>
              <li>Keep your device charged and network stable.</li>
              <li>Submit before the timer reaches zero.</li>
            </ul>
            <Link href="/announcements" className="button button-quiet">View announcements</Link>
          </aside>
        </div>
      )}
    </>
  );
}
