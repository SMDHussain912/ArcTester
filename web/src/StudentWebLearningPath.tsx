import { useCallback, useEffect, useMemo, useState } from "react";
import { request } from "./apiClient";

type Topic = { topic: string; count: number; practiceCount?: number };
type Subject = { subject: string; count: number; practiceCount?: number; topics?: Topic[] };
type Bank = { total: number; practiceTotal?: number; subjects: Subject[] };
type Row = { subject: string; topic: string | null; seen: number; correct: number; wrong?: number; incorrect?: number; accuracy: number | null };
type Overview = { practice: { subjects: Row[] } };
type Stat = { seen: number; correct: number; topics: Map<string, { seen: number; correct: number }> };
const pct = (seen: number, total: number) => total > 0 ? Math.min(100, Math.round(seen / total * 100)) : 0;

export default function StudentWebLearningPath({ onPractice }: { onPractice: (subject: string, topic?: string) => void }) {
  const [bank, setBank] = useState<Bank | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [b, overview] = await Promise.all([request<Bank>("/bank"), request<Overview>("/analytics/overview")]);
      setBank(b);
      setRows(Array.isArray(overview.practice?.subjects) ? overview.practice.subjects : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load your learning path.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const stats = useMemo(() => {
    const map = new Map<string, Stat>();
    rows.forEach((row) => {
      const item = map.get(row.subject) ?? { seen: 0, correct: 0, topics: new Map() };
      const seen = Math.max(0, Number(row.seen) || 0), correct = Math.max(0, Number(row.correct) || 0);
      item.seen += seen; item.correct += correct;
      if (row.topic) {
        const topic = item.topics.get(row.topic) ?? { seen: 0, correct: 0 };
        topic.seen += seen; topic.correct += correct; item.topics.set(row.topic, topic);
      }
      map.set(row.subject, item);
    });
    return map;
  }, [rows]);

  const subjects = (bank?.subjects ?? []).filter((s) => (s.practiceCount ?? s.count) > 0);
  const total = subjects.reduce((n, s) => n + (s.practiceCount ?? s.count), 0);
  const explored = subjects.reduce((n, s) => n + Math.min(stats.get(s.subject)?.seen ?? 0, s.practiceCount ?? s.count), 0);
  const next = subjects.find((s) => (stats.get(s.subject)?.seen ?? 0) < (s.practiceCount ?? s.count)) ?? subjects[0];

  return <section className="student-web-path stack" aria-labelledby="web-path-title">
    <div className="page-heading"><div><p className="eyebrow">YOUR STUDY JOURNEY</p><h1 id="web-path-title">Your learning path</h1><p className="muted">Follow subjects, explore topics, and practice one step at a time.</p></div>
      <button className="ghost" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh path"}</button>
    </div>
    {error ? <p className="error" role="alert">{error}</p> : null}
    {loading && !bank ? <section className="panel path-loading" aria-live="polite">Loading your learning path…</section> : null}
    {!loading && bank && subjects.length === 0 ? <section className="panel"><h2>No practice subjects yet</h2><p className="muted">Approved practice questions will appear here when available.</p></section> : null}
    {bank && subjects.length > 0 ? <>
      <section className="panel path-summary">
        <div className="path-summary-top"><div><p className="eyebrow">PATH PROGRESS</p><h2>{explored.toLocaleString()} <span className="muted">/ {total.toLocaleString()} questions explored</span></h2></div><strong className="path-summary-percent">{pct(explored,total)}%</strong></div>
        <div className="path-progress-track" role="progressbar" aria-label="Overall learning path progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(explored,total)}><span style={{width:pct(explored,total)+"%"}} /></div>
        {next ? <div className="path-up-next"><div><p className="eyebrow">UP NEXT</p><h3>{next.subject}</h3><p className="muted">{next.topics?.length ?? 0} topics · {next.practiceCount ?? next.count} questions</p></div><button className="primary" type="button" onClick={() => onPractice(next.subject)}>Start practice</button></div> : null}
      </section>
      <div className="path-subject-heading"><h2>Subjects</h2><span className="muted">{subjects.length} learning paths</span></div>
      <div className="path-subject-list">{subjects.map((subject,index) => {
        const available=subject.practiceCount ?? subject.count, stat=stats.get(subject.subject), seen=Math.min(stat?.seen ?? 0,available), completion=pct(seen,available), open=expanded===subject.subject;
        return <article className="panel path-subject" key={subject.subject}>
          <div className="path-subject-number" aria-hidden="true">{completion===100 ? "✓" : index+1}</div><div className="path-subject-body">
            <div className="path-subject-title-row"><h3>{subject.subject}</h3><strong>{completion}%</strong></div>
            <p className="muted">{subject.topics?.length ?? 0} topics · {available} questions</p>
            <div className="path-progress-track path-subject-track" role="progressbar" aria-label={subject.subject+" progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion}><span style={{width:completion+"%"}} /></div>
            <div className="path-subject-actions"><span className="muted">{seen===0?"Ready to begin":seen>=available?"Reviewed":seen+" explored"}</span>
              <button className="ghost" type="button" aria-expanded={open} onClick={() => setExpanded(open?null:subject.subject)}>{open?"Hide topics":"Explore topics"}</button><button className="primary" type="button" onClick={() => onPractice(subject.subject)}>Practice</button>
            </div>
            {open ? <div className="path-topic-list">{(subject.topics ?? []).map((topic) => {
              const t=stat?.topics.get(topic.topic), count=topic.practiceCount ?? topic.count, tSeen=Math.min(t?.seen ?? 0,count), p=pct(tSeen,count);
              return <div className="path-topic" key={topic.topic}><div><strong>{topic.topic}</strong><small className="muted">{tSeen} / {count} explored</small></div><div className="path-topic-progress" role="progressbar" aria-label={topic.topic+" progress"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={p}><span style={{width:p+"%"}} /></div><button className="text-button" type="button" onClick={() => onPractice(subject.subject,topic.topic)}>Practice topic</button></div>;
            })}{(subject.topics ?? []).length===0 ? <p className="muted">Topics have not been assigned to this subject yet.</p> : null}</div> : null}
          </div>
        </article>;
      })}</div>
    </> : null}
  </section>;
}
