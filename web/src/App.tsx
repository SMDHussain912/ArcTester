import { useEffect, useState } from "react";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
type User = { id: number; email: string };
type Bank = { total: number; subjects: { subject: string; count: number }[] };
type Question = { id: number; subject: string; topic: string | null; text: string; options: string[] };
type Test = { attemptId: number; mode: string; deadline: string | null; questions: Question[]; warnings: string[] };
type Result = { attemptId: number; score: number; total: number; breakdown: { subject: string; correct: number; total: number }[]; questions: { questionId: number; text: string; options: string[]; selectedIndex: number | null; correctIndex: number; isCorrect: boolean; explanation: string }[] };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request failed.");
  return body as T;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [register, setRegister] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (localStorage.getItem("arctester-theme") as "light" | "dark") || "light",
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("arctester-theme", theme);
  }, [theme]);

  useEffect(() => {
    request<{ user: User }>("/auth/me")
      .then(({ user: current }) => setUser(current))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (user) request<Bank>("/bank").then(setBank).catch((cause) => setError((cause as Error).message));
  }, [user]);

  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      if (register) {
        await request("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, invitationToken: invitationToken.trim() }),
        });
        setRegister(false);
        setInvitationToken("");
      } else {
        const session = await request<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setUser(session.user);
      }
      setPassword("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startTest(mode: "mock" | "practice" | "mistakes", subject?: string) {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const created = await request<Test>("/tests", {
        method: "POST",
        body: JSON.stringify({ mode, subject, count: mode === "mock" ? undefined : 10 }),
      });
      setTest(created);
      setAnswers({});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitTest() {
    if (!test) return;
    setBusy(true);
    try {
      await request(`/tests/${test.attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: test.questions.map((question) => ({
            questionId: question.id,
            selectedIndex: answers[question.id] ?? null,
          })),
        }),
      });
      const fullResult = await request<Result>(`/tests/${test.attemptId}/result`);
      setResult(fullResult);
      setTest(null);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await request("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
    setBank(null);
    setTest(null);
    setResult(null);
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <p className="eyebrow">YOUR PERSONAL PRACTICE SPACE</p>
          <h1>{register ? "Create your account" : "Welcome back"}</h1>
          <p className="muted">Sign in to continue your preparation.</p>
          <form onSubmit={(event) => { event.preventDefault(); void authenticate(); }}>
            <label>Email address<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
            <label>Password<input type="password" autoComplete={register ? "new-password" : "current-password"} minLength={register ? 8 : 1} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {register && <label>Invitation code<input type="text" autoComplete="one-time-code" required value={invitationToken} onChange={(event) => setInvitationToken(event.target.value)} /></label>}
            <button className="primary full" disabled={busy}>{busy ? "Please wait…" : register ? "Create account" : "Sign in"}</button>
          </form>
          <button className="text-button" onClick={() => setRegister(!register)}>{register ? "Already have an account? Sign in" : "Have an invitation? Create account"}</button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav><a href="#dashboard">Dashboard</a><a href="#practice">Practice</a></nav>
        <div className="top-actions">
          <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle theme">{theme === "light" ? "☾" : "☀"}</button>
          <span className="user-email">{user.email}</span>
          <button className="ghost" onClick={signOut}>Sign out</button>
        </div>
      </header>

      <main className="main-content">
        {test ? (
          <section>
            <div className="page-heading"><div><p className="eyebrow">PRACTICE SESSION</p><h1>Stay focused.</h1><p className="muted">{test.questions.length} questions · {Object.keys(answers).length} answered</p></div><button className="ghost" onClick={() => setTest(null)}>Exit session</button></div>
            {test.warnings.map((warning) => <p className="notice" key={warning}>{warning}</p>)}
            <div className="question-list">
              {test.questions.map((question, index) => (
                <article className="panel question-card" key={question.id}>
                  <p className="eyebrow">QUESTION {index + 1} · {question.subject}</p>
                  <h2>{question.text}</h2>
                  <div className="options">
                    {question.options.map((option, optionIndex) => <button key={optionIndex} className={answers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => setAnswers((current) => ({ ...current, [question.id]: optionIndex }))}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}
                  </div>
                </article>
              ))}
            </div>
            <button className="primary" disabled={busy} onClick={() => void submitTest()}>{busy ? "Submitting…" : "Submit answers"}</button>
          </section>
        ) : result ? (
          <section>
            <div className="page-heading"><div><p className="eyebrow">SESSION COMPLETE</p><h1>Your result</h1></div><button className="ghost" onClick={() => setResult(null)}>Back to dashboard</button></div>
            <div className="panel score-panel"><strong>{result.score} / {result.total}</strong><span className="muted">Your score</span></div>
            <div className="grid two">{result.breakdown.map((item) => <article className="panel" key={item.subject}><h3>{item.subject}</h3><p>{item.correct} / {item.total} correct</p></article>)}</div>
            <h2 className="section-heading">Answer review</h2>
            {result.questions.map((question, index) => <article className="panel question-card" key={question.questionId}><p className="eyebrow">QUESTION {index + 1}</p><h3>{question.text}</h3><p className={question.isCorrect ? "success" : "error"}>{question.isCorrect ? "Correct" : "Incorrect"}</p><p className="muted">{question.explanation}</p></article>)}
          </section>
        ) : (
          <>
            <section className="welcome panel" id="dashboard">
              <div><p className="eyebrow">YOUR LEARNING DASHBOARD</p><h1>Make every practice count.</h1><p className="muted">Pick a subject or start a mixed session. Your progress is saved to your account.</p></div>
              <div className="welcome-mark">A</div>
            </section>
            <div className="stats-row">
              <article className="panel stat"><span className="muted">Question bank</span><strong>{bank?.total ?? "—"}</strong><span className="muted">Available questions</span></article>
              <article className="panel stat"><span className="muted">Subjects</span><strong>{bank?.subjects.length ?? "—"}</strong><span className="muted">In your question bank</span></article>
            </div>
            <section id="practice">
              <div className="section-head"><div><p className="eyebrow">GET STARTED</p><h2>Choose your practice</h2></div></div>
              <div className="grid three">
                <article className="panel action-card"><span className="action-icon">◈</span><h3>Mock test</h3><p className="muted">Take a full-length exam using the configured test pattern.</p><button className="primary" disabled={busy} onClick={() => void startTest("mock")}>Start mock test</button></article>
                <article className="panel action-card"><span className="action-icon">◎</span><h3>Quick practice</h3><p className="muted">Build a short mixed practice session.</p><button className="primary" disabled={busy} onClick={() => void startTest("practice")}>Start practice</button></article>
                <article className="panel action-card"><span className="action-icon">↻</span><h3>Review mistakes</h3><p className="muted">Revisit questions you have answered incorrectly.</p><button className="primary" disabled={busy} onClick={() => void startTest("mistakes")}>Review mistakes</button></article>
              </div>
            </section>
            <section>
              <div className="section-head"><div><p className="eyebrow">QUESTION BANK</p><h2>Practice by subject</h2></div></div>
              <div className="grid two">{bank?.subjects.map((item) => <button className="panel subject-card" key={item.subject} disabled={busy} onClick={() => void startTest("practice", item.subject)}><span><strong>{item.subject}</strong><small>{item.count} questions</small></span><b>→</b></button>)}</div>
            </section>
            <p className="footnote">Mock test structure currently follows the existing configured AP ECET pattern. Generic exam management is a separate upcoming phase.</p>
          </>
        )}
        {error && <p className="error">{error}</p>}
      </main>
    </div>
  );
}

function Brand() {
  return <a className="brand" href="#dashboard"><span className="brand-mark">A</span><span>ArcTester</span></a>;
}
