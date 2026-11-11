"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "./session";
import { ThemeToggle } from "./theme-toggle";

export function SessionBar() {
  const router = useRouter();
  const { status, user, signOut } = useSession();
  async function handleSignOut() { await signOut(); router.push("/login"); }
  return (
    <header className="app-header"><div className="header-inner">
      <Link className="brand" href="/" aria-label="ArcTester home">
        <span className="brand-mark">A</span><span>ArcTester</span>
      </Link>
      <nav className="primary-nav" aria-label="Main navigation">
        <Link href="/" className="nav-link">Dashboard</Link>
        {user?.role === "STUDENT" ? <Link href="/practice" className="nav-link">Practice papers</Link> : null}
        {user?.role === "STUDENT" ? <Link href="/assignments" className="nav-link">My exams</Link> : null}
        {user?.role === "STUDENT" ? <Link href="/analytics" className="nav-link">Performance</Link> : null}
        {user?.role === "STUDENT" ? <Link href="/announcements" className="nav-link">Announcements</Link> : null}
        {user?.role === "STUDENT" ? <Link href="/notifications" className="nav-link">Notifications</Link> : null}
        {user ? <Link href="/materials" className="nav-link">Study materials</Link> : null}
        {user?.role === "ADMIN" ? <Link href="/admin" className="nav-link">Admin workspace</Link> : null}
        {user?.role === "ADMIN" ? <Link href="/admin/questions" className="nav-link">Question bank</Link> : null}
        {user?.role === "ADMIN" ? <Link href="/admin/submissions" className="nav-link">Submission review</Link> : null}
        {user?.role === "ADMIN" ? <Link href="/admin/announcements" className="nav-link">Announcements</Link> : null}
      </nav>
      <div className="header-actions"><ThemeToggle />
        {status === "loading" ? <span className="header-status">Checking session…</span> :
          status === "authenticated" ? <>
            <span className="account-email" title={user?.email}>{user?.email}</span>
            <button className="button button-quiet button-small" onClick={() => void handleSignOut()}>Sign out</button>
          </> : <Link className="button button-primary button-small" href="/login">Sign in</Link>}
      </div>
    </div></header>
  );
}
