import { useEffect, useMemo, useRef, useState } from "react";

const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");
const MAX_SOURCE_CHARS = 30_000;
const MAX_FILE_BYTES = 120 * 1024;

type DraftSummary = {
  id: string; title: string; subject: string; topic: string; status: string;
  provider: string; model: string; createdAt: string; updatedAt: string;
};
type DraftRecord = DraftSummary & {
  sourceTitle: string; sourceText: string; scriptJson: string; storyboardJson: string;
};
type Scene = {
  sceneType: string; title: string; narration: string; onScreenText: string;
  durationMs: number; visual?: { label?: string; items?: string[]; connections?: {from:string;to:string;label?:string}[]; equation?:string; steps?:string[] };
};
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(API + path, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((body as {error?:string}).error || "Lesson Studio request failed.");
  return body as T;
}

export default function AdminLessonStudio() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [title, setTitle] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [storyboardText, setStoryboardText] = useState("");
  const [subject, setSubject] = useState("Computer Science");
  const [topic, setTopic] = useState("");
  const [titleHint, setTitleHint] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [objectivesText, setObjectivesText] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshDrafts() {
    const result = await request<{drafts:DraftSummary[]}>("/admin/lesson-drafts");
    setDrafts(result.drafts || []);
  }

  async function openDraft(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{draft:DraftRecord}>(`/admin/lesson-drafts/${encodeURIComponent(id)}`);
      const draft = result.draft;
      setSelectedId(draft.id); setTitle(draft.title); setSubject(draft.subject); setTopic(draft.topic);
      setSourceTitle(draft.sourceTitle); setSourceText(draft.sourceText);
      setScriptText(JSON.stringify(JSON.parse(draft.scriptJson), null, 2));
      setStoryboardText(JSON.stringify(JSON.parse(draft.storyboardJson), null, 2));
      setNotice(`Opened draft · ${draft.provider} / ${draft.model}`);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let active = true;
    void request<{drafts:DraftSummary[]}>("/admin/lesson-drafts").then(result => { if (active) setDrafts(result.drafts || []); }).catch(e => { if (active) setError((e as Error).message); });
    return () => { active = false; };
  }, []);

  async function readFile(file: File) {
    setError(""); setNotice("");
    const ext = file.name.toLowerCase().split(".").pop();
    if (!["txt", "md", "json"].includes(ext || "")) {
      setError("Supported source files are TXT, Markdown (.md), and text-based JSON. PDF/DOCX extraction is not included in this part.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("The source file is too large. Choose a text file under 120 KB.");
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    try {
      const text = await file.text();
      if (text.length > MAX_SOURCE_CHARS) {
        setError("The source exceeds 30,000 characters. Trim it to the lesson topic before generating.");
        return;
      }
      setSourceTitle(file.name);
      setSourceText(text);
      setNotice(`Loaded ${file.name} · ${text.length.toLocaleString()} characters`);
    } catch {
      setError("Could not read that file. Try a plain-text source.");
    }
  }

  async function generate() {
    setError(""); setNotice("");
    if (sourceText.trim().length < 100) { setError("Add at least 100 characters of source material."); return; }
    if (sourceText.length > MAX_SOURCE_CHARS) { setError("Source material must be 30,000 characters or less."); return; }
    if (!subject.trim() || !topic.trim() || !sourceTitle.trim()) { setError("Subject, topic and source title are required."); return; }
    setBusy(true);
    try {
      const result = await request<{draft:DraftRecord}>("/admin/lesson-drafts/generate", {
        method: "POST",
        body: JSON.stringify({
          subject: subject.trim(), topic: topic.trim(), titleHint: titleHint.trim() || undefined,
          learningObjectives: objectivesText.split(/\r?\n/).map(x => x.trim()).filter(Boolean),
          sourceTitle: sourceTitle.trim(), sourceText: sourceText.trim(),
        }),
      });
      await refreshDrafts();
      await openDraft(result.draft.id);
      setNotice("Generated a new draft. Review and save your edits; nothing has been published.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  const parsedStoryboard = useMemo(() => {
    try {
      const value = JSON.parse(storyboardText) as { scenes?: Scene[] };
      if (!Array.isArray(value.scenes)) return { scenes: [] as Scene[], error: "Storyboard JSON must contain a scenes array." };
      return { scenes: value.scenes, error: "" };
    } catch {
      return { scenes: [] as Scene[], error: storyboardText.trim() ? "Storyboard JSON is not valid JSON yet." : "" };
    }
  }, [storyboardText]);

  async function saveDraft() {
    if (!selectedId) return;
    setError(""); setNotice("");
    let script: unknown, storyboard: unknown;
    try { script = JSON.parse(scriptText); } catch { setError("Script editor contains invalid JSON."); return; }
    try { storyboard = JSON.parse(storyboardText); } catch { setError("Storyboard editor contains invalid JSON."); return; }
    setBusy(true);
    try {
      await request(`/admin/lesson-drafts/${encodeURIComponent(selectedId)}`, {
        method: "PATCH", body: JSON.stringify({ title: title.trim(), script, storyboard }),
      });
      await refreshDrafts();
      setNotice("Draft saved and validated by the server. It is still unpublished.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteDraft() {
    if (!selectedId || !window.confirm("Delete this unpublished lesson draft? This cannot be undone.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/admin/lesson-drafts/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      setDrafts(old => old.filter(item => item.id !== selectedId));
      setSelectedId(""); setTitle(""); setScriptText(""); setStoryboardText("");
      setNotice("Draft deleted.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="stack admin-lesson-studio">
    <div className="admin-page-title"><div><p className="eyebrow">AI CONTENT WORKSHOP</p><h1>Lesson Studio</h1><p>Upload source notes, generate a teaching script and storyboard, then edit and preview before publishing.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshDrafts().catch(e => setError((e as Error).message))}>Refresh drafts</button></div>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    {notice && <div className="admin-alert success" role="status">{notice}</div>}
    <div className="admin-two-col lesson-studio-layout">
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 1 · SOURCE</p><h2>Prepare lesson material</h2></div></div>
        <label>Source file (.txt, .md, .json)<input ref={fileRef} type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" onChange={e => { const file = e.target.files?.[0]; if (file) void readFile(file); }}/></label>
        <p className="muted">Text-based files only in this part. Files are read as text in the admin browser; the source text is sent to the authenticated server for generation. Max 30,000 characters.</p>
        <div className="admin-two-col">
          <label>Subject<input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Computer Science"/></label>
          <label>Topic<input value={topic} onChange={e => setTopic(e.target.value)} placeholder="Stacks and queues"/></label>
          <label>Lesson title (optional)<input value={titleHint} onChange={e => setTitleHint(e.target.value)} placeholder="Stack operations explained"/></label>
          <label>Source title<input value={sourceTitle} onChange={e => setSourceTitle(e.target.value)} placeholder="Unit 2 notes"/></label>
        </div>
        <label>Learning objectives (one per line)<textarea rows={3} value={objectivesText} onChange={e => setObjectivesText(e.target.value)} placeholder={"Explain LIFO\nTrace push and pop operations"}/></label>
        <label>Source material<textarea rows={9} value={sourceText} onChange={e => setSourceText(e.target.value)} placeholder="Paste or load the source notes here…"/></label>
        <div className="row wrap"><span className="muted">{sourceText.length.toLocaleString()} / {MAX_SOURCE_CHARS.toLocaleString()} characters</span><button className="primary" disabled={busy || sourceText.trim().length < 100 || !topic.trim() || !sourceTitle.trim()} onClick={() => void generate()}>{busy ? "Working…" : "Generate lesson draft"}</button></div>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">DRAFT LIBRARY</p><h2>Saved drafts ({drafts.length})</h2></div></div>
        {!drafts.length ? <p className="muted">No lesson drafts yet. Generate one from source material.</p> :
          <div className="stack">{drafts.map(draft => <article className="study-material-admin-card" key={draft.id}>
            <div className="study-material-admin-main"><div><strong>{draft.title}</strong><p className="muted">{draft.subject} · {draft.topic}</p><small>{new Date(draft.updatedAt).toLocaleString()}</small></div><span className="status status-pending">{draft.status}</span></div>
            <button className="button button-secondary" disabled={busy} onClick={() => void openDraft(draft.id)}>Open draft</button>
          </article>)}</div>}
      </section>
    </div>
    {selectedId && <section className="admin-panel lesson-editor-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">STEP 2 · EDIT & PREVIEW</p><h2>Review lesson draft</h2><p>Edits are schema-validated by the API. Scene JSON is data only—not code.</p></div><div className="row wrap"><button className="primary" disabled={busy || !title.trim()} onClick={() => void saveDraft()}>Save draft</button><button className="button button-danger" disabled={busy} onClick={() => void deleteDraft()}>Delete draft</button></div></div>
      <label>Lesson title<input value={title} onChange={e => setTitle(e.target.value)}/></label>
      <div className="admin-two-col lesson-editors">
        <label>Teaching script JSON<textarea className="import-editor lesson-json-editor" rows={22} spellCheck={false} value={scriptText} onChange={e => setScriptText(e.target.value)}/></label>
        <label>Storyboard JSON<textarea className="import-editor lesson-json-editor" rows={22} spellCheck={false} value={storyboardText} onChange={e => setStoryboardText(e.target.value)}/></label>
      </div>
      <div className="lesson-preview">
        <div className="admin-panel-head"><div><p className="eyebrow">LIVE STORYBOARD PREVIEW</p><h3>{parsedStoryboard.scenes.length} scenes</h3></div><span className="muted">{Math.round(parsedStoryboard.scenes.reduce((sum, scene) => sum + (Number(scene.durationMs) || 0), 0) / 1000)} sec total</span></div>
        {parsedStoryboard.error && <p className="error" role="alert">{parsedStoryboard.error}</p>}
        {!parsedStoryboard.scenes.length ? <p className="muted">Add valid storyboard JSON to preview scenes.</p> :
          <div className="lesson-scene-grid">{parsedStoryboard.scenes.map((scene, index) => <article className="lesson-scene-card" key={index}>
            <div className="lesson-scene-top"><span className="status status-pending">Scene {index + 1}</span><small>{Math.max(0, Math.round((Number(scene.durationMs) || 0) / 1000))}s · {scene.sceneType}</small></div>
            <h4>{scene.title || "Untitled scene"}</h4>
            {scene.onScreenText && <p className="lesson-on-screen">{scene.onScreenText}</p>}
            {scene.visual?.items?.length ? <div className="lesson-visual-items">{scene.visual.items.map((item, i) => <span key={i}>{item}</span>)}</div> : null}
            {scene.visual?.equation && <p className="lesson-equation">{scene.visual.equation}</p>}
            {scene.visual?.steps?.length ? <ol>{scene.visual.steps.map((step, i) => <li key={i}>{step}</li>)}</ol> : null}
            <p>{scene.narration}</p>
          </article>)}</div>}
      </div>
    </section>}
  </div>;
}
