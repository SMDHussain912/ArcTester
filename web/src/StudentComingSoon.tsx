import type { CSSProperties } from "react";

const features = [
  { title: "XP, levels & streaks", detail: "Earn experience, build daily streaks and track your learning milestones." },
  { title: "Rewards & leaderboard", detail: "Unlock rewards and compare progress with classmates." },
  { title: "Mastery & smart revision", detail: "Review weak topics and get practice recommendations based on your answers." },
  { title: "Learning analytics", detail: "See accuracy trends, subject strengths and exam readiness in one place." },
  { title: "More guided lessons", detail: "New animated explanations and expanded lesson paths." },
];

const panel: CSSProperties = { border: "1px solid var(--border, #e5e7eb)", borderRadius: 18, padding: 22, background: "var(--panel, #fff)" };
const item: CSSProperties = { display: "flex", gap: 14, alignItems: "flex-start", padding: "15px 0", borderBottom: "1px solid var(--border, #e5e7eb)" };

export default function StudentComingSoon() {
  return (
    <section style={{ maxWidth: 900, margin: "0 auto", display: "grid", gap: 18 }}>
      <header style={{ ...panel, background: "linear-gradient(135deg, #eff6ff, #f5f3ff)", color: "#172033" }}>
        <p style={{ margin: 0, fontWeight: 800, letterSpacing: ".12em", fontSize: 12, color: "#4f46e5" }}>ARCTESTER · NEXT UPDATE</p>
        <h1 style={{ margin: "10px 0 8px", fontSize: 30 }}>More ways to learn are on the way</h1>
        <p style={{ margin: 0, lineHeight: 1.6 }}>The launch version focuses on learning, lessons, practice and assigned exams. We’re building the features below for upcoming updates.</p>
      </header>
      <div style={panel}>
        <h2 style={{ marginTop: 0 }}>Coming in future updates</h2>
        {features.map((feature, index) => (
          <div key={feature.title} style={{ ...item, borderBottom: index === features.length - 1 ? 0 : item.borderBottom }}>
            <span aria-hidden="true" style={{ width: 34, height: 34, flex: "0 0 34px", borderRadius: 11, display: "grid", placeItems: "center", background: "#eef2ff", color: "#4f46e5", fontWeight: 800 }}>{index + 1}</span>
            <div><h3 style={{ margin: "0 0 5px", fontSize: 16 }}>{feature.title}</h3><p style={{ margin: 0, lineHeight: 1.55, color: "var(--muted, #64748b)" }}>{feature.detail}</p></div>
          </div>
        ))}
      </div>
      <p style={{ margin: 0, color: "var(--muted, #64748b)", fontSize: 13 }}>These features are not available yet. We’ll enable them when they’re ready.</p>
    </section>
  );
}
