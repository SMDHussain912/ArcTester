"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { useSession } from "../../../lib/session";
import { api, ApiError, type AdminQuestion } from "../../../lib/api";

const blank = { subject: "Mathematics", topic: "General", text: "", options: ["", "", "", ""], correctIndex: 0, explanation: "", difficulty: "medium" };

export default function QuestionBankPage() {
  const { status, user } = useSession();
  const [questions, setQuestions] = useState<AdminQuestion[]>([]);
  const [form, setForm] = useState(blank);
  const [subject, setSubject] = useState("All subjects");
  const [difficulty, setDifficulty] = useState("All difficulties");
  const [search, setSearch] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [report, setReport] = useState<{ added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } | null>(null);

  const load = useCallback(async () => {
    const data = await api.adminQuestions();
    setQuestions(data.questions);
  }, []);
  useEffect(() => {
    if (status === "authenticated" && user?.role === "ADMIN") load().catch((e: unknown) => setError(e instanceof ApiError ? e.message : "Could not load questions."));
  }, [status, user?.role, load]);

  const subjects = useMemo(() => [...new Set(questions.map(q => q.subject))].sort(), [questions]);
  const counts = useMemo(() => subjects.map(name => ({ name, count: questions.filter(q => q.subject === name).length })), [subjects]);
  const filtered = useMemo(() => questions.filter(q =>
    (subject === "All subjects" || q.subject === subject) &&
    (difficulty === "All difficulties" || (q.difficulty ?? "medium") === difficulty) &&
    [q.text, q.subject, q.topic ?? ""].some(v => v.toLowerCase().includes(search.toLowerCase().trim()))
  ), [questions, subject, difficulty, search]);

  async function addQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      await api.createAdminQuestion({ ...form, source: "admin" });
      setForm(blank); setMessage("Question added to the bank."); await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : "Could not add question."); }
    finally { setBusy(false); }
  }

  async function importFile() {
    if (!file) { setError("Choose a CSV or JSON file first."); return; }
    setBusy(true); setError(""); setMessage(""); setReport(null);
    try {
      const raw = await file.text();
      const result = file.name.toLowerCase().endsWith(".json")
        ? await api.importAdminJson(JSON.parse(raw) as unknown[])
        : await api.importAdminCsv(raw);
      setReport(result.report);
      setMessage("Import processed. Review invalid rows below before uploading a corrected file.");
      await load();
    } catch (e) { setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : "Import failed."); }
    finally { setBusy(false); }
  }

  function downloadTemplate(kind: "csv" | "json") {
    const body = kind === "csv"
      ? "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty\nMathematics,Algebra,What is 2 + 2?,3,4,5,6,1,Basic addition,practice,easy\n"
      : JSON.stringify([["Mathematics","What is 2 + 2?",["3","4","5","6"],1,"Basic addition"]], null, 2);
    const blob = new Blob([body], { type: kind === "csv" ? "text/csv" : "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = kind === "csv" ? "arctester-questions-template.csv" : "arctester-questions-template.json";
    anchor.click(); URL.revokeObjectURL(url);
  }

  if (status === "loading") return <p className="mute">Checking administrator access…</p>;
  if (status !== "authenticated" || user?.role !== "ADMIN") return <section className="panel"><h1>Access restricted</h1><Link href="/login">Sign in as administrator</Link></section>;

  return <div className="admin-question-bank">
    <section className="page-intro">
      <p className="eyebrow">Examiner workspace / content</p><h1>Question bank</h1>
      <p className="muted">Build and maintain a structured repository. Questions are reusable across practice sets and immutable exam snapshots.</p>
      <Link className="button button-secondary" href="/admin">← Back to admin workspace</Link>
    </section>
    {error && <p className="error" role="alert">{error}</p>}
    {message && <p className="warn" role="status">{message}</p>}
    <div className="stat-grid">
      <div className="stat-card"><div className="stat-label">Total questions loaded</div><div className="stat-value">{questions.length}</div></div>
      <div className="stat-card"><div className="stat-label">Subjects</div><div className="stat-value">{subjects.length}</div></div>
      <div className="stat-card"><div className="stat-label">Filtered questions</div><div className="stat-value">{filtered.length}</div></div>
    </div>
    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-header"><div><h2>Bulk upload questions</h2><p className="mute">Import hundreds of questions in one operation. Duplicate question text is skipped.</p></div></div>
      <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
        <button type="button" className="button button-secondary" onClick={() => downloadTemplate("csv")}>Download CSV template</button>
        <button type="button" className="button button-secondary" onClick={() => downloadTemplate("json")}>Download JSON template</button>
      </div>
      <div className="row" style={{ marginTop: 14, alignItems: "end", flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 280px" }}>Choose .CSV or .JSON file<input type="file" accept=".csv,.json,text/csv,application/json" onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
        <button type="button" disabled={busy || !file} onClick={() => void importFile()}>{busy ? "Importing…" : "Upload question file"}</button>
      </div>
      {report && <div className="import-report" style={{ marginTop: 16 }}>
        <strong>Import report · {report.total} rows checked</strong>
        <div className="row" style={{ gap: 18, marginTop: 8, flexWrap: "wrap" }}><span>Added: <b>{report.added}</b></span><span>Duplicates: <b>{report.duplicates}</b></span><span>Invalid: <b>{report.invalid.length}</b></span></div>
        {report.invalid.length > 0 && <div style={{ maxHeight: 180, overflow: "auto", marginTop: 10 }}>{report.invalid.map(item => <p key={item.row} className="mute">Row {item.row}: {item.reason}</p>)}</div>}
      </div>}
      <p className="mute" style={{ marginTop: 12 }}>CSV requires subject, text, optionA–optionD and correctIndex (0–3). Topic, explanation, source and difficulty are optional. JSON uses the tuple format shown in its template.</p>
    </section>

    <section className="panel" style={{ marginTop: 18 }}>
      <h2>Add a question manually</h2>
      <form onSubmit={addQuestion}>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 200px" }}>Subject<input required value={form.subject} onChange={e => setForm(v => ({ ...v, subject: e.target.value }))} placeholder="e.g. Data Structures" /></label>
          <label style={{ flex: "1 1 200px" }}>Topic<input value={form.topic} onChange={e => setForm(v => ({ ...v, topic: e.target.value }))} placeholder="e.g. Trees" /></label>
          <label style={{ flex: "0 1 180px" }}>Difficulty<select value={form.difficulty} onChange={e => setForm(v => ({ ...v, difficulty: e.target.value }))}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
        </div>
        <label>Question text<textarea required rows={3} value={form.text} onChange={e => setForm(v => ({ ...v, text: e.target.value }))} /></label>
        <div className="question-option-grid">{form.options.map((option, index) => <label key={index}>Option {String.fromCharCode(65 + index)}<input required value={option} onChange={e => setForm(v => ({ ...v, options: v.options.map((item, i) => i === index ? e.target.value : item) }))} /></label>)}</div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <label style={{ flex: "0 1 220px" }}>Correct answer<select value={form.correctIndex} onChange={e => setForm(v => ({ ...v, correctIndex: Number(e.target.value) }))}>{form.options.map((_, index) => <option key={index} value={index}>Option {String.fromCharCode(65 + index)}</option>)}</select></label>
          <label style={{ flex: "1 1 240px" }}>Explanation<input value={form.explanation} onChange={e => setForm(v => ({ ...v, explanation: e.target.value }))} /></label>
        </div>
        <button disabled={busy}>{busy ? "Saving…" : "Add question to bank"}</button>
      </form>
    </section>

    <section className="panel" style={{ marginTop: 18 }}>
      <div className="panel-header"><div><h2>Browse by subject</h2><p className="mute">Filter, inspect and verify the available question pool.</p></div><span className="pill">{filtered.length} shown</span></div>
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <input style={{ flex: "2 1 240px" }} aria-label="Search question bank" placeholder="Search text, subject or topic…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={{ flex: "1 1 180px" }} value={subject} onChange={e => setSubject(e.target.value)}><option>All subjects</option>{subjects.map(s => <option key={s}>{s}</option>)}</select>
        <select style={{ flex: "1 1 180px" }} value={difficulty} onChange={e => setDifficulty(e.target.value)}><option>All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select>
      </div>
      <div className="subject-counts">{counts.map(item => <button key={item.name} type="button" className={subject === item.name ? "subject-count active" : "subject-count"} onClick={() => setSubject(subject === item.name ? "All subjects" : item.name)}><span>{item.name}</span><b>{item.count}</b></button>)}</div>
      <div className="question-list">{filtered.map((q, index) => <article className="question-row" key={q.id}><div className="question-row-meta"><b>{q.subject}</b><span>{q.topic || "General"}</span><span>{q.difficulty || "medium"}</span><span>Q{index + 1}</span></div><p>{q.text}</p>{q.options?.length === 4 && <div className="question-preview-options">{q.options.map((option, i) => <span key={i} className={i === (q as AdminQuestion & { correctIndex?: number }).correctIndex ? "correct" : ""}>{String.fromCharCode(65 + i)}. {option}</span>)}</div>}</article>)}
        {filtered.length === 0 && <p className="mute">No questions match these filters.</p>}
      </div>
    </section>
    <style jsx>{`
      .question-option-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:12px; }
      .subject-counts { display:flex; flex-wrap:wrap; gap:8px; margin:16px 0; }
      .subject-count { display:flex; gap:10px; align-items:center; border:1px solid var(--line); background:var(--surface-soft); color:var(--ink); border-radius:9px; padding:7px 10px; font-size:12px; }
      .subject-count.active { border-color:var(--accent); background:var(--accent-soft); }
      .question-row { border-top:1px solid var(--line); padding:14px 0; }
      .question-row p { margin:8px 0; }
      .question-row-meta,.question-preview-options { display:flex; flex-wrap:wrap; gap:10px; color:var(--muted); font-size:12px; }
      .question-row-meta b { color:var(--accent); }
      .question-preview-options span { background:var(--surface-soft); padding:5px 8px; border-radius:6px; }
      .question-preview-options .correct { color:var(--success); outline:1px solid var(--success); }
      @media(max-width:620px) { .question-option-grid { grid-template-columns:1fr; } }
    `}</style>
  </div>;
}
