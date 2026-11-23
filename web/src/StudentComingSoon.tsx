import type { CSSProperties } from "react";

const features = [
  { title: "Learning hub & learning path", detail: "A structured subject → unit → lesson experience with clear next steps." },
  { title: "Lessons library", detail: "Guided lessons with interactive steps, examples and knowledge checks." },
  { title: "Learning summary", detail: "A focused overview of completed lessons, practice accuracy and subject progress." },
  { title: "Animated explanations", detail: "Step-by-step reveals, highlights, narration and replayable lesson scenes." },
  { title: "Adaptive study plan", detail: "Recommendations that prioritize weak topics and your upcoming ECET goals." },
  { title: "Detailed exam review", detail: "Topic-wise results, answer explanations and a personal mistake-review list." },
  { title: "Offline lessons & bookmarks", detail: "Download selected lessons and save important questions for later." },
  { title: "XP, levels & streaks", detail: "Earn experience, build daily streaks and track learning milestones." },
  { title: "Rewards, achievements & leaderboard", detail: "Unlock milestones and compare progress with classmates." },
  { title: "Learning analytics", detail: "Track accuracy trends, subject strengths and exam readiness." },
];

const panel: CSSProperties = {
  border: "1px solid var(--border)",
  borderRadius: 18,
  padding: 22,
  background: "var(--surface)",
  color: "var(--text)",
};
const item: CSSProperties = {
  display: "flex",
  gap: 14,
  alignItems: "flex-start",
  padding: "15px 0",
  borderBottom: "1px solid var(--border)",
};

export default function StudentComingSoon() {
  return (
    <section style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
      <header
        style={{
          ...panel,
          background: "linear-gradient(135deg, var(--accent-soft), var(--surface))",
        }}
      >
        <p style={{ margin: 0, fontWeight: 800, letterSpacing: ".12em", fontSize: 12, color: "var(--accent)" }}>
          ARCTESTER · NEXT UPDATE
        </p>
        <h1 style={{ margin: "10px 0 8px", fontSize: 30, color: "var(--text)" }}>
          More ways to learn are on the way
        </h1>
        <p style={{ margin: 0, lineHeight: 1.6, color: "var(--text)" }}>
          The launch version keeps practice and assigned exams available. Learning, lessons and the learning summary are moving to a future update while we finish them.
        </p>
      </header>
      <div style={panel}>
        <h2 style={{ marginTop: 0, color: "var(--text)" }}>Coming in future updates</h2>
        {features.map((feature, index) => (
          <div key={feature.title} style={{ ...item, borderBottom: index === features.length - 1 ? 0 : item.borderBottom }}>
            <span
              aria-hidden="true"
              style={{
                width: 34,
                height: 34,
                flex: "0 0 34px",
                borderRadius: 11,
                display: "grid",
                placeItems: "center",
                background: "var(--accent-soft)",
                color: "var(--accent)",
                fontWeight: 800,
              }}
            >
              {index + 1}
            </span>
            <div>
              <h3 style={{ margin: "0 0 5px", fontSize: 16, color: "var(--text)" }}>{feature.title}</h3>
              <p style={{ margin: 0, lineHeight: 1.55, color: "var(--muted)" }}>{feature.detail}</p>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, color: "var(--muted)", fontSize: 13 }}>
        These features are not available yet. We’ll enable them when they’re ready.
      </p>
    </section>
  );
}
