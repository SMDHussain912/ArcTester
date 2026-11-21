import { useCallback, useEffect, useState } from "react";
import { request } from "./apiClient";
import "./StudentMastery.css";

type MasteryTopic = { topicId: number; subject: string; topic: string; totalQuestions: number; answeredQuestions: number; attempts: number; correct: number; coveragePct: number; masteryPct: number };
type Quest = { key: string; title: string; description: string; target: number; rewardXp: number; progress: number; completed: boolean; claimed: boolean };
type Badge = { key: string; title: string; description: string; unlockedAt: string | null };
type ReviewQuestion = { id: number; text: string; options: string[]; questionType: string; promptData: Record<string, unknown>; subject: string; topic: string | null; dueAt: string; intervalDays: number; repetitions: number };

export default function StudentMastery() {
  const [topics, setTopics] = useState<MasteryTopic[]>([]);
  const [quests, setQuests] = useState<Quest[]>([]);
  const [badges, setBadges] = useState<Badge[]>([]);
  const [questions, setQuestions] = useState<ReviewQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<unknown>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [mastery, questData, badgeData, due] = await Promise.all([
        request<{ topics: MasteryTopic[] }>("/learning/mastery"),
        request<{ quests: Quest[] }>("/gamification/quests"),
        request<{ badges: Badge[] }>("/gamification/badges"),
        request<{ questions: ReviewQuestion[] }>("/learning/practice-mistakes?limit=10"),
      ]);
      setTopics(mastery.topics);
      setQuests(questData.quests);
      setBadges(badgeData.badges);
      setQuestions(due.questions);
      setIndex(0);
      setResponse(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load mastery data.");
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const current = questions[index];
  async function submitReview(value: unknown) {
    if (!current || busy) return;
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      const result = await request<{ correct: boolean; explanation: string; nextReviewAt: string; intervalDays: number }>("/learning/practice-mistakes/answer", {
        method: "POST", body: JSON.stringify({ questionId: current.id, response: value }),
      });
      setFeedback(result.correct ? `Correct! Next review in ${result.intervalDays} day(s).` : `Not quite. This question is scheduled for tomorrow. ${result.explanation}`);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit review answer.");
    } finally { setBusy(false); }
  }

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-header">
          <div><p className="eyebrow">LEARNING PROGRESS</p><h1>Topic mastery</h1><p className="muted">Rule-based mastery from your practice history. Coverage shows how much of each topic you have tried.</p></div>
          <button className="button button-secondary" onClick={() => void refresh()} disabled={busy}>Refresh</button>
        </div>
        {topics.length === 0 ? <p className="muted">No approved topic questions are available yet.</p> : (
          <div className="stack">
            {topics.map((topic) => <article key={topic.topicId} className="mastery-topic">
              <div className="panel-header"><div><strong>{topic.topic}</strong><p className="muted">{topic.subject} · {topic.answeredQuestions}/{topic.totalQuestions} questions tried</p></div><b>{topic.masteryPct}%</b></div>
              <div className="mastery-track" aria-label={`Mastery ${topic.masteryPct}%`}><span style={{ width: topic.masteryPct + "%" }} /></div>
              <small className="muted">Coverage {topic.coveragePct}% · {topic.attempts} answers</small>
            </article>)}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">TODAY</p><h2>Daily quests</h2></div></div>
        <div className="stack">
          {quests.map((quest) => <div key={quest.key} className="quest-row">
            <div><strong>{quest.title}</strong><p className="muted">{quest.description}</p></div>
            <span className={quest.completed ? "status status-used" : "status status-pending"}>{quest.completed ? `Done · ${quest.claimed ? "Claimed" : "+" + quest.rewardXp + " XP"}` : `${quest.progress}/${quest.target} · +${quest.rewardXp} XP`}</span>
          </div>)}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">SPACED REPETITION</p><h2>Practice mistakes</h2><p className="muted">Wrong lesson answers come back here. Correct answers move farther apart; wrong answers return tomorrow.</p></div><span className="pill">{questions.length} due</span></div>
        {current ? <article className="review-card">
          <p className="muted">{current.subject}{current.topic ? " · " + current.topic : ""} · Review {index + 1} of {questions.length}</p>
          <h3>{current.text}</h3>
          {(current.questionType === "mcq" || current.questionType === "true_false") && current.options.length ? (
            <div className="stack">{current.options.map((option, optionIndex) => <button key={optionIndex} className={response === optionIndex ? "button button-primary" : "button button-secondary"} disabled={busy} onClick={() => setResponse(optionIndex)}>{option}</button>)}</div>
          ) : current.questionType === "matching" && Array.isArray(current.promptData.left) && Array.isArray(current.promptData.right) ? (
            <div className="stack">{(current.promptData.left as unknown[]).map((item, leftIndex) => {
              const selected = Array.isArray(response) ? response as unknown[] : [];
              return <label key={leftIndex} className="review-option">{String(item)}<select aria-label={`Match ${String(item)}`} value={Number.isInteger(selected[leftIndex]) ? String(selected[leftIndex]) : ""} disabled={busy} onChange={(event) => {
                const next = [...selected];
                next[leftIndex] = event.target.value === "" ? null : Number(event.target.value);
                setResponse(next);
              }}><option value="">Choose match</option>{(current.promptData.right as unknown[]).map((choice, rightIndex) => <option key={rightIndex} value={rightIndex}>{String(choice)}</option>)}</select></label>;
            })}</div>
          ) : current.questionType === "multi_select" && current.options.length ? (
            <div className="stack">{current.options.map((option, optionIndex) => {
              const selected = Array.isArray(response) && response.includes(optionIndex);
              return <label key={optionIndex} className="review-option"><input type="checkbox" checked={selected} disabled={busy} onChange={(event) => setResponse((old: unknown) => {
                const values = Array.isArray(old) ? old as number[] : [];
                return event.target.checked ? [...values, optionIndex] : values.filter((v) => v !== optionIndex);
              })} /> {option}</label>;
            })}</div>
          ) : <input aria-label="Your answer" value={typeof response === "string" || typeof response === "number" ? String(response) : ""} disabled={busy} onChange={(event) => setResponse(current.questionType === "numeric" && event.target.value.trim() !== "" ? Number(event.target.value) : event.target.value)} placeholder="Type your answer" />}
          <div className="row"><button className="button button-primary" disabled={busy || response === null || response === "" || (Array.isArray(response) && response.length === 0)} onClick={() => void submitReview(response)}>{busy ? "Checking…" : "Check answer"}</button></div>
        </article> : <p className="muted">No due mistakes right now. Keep practicing; missed lesson questions will appear here.</p>}
        {feedback ? <p className="success" role="status">{feedback}</p> : null}
      </section>

      <section className="panel">
        <div className="panel-header"><div><p className="eyebrow">ACHIEVEMENTS</p><h2>Badges</h2></div><span className="pill">{badges.filter((badge) => badge.unlockedAt).length}/{badges.length} unlocked</span></div>
        <div className="badge-grid">{badges.map((badge) => <article key={badge.key} className={badge.unlockedAt ? "badge-card unlocked" : "badge-card"}>
          <span aria-hidden="true">{badge.unlockedAt ? "🏅" : "◇"}</span><strong>{badge.title}</strong><p className="muted">{badge.description}</p>{badge.unlockedAt ? <small>Unlocked {new Date(badge.unlockedAt).toLocaleDateString()}</small> : <small>Locked</small>}
        </article>)}</div>
      </section>
      {error ? <p className="error" role="alert">{error}</p> : null}
    </div>
  );
}
