import { useCallback, useEffect, useRef, useState } from "react";
import { request } from "./apiClient";

type Overview = {
  practice: { completedAttempts: number; correct: number; incorrect: number; accuracy: number | null; trend: { attemptId: number; finishedAt: string; accuracy: number | null; correct: number; total: number }[] };
  formalExams: { submissions: number; graded: number; scorePercentage: number | null; score: number; maximumScore: number };
};
type Rewards = {
  totalXp: number; xpBalance: number; level: number; xpIntoLevel: number; xpToNextLevel: number;
  currentStreak: number; longestStreak: number; dailyGoalXp: number;
  today: { xpEarned: number; goalReachedAt: string | null } | null;
};
type Topic = { topicId: number; subject: string; topic: string; totalQuestions: number; answeredQuestions: number; coveragePct: number; masteryPct: number };
type Summary = { overview: Overview; rewards: Rewards; topics: Topic[] };
const pct = (value: number | null) => value === null || !Number.isFinite(value) ? "Not enough data" : Math.round(value * 100) + "%";

export default function StudentLearningSummary({ setActivePage }: { setActivePage: (page: string) => void }) {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const current = ++generation.current;
    setLoading(true); setError("");
    try {
      const [overview, rewards, mastery] = await Promise.all([
        request<Overview>("/analytics/overview"),
        request<Rewards>("/gamification"),
        request<{ topics: Topic[] }>("/learning/mastery"),
      ]);
      if (current !== generation.current) return;
      const safeOverview: Overview = {
        practice: {
          completedAttempts: Number(overview?.practice?.completedAttempts ?? 0),
          correct: Number(overview?.practice?.correct ?? 0),
          incorrect: Number(overview?.practice?.incorrect ?? 0),
          accuracy: typeof overview?.practice?.accuracy === "number" ? overview.practice.accuracy : null,
          trend: Array.isArray(overview?.practice?.trend) ? overview.practice.trend : [],
        },
        formalExams: {
          submissions: Number(overview?.formalExams?.submissions ?? 0),
          graded: Number(overview?.formalExams?.graded ?? 0),
          scorePercentage: typeof overview?.formalExams?.scorePercentage === "number" ? overview.formalExams.scorePercentage : null,
          score: Number(overview?.formalExams?.score ?? 0),
          maximumScore: Number(overview?.formalExams?.maximumScore ?? 0),
        },
      };
      const rawRewards = rewards as Partial<Rewards> | undefined;
      const safeRewards: Rewards = {
        totalXp: Number(rawRewards?.totalXp ?? 0), xpBalance: Number(rawRewards?.xpBalance ?? 0),
        level: Number(rawRewards?.level ?? 1), xpIntoLevel: Number(rawRewards?.xpIntoLevel ?? 0),
        xpToNextLevel: Number(rawRewards?.xpToNextLevel ?? 100), currentStreak: Number(rawRewards?.currentStreak ?? 0),
        longestStreak: Number(rawRewards?.longestStreak ?? 0), dailyGoalXp: Number(rawRewards?.dailyGoalXp ?? 50),
        today: rawRewards?.today && typeof rawRewards.today === "object" ? {
          xpEarned: Number(rawRewards.today.xpEarned ?? 0), goalReachedAt: rawRewards.today.goalReachedAt ?? null,
        } : null,
      };
      setData({ overview: safeOverview, rewards: safeRewards, topics: Array.isArray(mastery?.topics) ? mastery.topics.filter(Boolean) : [] });
    } catch (cause) {
      if (current === generation.current) setError(cause instanceof Error ? cause.message : "Could not load your learning summary.");
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); return () => { generation.current += 1; }; }, [refresh]);

  const todayXp = data?.rewards.today?.xpEarned ?? 0;
  const goal = data?.rewards.dailyGoalXp ?? 0;
  const goalPct = goal > 0 ? Math.min(100, Math.round(todayXp / goal * 100)) : 0;
  const weakTopics = data ? [...data.topics].sort((a, b) => a.masteryPct - b.masteryPct || a.coveragePct - b.coveragePct).slice(0, 5) : [];
  const trend = data?.overview.practice.trend.slice(-5).reverse() ?? [];

  return <section className="student-learning-summary stack" aria-labelledby="learning-summary-title">
    <div className="page-heading">
      <div><p className="eyebrow">YOUR LEARNING</p><h1 id="learning-summary-title">Learning summary</h1><p className="muted">Practice, topic mastery and server-recorded rewards in one place.</p></div>
      <button className="ghost" type="button" disabled={loading} onClick={() => void refresh()}>{loading ? "Refreshing…" : "Refresh summary"}</button>
    </div>
    {error ? <p className="error" role="alert">{error}{data ? " Showing the last loaded summary." : ""}</p> : null}
    {loading && !data ? <section className="panel" role="status">Loading your learning summary…</section> : null}
    {data ? <>
      <div className="stats-row">
        <article className="panel stat"><span className="muted">Practice tests</span><strong>{data.overview.practice.completedAttempts}</strong><span className="muted">Completed</span></article>
        <article className="panel stat"><span className="muted">Practice accuracy</span><strong>{pct(data.overview.practice.accuracy)}</strong><span className="muted">{data.overview.practice.correct} correct · {data.overview.practice.incorrect} incorrect</span></article>
        <article className="panel stat"><span className="muted">Total XP</span><strong>{data.rewards.totalXp.toLocaleString()}</strong><span className="muted">Level {data.rewards.level} · {data.rewards.xpToNextLevel} XP to next</span></article>
        <article className="panel stat"><span className="muted">Current streak</span><strong>{data.rewards.currentStreak} days</strong><span className="muted">Longest {data.rewards.longestStreak} days</span></article>
      </div>
      <div className="grid two">
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">TODAY</p><h2>Daily goal</h2></div><strong>{todayXp} / {goal} XP</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Daily XP goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPct}><span style={{ width: goalPct + "%" }} /></div>
          <p className="muted">{data.rewards.today?.goalReachedAt ? "Daily goal reached." : Math.max(0, goal - todayXp) + " XP left to reach today's goal."}</p>
          <div className="row wrap"><button className="button button-secondary" type="button" onClick={() => setActivePage("rewards")}>Manage XP goal & streak freeze</button><button className="button button-secondary" type="button" onClick={() => setActivePage("mastery")}>Review mistakes</button></div>
        </section>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">OFFICIAL EXAMS</p><h2>Exam results</h2></div></div>
          <strong>{pct(data.overview.formalExams.scorePercentage)}</strong>
          <p className="muted">{data.overview.formalExams.graded} graded of {data.overview.formalExams.submissions} submissions · {data.overview.formalExams.score} / {data.overview.formalExams.maximumScore} marks</p>
          <button className="button button-secondary" type="button" onClick={() => setActivePage("progress")}>Detailed progress</button>
        </section>
      </div>
      <section className="panel">
        <div className="section-head"><div><p className="eyebrow">TOPIC MASTERY</p><h2>Topics to revisit</h2><p className="muted">Lowest server-calculated mastery first; a study hint, not an exam prediction.</p></div><button className="ghost" type="button" onClick={() => setActivePage("mastery")}>Open mastery →</button></div>
        {weakTopics.length ? <div className="stack">{weakTopics.map(topic => <article className="coverage-row" key={topic.topicId}>
          <div className="row wrap" style={{ justifyContent: "space-between" }}><strong>{topic.topic}</strong><span className="muted">{topic.subject} · {topic.masteryPct}% mastery</span></div>
          <div className="progress-track" role="progressbar" aria-label={topic.topic + " mastery"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={topic.masteryPct}><span style={{ width: Math.max(0, Math.min(100, topic.masteryPct)) + "%" }} /></div>
          <small className="muted">{topic.answeredQuestions} / {topic.totalQuestions} questions tried · {topic.coveragePct}% coverage</small>
        </article>)}</div> : <p className="muted">Topic mastery will appear after you practice approved questions.</p>}
      </section>
      <section className="panel">
        <div className="section-head"><div><p className="eyebrow">RECENT PRACTICE</p><h2>Last completed attempts</h2></div><button className="ghost" type="button" onClick={() => setActivePage("analytics")}>Full analytics →</button></div>
        {trend.length ? <div className="grid two">{trend.map(attempt => <article className="question-review-row" key={attempt.attemptId}>
          <strong>Practice #{attempt.attemptId}</strong><p>{new Date(attempt.finishedAt).toLocaleDateString()}</p><p>{pct(attempt.accuracy)} · {attempt.correct}/{attempt.total} correct</p>
        </article>)}</div> : <p className="muted">Completed practice attempts will show here.</p>}
      </section>
      <div className="row wrap"><button className="button button-secondary" type="button" onClick={() => setActivePage("path")}>Continue learning path</button><button className="button button-primary" type="button" onClick={() => setActivePage("practice")}>Start practice</button></div>
    </> : !loading ? <section className="panel">Your learning summary is unavailable. Refresh to try again.</section> : null}
  </section>;
}
