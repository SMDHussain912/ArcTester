import { useEffect, useMemo, useRef, useState } from "react";
import { AP_DIPLOMA_BRANCHES } from "./polytechnicCatalog";

const API = (import.meta.env.VITE_API_URL || "https://arctester.onrender.com").replace(/\/+$/, "");
const MAX_IMPORT_FILE_BYTES = 256 * 1024;

type DraftSummary = {
  id: string; title: string; subject: string; topic: string; status: string;
  provider: string; model: string; createdAt: string; updatedAt: string;
  audienceScope?: "ALL" | "COLLEGE" | "BRANCH"; targetCollegeCode?: string | null; targetCollegeName?: string | null; targetBranchCode?: string | null; targetBranchName?: string | null;
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
  const importFileRef = useRef<HTMLInputElement>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [selectedStatus, setSelectedStatus] = useState("DRAFT");
  const [title, setTitle] = useState("");
  const [audienceScope, setAudienceScope] = useState<"ALL" | "COLLEGE" | "BRANCH">("ALL");
  const [targetCollegeCode, setTargetCollegeCode] = useState("");
  const [targetCollegeName, setTargetCollegeName] = useState("");
  const [targetBranchCode, setTargetBranchCode] = useState("");
  const [targetBranchName, setTargetBranchName] = useState("");
  const [scriptText, setScriptText] = useState("");
  const [storyboardText, setStoryboardText] = useState("");
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
      setSelectedId(draft.id); setSelectedStatus(draft.status); setTitle(draft.title);
      setAudienceScope(draft.audienceScope ?? "ALL");
      setTargetCollegeCode(draft.targetCollegeCode ?? ""); setTargetCollegeName(draft.targetCollegeName ?? "");
      setTargetBranchCode(draft.targetBranchCode ?? ""); setTargetBranchName(draft.targetBranchName ?? "");
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

  async function importLessonPackage(file: File) {
    setError(""); setNotice("");
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError("The lesson package is too large. Choose a JSON file under 256 KB.");
      if (importFileRef.current) importFileRef.current.value = "";
      return;
    }
    setBusy(true);
    try {
      const packageText = await file.text();
      const packageData = JSON.parse(packageText) as unknown;
      const result = await request<{draft:DraftRecord}>("/admin/lesson-drafts/import", {
        method: "POST",
        body: JSON.stringify({ ...(packageData as Record<string, unknown>), fileName: file.name }),
      });
      await refreshDrafts();
      await openDraft(result.draft.id);
      setNotice("Imported " + file.name + " as an unpublished draft. Review it and publish when ready.");
    } catch (e) {
      setError((e as Error).message || "Could not import the lesson package.");
    } finally {
      setBusy(false);
      if (importFileRef.current) importFileRef.current.value = "";
    }
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

  function updateScene(index: number, patch: Partial<Scene>) {
    try {
      const value = JSON.parse(storyboardText) as { scenes: Scene[] };
      const scene = value.scenes[index];
      if (!scene) return;
      value.scenes[index] = { ...scene, ...patch };
      setStoryboardText(JSON.stringify(value, null, 2));
    } catch { /* Keep invalid JSON visible in the raw editor until corrected. */ }
  }

  function updateSceneVisual(index: number, patch: Partial<NonNullable<Scene["visual"]>>) {
    try {
      const value = JSON.parse(storyboardText) as { scenes: Scene[] };
      const scene = value.scenes[index];
      if (!scene) return;
      value.scenes[index] = { ...scene, visual: { ...scene.visual, ...patch } };
      setStoryboardText(JSON.stringify(value, null, 2));
    } catch { /* Keep invalid JSON visible in the raw editor until corrected. */ }
  }

  async function saveDraft() {
    if (!selectedId || selectedStatus !== "DRAFT") return;
    setError(""); setNotice("");
    let script: unknown, storyboard: unknown;
    try { script = JSON.parse(scriptText); } catch { setError("Script editor contains invalid JSON."); return; }
    try { storyboard = JSON.parse(storyboardText); } catch { setError("Storyboard editor contains invalid JSON."); return; }
    setBusy(true);
    try {
      await request(`/admin/lesson-drafts/${encodeURIComponent(selectedId)}`, {
        method: "PATCH", body: JSON.stringify({ title: title.trim(), script, storyboard, audienceScope, targetCollegeCode, targetCollegeName, targetBranchCode, targetBranchName }),
      });
      await refreshDrafts();
      setNotice("Draft saved and validated by the server. It is still unpublished.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function publishDraft() {
    if (!selectedId || selectedStatus !== "DRAFT") return;
    if (!window.confirm("Publish this reviewed lesson? Students will be able to see it immediately.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await request<{version:{version:number;versionId:string;sceneCount:number;uploadedObjectCount:number;reusedObjectCount:number}}>("/admin/lesson-drafts/" + encodeURIComponent(selectedId) + "/package/publish", { method: "POST", body: "{}" });
      setSelectedStatus("PUBLISHED");
      await refreshDrafts();
      setNotice("Published immutable lesson version " + result.version.version + " (" + result.version.sceneCount + " scenes). " + result.version.uploadedObjectCount + " objects uploaded, " + result.version.reusedObjectCount + " reused. Students can now load this verified version.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteDraft() {
    if (!selectedId || selectedStatus !== "DRAFT" || !window.confirm("Delete this unpublished lesson draft? This cannot be undone.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/admin/lesson-drafts/${encodeURIComponent(selectedId)}`, { method: "DELETE" });
      setDrafts(old => old.filter(item => item.id !== selectedId));
      setSelectedId(""); setSelectedStatus("DRAFT"); setTitle(""); setScriptText(""); setStoryboardText("");
      setNotice("Draft deleted.");
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }

  return <div className="stack admin-lesson-studio">
    <div className="admin-page-title"><div><p className="eyebrow">LESSON CONTENT WORKSHOP</p><h1>Lesson Studio</h1><p>Import a prepared static lesson package, then review and preview it before publishing.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshDrafts().catch(e => setError((e as Error).message))}>Refresh drafts</button></div>
    {error && <div className="admin-alert error" role="alert">{error}</div>}
    {notice && <div className="admin-alert success" role="status">{notice}</div>}
    <div className="admin-two-col lesson-studio-layout">
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">STEP 1 · IMPORT</p><h2>Prepared lesson package</h2></div></div>
        <p className="muted">Prepare lesson JSON on your authoring machine with the local static lesson generator or the documented package format. This admin flow imports and validates the finished package; it does not call a hosted lesson-writing model.</p>
        <label>Import finished lesson package (.json)<input ref={importFileRef} aria-label="Import finished lesson package" type="file" accept=".json,application/json" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (file) void importLessonPackage(file); }}/></label>
        <p className="muted">The package is saved as an unpublished draft. Review the script and storyboard, then publish it explicitly. Max 256 KB.</p>
        <p className="muted">Format: docs/STATIC_LESSON_IMPORT_FORMAT.md · Generator: api/scripts/generate_static_lesson.py</p>
      </section>
      <section className="admin-panel">
        <div className="admin-panel-head"><div><p className="eyebrow">DRAFT LIBRARY</p><h2>Saved drafts ({drafts.length})</h2></div></div>
        {!drafts.length ? <p className="muted">No drafts yet. Import a prepared lesson package to create the first draft.</p> :
          <div className="stack">{drafts.map(draft => <article className="study-material-admin-card" key={draft.id}>
            <div className="study-material-admin-main"><div><strong>{draft.title}</strong><p className="muted">{draft.subject} · {draft.topic}</p><small>{new Date(draft.updatedAt).toLocaleString()}</small></div><span className="status status-pending">{draft.status}</span></div>
            <button className="button button-secondary" disabled={busy} onClick={() => void openDraft(draft.id)}>Open draft</button>
          </article>)}</div>}
      </section>
    </div>
    {selectedId && <section className="admin-panel lesson-editor-panel">
      <div className="admin-panel-head"><div><p className="eyebrow">STEP 2 · REVIEW & PUBLISH</p><h2>Review lesson draft</h2><p>Edits are schema-validated by the API. Scene JSON is data only—not code.</p><span className="status status-pending">{selectedStatus}</span></div><div className="row wrap">{selectedStatus === "DRAFT" ? <><button className="primary" disabled={busy || !title.trim()} onClick={() => void saveDraft()}>Save draft</button><button className="button button-secondary" disabled={busy || !!parsedStoryboard.error || !parsedStoryboard.scenes.length} onClick={() => void publishDraft()}>Publish lesson</button><button className="button button-danger" disabled={busy} onClick={() => void deleteDraft()}>Delete draft</button></> : <strong className="status status-used">Published · Student visible</strong>}</div></div>
      <fieldset disabled={selectedStatus !== "DRAFT"} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
      <label>Lesson title<input value={title} onChange={e => setTitle(e.target.value)}/></label>
      <label>Content audience<select aria-label="Lesson audience scope" value={audienceScope} onChange={e => setAudienceScope(e.target.value as typeof audienceScope)}><option value="ALL">All students</option><option value="COLLEGE">One college</option><option value="BRANCH">One diploma branch</option></select></label>
      {audienceScope !== "ALL" && <div className="admin-two-col audience-target-fields">
        <label>College name<input value={targetCollegeName} onChange={e => setTargetCollegeName(e.target.value)} placeholder="Institution name"/></label>
        <label>College code<input value={targetCollegeCode} onChange={e => setTargetCollegeCode(e.target.value)} placeholder="Institute code"/></label>
        {audienceScope === "BRANCH" && <>
          <label>Diploma branch<input list="arctester-lesson-branches" value={targetBranchName} onChange={e => setTargetBranchName(e.target.value)} placeholder="Search or enter branch"/></label>
          <label>Branch code<input value={targetBranchCode} onChange={e => setTargetBranchCode(e.target.value)} placeholder="Branch code"/></label>
          <datalist id="arctester-lesson-branches">{AP_DIPLOMA_BRANCHES.map(item => <option key={item.code} value={item.name}>{item.code}</option>)}</datalist>
        </>}
        <small className="muted">College targets require a name or code. Branch targets require a branch name or code. College is optional for branch-wide content.</small>
      </div>}
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
            <label>Scene title<input aria-label={`Scene ${index + 1} title`} value={scene.title || ""} onChange={e => updateScene(index, { title: e.target.value })}/></label>
            <label>Scene type<select aria-label={`Scene ${index + 1} type`} value={scene.sceneType} onChange={e => updateScene(index, { sceneType: e.target.value })}><option value="title_card">Title card</option><option value="text_reveal">Text reveal</option><option value="diagram">Diagram</option><option value="equation">Equation</option><option value="step_sequence">Step sequence</option><option value="checkpoint">Checkpoint</option></select></label>
            <label>On-screen text<input aria-label={`Scene ${index + 1} on-screen text`} value={scene.onScreenText || ""} onChange={e => updateScene(index, { onScreenText: e.target.value })}/></label>
            <label>Narration<textarea aria-label={`Scene ${index + 1} narration`} rows={4} value={scene.narration || ""} onChange={e => updateScene(index, { narration: e.target.value })}/></label>
            <label>Duration (ms)<input aria-label={`Scene ${index + 1} duration`} type="number" min={2500} max={45000} step={500} value={scene.durationMs || 2500} onChange={e => updateScene(index, { durationMs: Number(e.target.value) })}/></label>
            <label>Diagram items (separate with |)<input aria-label={`Scene ${index + 1} diagram items`} value={scene.visual?.items?.join(" | ") || ""} onChange={e => updateSceneVisual(index, { items: e.target.value.split("|").map(x => x.trim()).filter(Boolean) })}/></label>
            <label>Equation<input aria-label={`Scene ${index + 1} equation`} value={scene.visual?.equation || ""} onChange={e => updateSceneVisual(index, { equation: e.target.value })}/></label>
            <label>Steps (one per line)<textarea aria-label={`Scene ${index + 1} steps`} rows={3} value={scene.visual?.steps?.join("\n") || ""} onChange={e => updateSceneVisual(index, { steps: e.target.value.split(/\r?\n/).map(x => x.trim()).filter(Boolean) })}/></label>
          </article>)}</div>}
      </div>
      </fieldset>
    </section>}
  </div>;
}
