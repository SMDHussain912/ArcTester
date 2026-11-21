import "./StudentGamification.css";
import { useCallback, useEffect, useState } from "react";
import { request } from "./apiClient";

type Day = { date: string; xpEarned: number; goalReached: boolean; freezeUsed: boolean };
type Snapshot = {
  totalXp: number; xpBalance: number; level: number; xpIntoLevel: number; xpToNextLevel: number;
  currentStreak: number; longestStreak: number; dailyGoalXp: number; streakFreezeInventory: number;
  today: { xpEarned: number; goalReachedAt: string | null } | null;
  week: Day[];
};
const FREEZE_COST = 100;
const MAX_FREEZES = 2;

export default function StudentGamification() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [goal, setGoal] = useState(50);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await request<Snapshot>("/gamification");
      setData(result); setGoal(result.dailyGoalXp);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load rewards.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  async function saveGoal() {
    setBusy(true); setError("");
    try {
      await request("/gamification/daily-goal", { method: "POST", body: JSON.stringify({ dailyGoalXp: goal }) });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update daily goal."); }
    finally { setBusy(false); }
  }

  async function buyFreeze() {
    setBusy(true); setError("");
    try {
      await request("/gamification/streak-freeze/buy", { method: "POST", body: "{}" });
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not buy a streak freeze."); }
    finally { setBusy(false); }
  }

  const todayXp = data?.today?.xpEarned ?? 0;
  const goalProgress = data ? Math.min(100, Math.round(todayXp / Math.max(1, data.dailyGoalXp) * 100)) : 0;
  return (
    <section className="stack student-gamification" aria-label="Rewards and daily goals">
      <div className="page-heading">
        <div><p className="eyebrow">YOUR LEARNING REWARDS</p><h1>XP, levels & streaks</h1><p className="muted">Build a steady ECET practice habit. XP is awarded by the server for completed learning milestones.</p></div>
        <button className="ghost" disabled={loading || busy} onClick={() => void refresh()}>{loading ? "Loading…" : "Refresh"}</button>
      </div>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {data ? <>
        <div className="stats-row">
          <article className="panel stat"><span className="muted">Total XP</span><strong>{data.totalXp.toLocaleString()}</strong><span className="muted">Level {data.level}</span></article>
          <article className="panel stat"><span className="muted">XP balance</span><strong>{data.xpBalance.toLocaleString()}</strong><span className="muted">Spendable XP</span></article>\n          <article className="panel stat"><span className="muted">Current streak</span><strong>{data.currentStreak} 🔥</strong><span className="muted">Longest: {data.longestStreak} days</span></article>
          <article className="panel stat"><span className="muted">Streak freezes</span><strong>{data.streakFreezeInventory} / {MAX_FREEZES} ❄️</strong><span className="muted">Protect one missed day automatically</span></article>
        </div>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">LEVEL {data.level}</p><h2>{data.xpIntoLevel} / 100 XP to next level</h2></div><strong>{data.xpToNextLevel} XP left</strong></div>
          <div className="gamification-progress" role="progressbar" aria-label="Level progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={data.xpIntoLevel}><span style={{ width: data.xpIntoLevel + "%" }} /></div>
        </section>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">TODAY</p><h2>Daily XP goal</h2></div><strong>{todayXp} / {data.dailyGoalXp} XP</strong></div>
          <div className="progress-track" role="progressbar" aria-label="Daily goal progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalProgress}><span style={{ width: goalProgress + "%" }} /></div>
          <p className="muted">{data.today?.goalReachedAt ? "Daily goal reached! +10 bonus XP earned." : "Earn a 10 XP bonus when you reach your goal."}</p>
          <div className="row">
            <label htmlFor="daily-xp-goal">Set goal (20–200 XP)</label>
            <input id="daily-xp-goal" type="number" min={20} max={200} step={10} value={goal} onChange={(event) => setGoal(Number(event.target.value))} />
            <button className="button button-primary" disabled={busy || !Number.isInteger(goal) || goal < 20 || goal > 200} onClick={() => void saveGoal()}>Save goal</button>
          </div>
        </section>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">LAST 7 DAYS</p><h2>Consistency calendar</h2></div></div>
          <div className="gamification-week">
            {data.week.map((day) => <div className={day.goalReached ? "gamification-day goal-reached" : day.freezeUsed ? "gamification-day freeze-used" : "gamification-day"} key={day.date} title={day.date + ": " + day.xpEarned + " XP"}>
              <b>{new Date(day.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short", timeZone: "UTC" })}</b>
              <span>{day.freezeUsed ? "❄️" : day.goalReached ? "✓" : day.xpEarned ? "•" : "—"}</span>
              <small>{day.xpEarned} XP</small>
            </div>)}
          </div>
        </section>
        <section className="panel">
          <div className="section-head"><div><p className="eyebrow">STREAK PROTECTION</p><h2>Streak freeze</h2><p className="muted">One freeze covers a single missed UTC day. You can hold at most two.</p></div></div>
          <button className="button button-secondary" disabled={busy || data.streakFreezeInventory >= MAX_FREEZES || data.xpBalance < FREEZE_COST} onClick={() => void buyFreeze()}>Buy a freeze · {FREEZE_COST} XP</button>
          {data.streakFreezeInventory >= MAX_FREEZES ? <p className="muted">Inventory is full.</p> : data.totalXp < FREEZE_COST ? <p className="muted">Earn {FREEZE_COST - data.xpBalance} more XP to buy one.</p> : null}
        </section>
      </> : !loading ? <section className="panel"><p className="muted">Rewards could not be loaded.</p></section> : <section className="panel"><p className="muted">Loading your XP and streak…</p></section>}
    </section>
  );
}
