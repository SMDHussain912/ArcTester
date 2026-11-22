import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { request, API } from "./apiClient";
import { getSceneAnimationState } from "./lessonAnimation";

type TimelineAction = {
  atMs: number;
  action: "reveal_item" | "highlight_item" | "reveal_step" | "emphasize_text";
  targetIndex?: number;
  durationMs?: number;
};
type Scene = {
  sceneType: "title_card" | "text_reveal" | "diagram" | "equation" | "step_sequence" | "checkpoint";
  title: string;
  narration: string;
  onScreenText: string;
  durationMs: number;
  visual: { label: string; items: string[]; connections: { from: string; to: string; label: string }[]; equation: string; steps: string[] };
  timeline?: TimelineAction[];
};
type Lesson = {
  id: string;
  title: string;
  subject: string;
  topic: string;
  script: { title: string; learningObjectives: string[]; sections: { heading: string; explanation: string; example: string; teacherCue: string }[]; keyTakeaways: string[]; groundingNotes: string[] };
  storyboard: { scenes: Scene[] };
};

export default function StudentWebLessonPlayer() {
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [active, setActive] = useState<Lesson | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
  const [audioBusy, setAudioBusy] = useState(false);
  const [audioError, setAudioError] = useState("");
  const [timelineMs, setTimelineMs] = useState(0);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const animationBaseRef = useRef(0);
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [query, setQuery] = useState("");
  const audioUrlRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await request<{ ok: boolean; lessons: Lesson[] }>("/lessons");
      setLessons(Array.isArray(result.lessons) ? result.lessons : []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load published lessons.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => {
    audio?.pause();
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
  }, [audio]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const change = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener?.("change", change);
    return () => query.removeEventListener?.("change", change);
  }, []);

  useEffect(() => {
    setTimelineMs(0);
    animationBaseRef.current = 0;
    setAnimationPlaying(false);
  }, [active?.id, sceneIndex]);

  useEffect(() => {
    if (!animationPlaying || !scene) return;
    let frame = 0;
    let startedAt: number | null = null;
    const tick = (now: number) => {
      if (startedAt === null) startedAt = now;
      const next = Math.min(scene.durationMs, animationBaseRef.current + now - startedAt);
      setTimelineMs(next);
      if (next >= scene.durationMs) {
        animationBaseRef.current = scene.durationMs;
        setAnimationPlaying(false);
        return;
      }
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [animationPlaying, scene?.durationMs, active?.id, sceneIndex]);

  const subjects = useMemo(() => [...new Set(lessons.map((lesson) => lesson.subject))].sort(), [lessons]);
  const filtered = useMemo(() => lessons.filter((lesson) =>
    (subjectFilter === "all" || lesson.subject === subjectFilter) &&
    (query.trim() === "" || [lesson.title, lesson.subject, lesson.topic].some((value) => value.toLowerCase().includes(query.trim().toLowerCase())))
  ), [lessons, subjectFilter, query]);
  const scene = active?.storyboard.scenes[sceneIndex] ?? null;
  const duration = active ? active.storyboard.scenes.reduce((sum, item) => sum + Math.max(0, item.durationMs), 0) : 0;
  const elapsed = active ? active.storyboard.scenes.slice(0, sceneIndex).reduce((sum, item) => sum + Math.max(0, item.durationMs), 0) : 0;
  const progress = duration > 0 ? Math.round((elapsed + (scene?.durationMs ?? 0)) / duration * 100) : 0;
  const animationState = scene ? getSceneAnimationState(scene, timelineMs, reducedMotion) : null;

  const close = () => { audio?.pause(); setAudio(null); setAnimationPlaying(false); setTimelineMs(0); setActive(null); setSceneIndex(0); setShowNotes(false); setAudioError(""); };
  const chooseLesson = (lesson: Lesson) => { audio?.pause(); setAudio(null); setAnimationPlaying(false); setTimelineMs(0); setActive(lesson); setSceneIndex(0); setShowNotes(false); setAudioError(""); };
  const move = (next: number) => {
    if (!active) return;
    audio?.pause(); setAudio(null); setAnimationPlaying(false); setTimelineMs(0); animationBaseRef.current = 0; setAudioError("");
    if (next >= active.storyboard.scenes.length) { close(); return; }
    setSceneIndex(Math.max(0, Math.min(next, active.storyboard.scenes.length - 1)));
  };
  const playNarration = async () => {
    if (!active || !scene) return;
    setAudioBusy(true); setAudioError("");
    setAnimationPlaying(false); setTimelineMs(0); animationBaseRef.current = 0;
    try {
      audio?.pause();
      const response = await fetch(API + "/lessons/" + encodeURIComponent(active.id) + "/scenes/" + sceneIndex + "/audio", { credentials: "include" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.error === "string" ? body.error : "Narration is unavailable.");
      }
      const url = URL.createObjectURL(await response.blob());
      audioUrlRef.current = url;
      const player = new Audio(url);
      player.ontimeupdate = () => {
        const current = Math.min(scene.durationMs, Math.max(0, player.currentTime * 1000));
        setTimelineMs(current);
        animationBaseRef.current = current;
      };
      player.onended = () => {
        setTimelineMs(scene.durationMs);
        animationBaseRef.current = scene.durationMs;
        URL.revokeObjectURL(url);
        if (audioUrlRef.current === url) audioUrlRef.current = null;
      };
      setAudio(player);
      await player.play();
    } catch (cause) {
      setAudioError(cause instanceof Error ? cause.message : "Could not play narration.");
    } finally { setAudioBusy(false); }
  };

  const toggleAnimation = () => {
    if (animationPlaying) {
      animationBaseRef.current = timelineMs;
      setAnimationPlaying(false);
      return;
    }
    audio?.pause();
    const startAt = timelineMs >= scene?.durationMs ? 0 : timelineMs;
    animationBaseRef.current = startAt;
    setTimelineMs(startAt);
    setAnimationPlaying(true);
  };

  if (active && scene) {
    return <main className="web-lesson-player stack" aria-label="Lesson player">
      <header className="web-lesson-player-header">
        <button type="button" className="ghost" onClick={close}>← Lesson library</button>
        <div><p className="eyebrow">{active.subject} · {active.topic}</p><h1>{active.title}</h1></div>
        <span className="pill">Scene {sceneIndex + 1} / {active.storyboard.scenes.length}</span>
      </header>
      <div className="web-lesson-progress" role="progressbar" aria-label="Lesson timeline progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: progress + "%" }} /></div>
      <section className="panel web-lesson-scene" aria-live="polite">
        <div className="web-lesson-scene-meta"><span className="pill">{scene.sceneType.replace(/_/g, " ")}</span><span className="muted">{Math.ceil(scene.durationMs / 1000)} sec</span></div>
        <h2>{scene.title}</h2>
        {scene.onScreenText ? <p className={`web-lesson-onscreen${animationState?.emphasizeText ? " is-emphasized" : ""}`}>{scene.onScreenText}</p> : null}
        {scene.sceneType === "diagram" && scene.visual.items.length ? <div className="web-lesson-diagram" aria-label={scene.visual.label || "Lesson diagram"}>
          {scene.visual.items.map((item, index) => {
            const visible = animationState?.visibleItems.has(index) ?? true;
            const highlighted = animationState?.highlightedItems.has(index) ?? false;
            return <div className={`web-lesson-diagram-item${visible ? "" : " is-hidden"}${highlighted ? " is-highlighted" : ""}`} key={item} aria-hidden={!visible}><span>{index + 1}</span><strong>{item}</strong></div>;
          })}
          {scene.visual.connections.length ? <ul>{scene.visual.connections.map((connection, index) => <li key={index}>{connection.from} <span aria-hidden="true">→</span> {connection.to}{connection.label ? <small> · {connection.label}</small> : null}</li>)}</ul> : null}
        </div> : null}
        {scene.sceneType === "equation" && scene.visual.equation ? <div className="web-lesson-equation">{scene.visual.equation}</div> : null}
        {scene.sceneType === "step_sequence" && scene.visual.steps.length ? <ol className="web-lesson-steps">{scene.visual.steps.map((step, index) => {
          const visible = animationState?.visibleSteps.has(index) ?? true;
          return <li className={visible ? "" : "is-hidden"} key={index} aria-hidden={!visible}><span>{index + 1}</span>{step}</li>;
        })}</ol> : null}
        {scene.sceneType === "checkpoint" ? <div className="notice web-lesson-checkpoint">Pause and recall the key idea before finishing this lesson.</div> : null}
        <p className="web-lesson-narration">{scene.narration}</p>
        <div className="row web-lesson-audio">
          <button type="button" className="ghost" disabled={audioBusy} onClick={() => void playNarration()}>{audioBusy ? "Loading narration…" : "▶ Play narration"}</button>
          <button type="button" className="ghost" onClick={toggleAnimation} >{animationPlaying ? "Pause animation" : timelineMs >= scene.durationMs ? "Replay animation" : "Play animation"}</button>
          {audio ? <button type="button" className="ghost" onClick={() => { audio.pause(); setAudio(null); }}>Stop audio</button> : null}
          <span className="muted">{Math.floor(timelineMs / 1000)}s / {Math.ceil(scene.durationMs / 1000)}s</span>
          {audioError ? <p className="error" role="alert">{audioError}</p> : null}
        </div>
      </section>
      <section className="panel web-lesson-notes">
        <button type="button" className="ghost" aria-expanded={showNotes} onClick={() => setShowNotes((value) => !value)}>{showNotes ? "Hide lesson notes" : "Read lesson notes"}</button>
        {showNotes ? <div className="stack">
          <h2>{active.script.title}</h2>
          <h3>Learning objectives</h3><ul>{active.script.learningObjectives.map((item) => <li key={item}>{item}</li>)}</ul>
          {active.script.sections.map((section, index) => <article key={index}><h3>{section.heading}</h3><p>{section.explanation}</p>{section.example ? <p><strong>Example:</strong> {section.example}</p> : null}{section.teacherCue ? <p className="muted">{section.teacherCue}</p> : null}</article>)}
          <h3>Key takeaways</h3><ul>{active.script.keyTakeaways.map((item) => <li key={item}>{item}</li>)}</ul>
          {active.script.groundingNotes.length ? <p className="muted">Source notes: {active.script.groundingNotes.join(" · ")}</p> : null}
        </div> : null}
      </section>
      <footer className="web-lesson-controls">
        <button type="button" className="ghost" disabled={sceneIndex === 0} onClick={() => move(sceneIndex - 1)}>← Previous scene</button>
        <span className="muted">{Math.floor(elapsed / 60000)}:{String(Math.floor(elapsed / 1000) % 60).padStart(2, "0")} elapsed</span>
        <button type="button" className="primary" onClick={() => move(sceneIndex + 1)}>{sceneIndex === active.storyboard.scenes.length - 1 ? "Finish lesson" : "Next scene →"}</button>
      </footer>
    </main>;
  }

  return <main className="web-lesson-library stack">
    <section className="panel">
      <div className="panel-header"><div><p className="eyebrow">STUDY AT YOUR PACE</p><h1>Lesson library</h1><p className="muted">Published visual lessons with guided scenes, examples, and narration.</p></div><span className="pill">{lessons.length} lessons</span></div>
      <div className="row web-lesson-filters"><label>Search lessons<input aria-label="Search lessons" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Title, subject or topic" /></label><label>Subject<select aria-label="Filter by subject" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjects.map((subject) => <option key={subject} value={subject}>{subject}</option>)}</select></label><button type="button" className="ghost" disabled={loading} onClick={() => void refresh()}>Refresh</button></div>
      {error ? <div className="student-load-error" role="alert"><div><strong>Could not load lessons</strong><p>{error}</p></div><button type="button" className="ghost" onClick={() => void refresh()}>Retry</button></div> : null}
      {loading ? <p className="muted" role="status">Loading published lessons…</p> : null}
      {!loading && !error && lessons.length === 0 ? <div className="notice">No published lessons are available yet. Check back after a lesson has been reviewed and published.</div> : null}
      {!loading && !error && lessons.length > 0 && filtered.length === 0 ? <p className="muted">No lessons match these filters.</p> : null}
    </section>
    <div className="web-lesson-card-grid">{filtered.map((lesson) => <article className="panel web-lesson-card" key={lesson.id}><div><p className="eyebrow">{lesson.subject} · {lesson.topic}</p><h2>{lesson.title}</h2><p className="muted">{lesson.script.learningObjectives.length} objectives · {lesson.storyboard.scenes.length} scenes</p></div><button type="button" className="primary" aria-label="Start lesson" onClick={() => chooseLesson(lesson)}>Start lesson →</button></article>)}</div>
  </main>;
}
