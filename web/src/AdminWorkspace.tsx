import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import AdminSubjects, { type AdminCatalogSubject } from "./AdminSubjects";
import AdminQuestionBank, { type AdminBankQuestion } from "./AdminQuestionBank";
import AdminAnnouncements, { type AdminAnnouncement } from "./AdminAnnouncements";
import AdminModelLab, { type ModelLabDataset, type ModelLabJob } from "./AdminModelLab";
import AdminInvitations, { type AdminInvitation, type CreatedAdminInvitation } from "./AdminInvitations";
import AdminQuestionEditor, { type AdminQuestionForm } from "./AdminQuestionEditor";
import AdminExamManagement, { type AdminManagedExam, type AdminExamStudent, type AdminExamPreview } from "./AdminExamManagement";
import AdminResultsAnalytics, { type AdminExamResult } from "./AdminResultsAnalytics";
import AdminPaperBuilder, { type AdminPaperDraft, type AdminPaperQuestion, type AdminPaperDifficultyMix, type AdminPaperSubjectScoring } from "./AdminPaperBuilder";
import AdminQuestionImport, { type AdminImportReport } from "./AdminQuestionImport";
import AdminOverview from "./AdminOverview";
import AdminLiveMonitor, { type LiveSession } from "./AdminLiveMonitor";
import AdminReviewQueue, { type ReviewQueueItem } from "./AdminReviewQueue";
import { AP_ECET_CSE_2026_QUOTAS, canonicalPaperSubject, selectPaperQuestions } from "./apEcet2026";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
type Question = AdminPaperQuestion;

type Props = { email:string; theme:"light"|"dark"; setTheme:(v:"light"|"dark")=>void; signOut:()=>void; invitations:AdminInvitation[]; createInvitation:(e:FormEvent<HTMLFormElement>)=>void; inviteEmail:string; setInviteEmail:(v:string)=>void; createdInvitation:CreatedAdminInvitation|null; revokeInvitation:(id:string)=>void; busy:boolean };
async function api<T>(path:string, init:RequestInit={}):Promise<T>{
 const response=await fetch(API+path,{...init,credentials:"include",headers:{"content-type":"application/json",...init.headers}});
 const body=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(body.error||"Request failed.");
 return body as T;
}
export default function AdminWorkspace(p:Props){
 const [tab,setTab]=useState("overview"),[catalog,setCatalog]=useState<AdminCatalogSubject[]>([]),[questions,setQuestions]=useState<AdminBankQuestion[]>([]),[total,setTotal]=useState(0),[page,setPage]=useState(1),[query,setQuery]=useState(""),[subject,setSubject]=useState(""),[topic,setTopic]=useState(""),[difficulty,setDifficulty]=useState(""),[selected,setSelected]=useState<number[]>([]),[error,setError]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 const [uploadText,setUploadText]=useState(""),[uploadFormat,setUploadFormat]=useState<"csv"|"json">("csv"),[report,setReport]=useState<AdminImportReport|null>(null),[previewReady,setPreviewReady]=useState(false);
 const questionRequestSequence=useRef(0);
 const [form,setForm]=useState<AdminQuestionForm>({subject:"Mathematics",topic:"General",text:"",a:"",b:"",c:"",d:"",correctIndex:"0",difficulty:"medium",explanation:"",source:""});
 const [exam,setExam]=useState<AdminPaperDraft>({title:"",description:"",instructions:"Read each question carefully. Select one correct option.",duration:"180",shuffleQuestions:true,shuffleOptions:false,marks:"1",negative:"0.25",selectionMode:"manual",perSubject:""});
 const [examIds,setExamIds]=useState<number[]>([]),[exams,setExams]=useState<AdminManagedExam[]>([]),[subjectQuotas,setSubjectQuotas]=useState<Record<string,number>>({}),[difficultyMix,setDifficultyMix]=useState<AdminPaperDifficultyMix>({easy:30,medium:50,hard:20}),[subjectScoring,setSubjectScoring]=useState<AdminPaperSubjectScoring>({}),[students,setStudents]=useState<AdminExamStudent[]>([]),[assignmentExam,setAssignmentExam]=useState<string|null>(null),[assignedStudents,setAssignedStudents]=useState<number[]>([]),[availableFrom,setAvailableFrom]=useState(""),[dueAt,setDueAt]=useState(""),[preview,setPreview]=useState<AdminExamPreview|null>(null),[results,setResults]=useState<AdminExamResult[]>([]),[announcements,setAnnouncements]=useState<AdminAnnouncement[]>([]),[announcementTitle,setAnnouncementTitle]=useState(""),[announcementMessage,setAnnouncementMessage]=useState(""),[announcementExpiry,setAnnouncementExpiry]=useState(""),[announcementPublishAt,setAnnouncementPublishAt]=useState("");
 const [editingId,setEditingId]=useState<number|null>(null);
 const [modelDatasets,setModelDatasets]=useState<ModelLabDataset[]>([]);
 const [trainingJobs,setTrainingJobs]=useState<ModelLabJob[]>([]);
 const [reviewItems,setReviewItems]=useState<ReviewQueueItem[]>([]);
 const [liveSessions,setLiveSessions]=useState<LiveSession[]>([]);
 const [selectedLiveSessionId,setSelectedLiveSessionId]=useState<string|null>(null);
 const [liveSessionsTotal,setLiveSessionsTotal]=useState(0);
 const [liveSessionsLoading,setLiveSessionsLoading]=useState(false);
 const [liveSessionsUpdatedAt,setLiveSessionsUpdatedAt]=useState<string|null>(null);
 const [selectedDatasetId,setSelectedDatasetId]=useState("");
 const [trainingModelPrefix,setTrainingModelPrefix]=useState("ecet-readiness");
 const selectedSubject=catalog.find(s=>s.name===subject);
 const filteredTopics=selectedSubject?.topics??[];
 async function loadCatalog(){const r=await api<{subjects:AdminCatalogSubject[]}>("/admin/question-catalog");setCatalog(Array.isArray(r.subjects) ? r.subjects : []);}
 async function loadQuestions(nextPage=page){
  const requestId=++questionRequestSequence.current;
  const params=new URLSearchParams({page:String(nextPage),limit:"25"});
  if(query)params.set("q",query);
  if(subject)params.set("subject",subject);
  if(topic)params.set("topic",topic);
  if(difficulty)params.set("difficulty",difficulty);
  try {
   const r=await api<{questions:AdminPaperQuestion[];total:number}>("/admin/questions?"+params);
   if(requestId!==questionRequestSequence.current)return;
   setQuestions(Array.isArray(r.questions) ? r.questions : []);
   setTotal(Number.isFinite(r.total) ? r.total : 0);
   setPage(nextPage);
  } catch(error) {
   if(requestId===questionRequestSequence.current)throw error;
  }
 }
 async function loadExams(){const r=await api<{exams:AdminManagedExam[]}>("/admin/exams");setExams(Array.isArray(r.exams) ? r.exams : []);}
 async function loadStudents(){const r=await api<{students:AdminExamStudent[]}>("/admin/students");setStudents(Array.isArray(r.students) ? r.students : []);}
 async function loadResults(){const r=await api<{results:AdminExamResult[]}>("/admin/exam-results");setResults(Array.isArray(r.results) ? r.results : []);}
 async function loadAnnouncements(){const r=await api<{announcements:AdminAnnouncement[]}>("/admin/announcements");setAnnouncements(Array.isArray(r.announcements) ? r.announcements : []);}
 async function createAnnouncement(e:FormEvent){e.preventDefault();await run(async()=>{await api("/admin/announcements",{method:"POST",body:JSON.stringify({title:announcementTitle,message:announcementMessage,startsAt:announcementPublishAt?new Date(announcementPublishAt).toISOString():undefined,expiresAt:announcementExpiry?new Date(announcementExpiry).toISOString():null})});setAnnouncementTitle("");setAnnouncementMessage("");setAnnouncementExpiry("");setAnnouncementPublishAt("");setNotice(announcementPublishAt?"Announcement scheduled.":"Announcement published.");await loadAnnouncements();});}
 async function deleteAnnouncement(id:string){await run(async()=>{await api("/admin/announcements/"+id,{method:"DELETE"});await loadAnnouncements();});}
 async function assignExam(){if(!assignmentExam||!assignedStudents.length)return;await run(async()=>{await api("/admin/exams/"+assignmentExam+"/assign",{method:"POST",body:JSON.stringify({studentIds:assignedStudents,availableFrom:availableFrom?new Date(availableFrom).toISOString():undefined,dueAt:dueAt?new Date(dueAt).toISOString():undefined})});setNotice("Exam assigned to "+assignedStudents.length+" student(s).");setAssignmentExam(null);setAssignedStudents([]);setAvailableFrom("");setDueAt("");await loadExams();});}
 useEffect(()=>{void Promise.all([loadCatalog(),loadQuestions(1),loadExams(),loadStudents(),loadResults(),loadAnnouncements()]).catch(e=>setError(e.message));},[]);
 async function loadModelLab(){const [d,j]=await Promise.all([api<{datasets:ModelLabDataset[]}>("/admin/model-datasets"),api<{jobs:ModelLabJob[]}>("/admin/model-training-jobs")]);setModelDatasets(d.datasets??[]);setTrainingJobs(j.jobs??[]);if(!selectedDatasetId&&d.datasets?.[0])setSelectedDatasetId(d.datasets[0].id);}
 async function loadReviewQueue(){const r=await api<{submissions:ReviewQueueItem[]}>("/admin/submissions/review-required");setReviewItems(r.submissions??[]);}
 async function loadLiveSessions(){setLiveSessionsLoading(true);try{const r=await api<{sessions:LiveSession[];total:number;serverTime:string}>("/admin/exams/live-sessions?page=1&limit=50&eventLimit=100");setLiveSessions(Array.isArray(r.sessions)?r.sessions:[]);setLiveSessionsTotal(Number.isFinite(r.total)?r.total:0);setLiveSessionsUpdatedAt(r.serverTime||new Date().toISOString());}finally{setLiveSessionsLoading(false);}}
 useEffect(()=>{if(tab==="model-lab")void loadModelLab().catch(e=>setError(e.message));if(tab==="review-queue")void loadReviewQueue().catch(e=>setError(e.message));},[tab]);
 useEffect(()=>{if(tab!=="live-monitor")return;let active=true;const refresh=()=>{if(active)void loadLiveSessions().catch(e=>setError(e.message));};refresh();const timer=window.setInterval(refresh,15000);return()=>{active=false;window.clearInterval(timer);};},[tab]);
 async function queueTensorflowTraining(){if(!selectedDatasetId)throw new Error("Register a dataset before queueing training.");await run(async()=>{const r=await api<{job:ModelLabJob}>(`/admin/model-datasets/${encodeURIComponent(selectedDatasetId)}/tensorflow-jobs`,{method:"POST",body:JSON.stringify({modelId:`${trainingModelPrefix}-tensorflow`,seed:42,epochs:80,batchSize:32})});setNotice(`TensorFlow.js job ${r.job.id} queued.`);await loadModelLab();});}
 async function releaseReviewItem(id:string){await run(async()=>{await api(`/admin/submissions/${encodeURIComponent(id)}/release`,{method:"POST",body:JSON.stringify({})});await loadReviewQueue();setNotice("Submission approved and released.");});}
 useEffect(()=>{const t=setTimeout(()=>{void loadQuestions(1).catch(e=>setError(e.message));},220);return()=>clearTimeout(t);},[query,subject,topic,difficulty]);
 async function run(action:()=>Promise<void>){setBusy(true);setError("");setNotice("");try{await action();}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 async function saveQuestion(e:FormEvent){e.preventDefault();await run(async()=>{const payload={subject:form.subject,topic:form.topic,text:form.text,options:[form.a,form.b,form.c,form.d],correctIndex:Number(form.correctIndex),difficulty:form.difficulty,explanation:form.explanation,source:form.source};await api(editingId?"/admin/questions/"+editingId:"/admin/questions",{method:editingId?"PUT":"POST",body:JSON.stringify(payload)});setNotice(editingId?"Question updated.":"Question added to the bank.");setEditingId(null);setForm({...form,text:"",a:"",b:"",c:"",d:"",explanation:""});await Promise.all([loadCatalog(),loadQuestions(1)]);setTab("questions");});}
 function editQuestion(q:Question){setEditingId(q.id);setForm({subject:q.subject,topic:q.topic,text:q.text,a:q.options[0]||"",b:q.options[1]||"",c:q.options[2]||"",d:q.options[3]||"",correctIndex:String(q.correctIndex),difficulty:q.difficulty,explanation:q.explanation,source:q.source});setTab("add");}
 async function previewImport(){await run(async()=>{const r=await api<{report:AdminImportReport}>("/admin/questions/import/preview",{method:"POST",body:JSON.stringify({format:uploadFormat,content:uploadText})});setReport(r.report);setPreviewReady(true);setNotice("Preview ready. No questions have been added yet.");});}
 async function confirmImport(){await run(async()=>{const r=await api<{report:{added:number;duplicates:number;invalid:{row:number;reason:string}[];total:number}}>("/admin/questions/import",{method:"POST",body:JSON.stringify({format:uploadFormat,content:uploadText})});setReport(r.report);setPreviewReady(false);setNotice("Import committed. Review the final row report.");await Promise.all([loadCatalog(),loadQuestions(1)]);});}
 async function readFile(file:File){const ext=file.name.toLowerCase().split(".").pop();setUploadFormat(ext==="json"?"json":"csv");setUploadText(await file.text());setReport(null);setPreviewReady(false);}
 function downloadTemplate(format:"csv"|"json"){const sample=format==="csv"?["subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty","Mathematics,Algebra,What is 2 + 2?,1,2,3,4,3,Basic addition,ECET practice,easy"].join("\n"):JSON.stringify([{subject:"Mathematics",topic:"Algebra",text:"What is 2 + 2?",options:["1","2","3","4"],correctIndex:3,explanation:"Basic addition.",source:"ECET practice",difficulty:"easy"}],null,2);const blob=new Blob([sample],{type:format==="csv"?"text/csv":"application/json"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="arctester-question-template."+format;a.click();URL.revokeObjectURL(url);}
 async function deleteSelected(){if(!selected.length)return;await run(async()=>{const r=await api<{deleted:number;blocked:number[]}>("/admin/questions/bulk-delete",{method:"POST",body:JSON.stringify({ids:selected})});setNotice(`Deleted ${r.deleted} questions. ${r.blocked.length} historical questions were protected.`);await Promise.all([loadQuestions(1),loadCatalog()]);});}
 async function createExam(e:FormEvent){e.preventDefault();await run(async()=>{let ids=examIds;if(exam.selectionMode==="random"){const per=Number(exam.perSubject)||10;const first=await api<{questions:Question[];pages:number}>("/admin/questions?limit=100&page=1");const pool=[...first.questions];for(let n=2;n<=first.pages;n++){const next=await api<{questions:Question[]}>("/admin/questions?limit=100&page="+n);pool.push(...next.questions);}const selection=selectPaperQuestions(pool,subjectQuotas,per,difficultyMix,Date.now(),Object.keys(subjectQuotas).length!==Object.keys(AP_ECET_CSE_2026_QUOTAS).length);if(selection.shortfalls.length){const details=selection.shortfalls.map(item=>`${item.subject}: ${item.available}/${item.requested}`).join("; ");throw new Error(`Question bank shortfall — ${details}. Add questions or adjust quotas before saving this paper.`);}ids=selection.ids;}
 if(!ids.length)throw new Error("Select questions or switch to automatic generation.");
 await api("/admin/exams",{method:"POST",body:JSON.stringify({title:exam.title,description:exam.description,instructions:exam.instructions,durationMinutes:Number(exam.duration),shuffleQuestions:exam.shuffleQuestions,shuffleOptions:exam.shuffleOptions,subjectRules:subjectScoring,questions:ids.map(questionId=>({questionId,marks:Number(exam.marks),negativeMarks:Number(exam.negative)}))})});
 setNotice("Mock test saved as a draft. Review and publish it from Exam management.");setExamIds([]);setTab("exams");await loadExams();});}
 async function publish(id:string){await run(async()=>{await api(`/admin/exams/${id}/publish`,{method:"POST"});setNotice("Exam version published. It is now ready for assignment.");await loadExams();});}
 async function openPreview(id:string){await run(async()=>{const r=await api<{exam:AdminExamPreview}>("/admin/exams/"+id+"/preview");setPreview(r.exam);});}
 function toggleId(id:number){setExamIds(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);}
 function toggleSelected(id:number){setSelected(old=>old.includes(id)?old.filter(x=>x!==id):[...old,id]);}
 const stats=useMemo(()=>({subjects:catalog.length,topics:catalog.reduce((n,s)=>n+s.topics.length,0),questions:catalog.reduce((n,s)=>n+s.count,0)}),[catalog]);
 const nav=[["overview","Overview","⌂"],["questions","Question bank","▤"],["add","Add question","＋"],["import","Import questions","⇧"],["builder","Mock test builder","✦"],["exams","Exam management","▣"],["results","Results & analytics","◉"],["announcements","Announcements","◈"],["subjects","Subjects & topics","◫"],["invitations","Student access","♙"],["review-queue","Review queue","✓"],["live-monitor","Live invigilation","◉"],["model-lab","Model lab","⌁"]];
 return <div className="admin-shell">
  <aside className="admin-sidebar"><div className="admin-brand"><span className="brand-mark">A</span><div><b>ArcTester</b><small>EXAMINER CONSOLE</small></div></div>
   <div className="admin-nav-label">WORKSPACE</div>{nav.map(([id,label,icon])=><button key={id} aria-label={label} className={tab===id?"admin-nav active":"admin-nav"} onClick={()=>setTab(id)}><span>{icon}</span>{label}{id==="questions"&&<small aria-hidden="true">{stats.questions}</small>}</button>)}
   <div className="sidebar-bottom"><span className="admin-avatar">{p.email.slice(0,1).toUpperCase()}</span><div><b>Administrator</b><small>{p.email}</small></div></div>
  </aside>
  <main className="admin-main"><header className="admin-topbar"><div><span className="admin-crumb">ArcTester /</span> <b>{nav.find(n=>n[0]===tab)?.[1]}</b></div><div className="top-actions"><button className="icon-button" onClick={()=>p.setTheme(p.theme==="light"?"dark":"light")} title="Toggle theme">{p.theme==="light"?"☾":"☀"}</button><span className="user-email">{p.email}</span><button className="ghost" onClick={p.signOut}>Sign out</button></div></header>
  <div className="admin-content">
   {error&&<div className="admin-alert error">{error}</div>}{notice&&<div role="status" aria-live="polite" className="admin-alert success">{notice}<button onClick={()=>setNotice("")}>×</button></div>}
   {tab==="live-monitor"&&<AdminLiveMonitor
    sessions={liveSessions}
    total={liveSessionsTotal}
    loading={liveSessionsLoading}
    updatedAt={liveSessionsUpdatedAt}
    selectedSessionId={selectedLiveSessionId}
    onSelectSession={setSelectedLiveSessionId}
    onRefresh={() => void loadLiveSessions()}
   />}
   {tab==="review-queue"&&<AdminReviewQueue
    items={reviewItems}
    busy={busy}
    onRefresh={() => void loadReviewQueue()}
    onRelease={(id) => void releaseReviewItem(id)}
   />}
   {tab==="model-lab"&&<AdminModelLab datasets={modelDatasets} jobs={trainingJobs} selectedDatasetId={selectedDatasetId} modelPrefix={trainingModelPrefix} busy={busy} onDatasetChange={setSelectedDatasetId} onModelPrefixChange={setTrainingModelPrefix} onQueueTraining={() => void queueTensorflowTraining()} onRefresh={() => void loadModelLab()} />}
   {tab==="overview"&&<AdminOverview
    stats={stats}
    exams={exams}
    invitationsCount={p.invitations.length}
    catalog={catalog}
    onNavigate={(nextTab) => setTab(nextTab)}
   />}
   {tab==="questions"&&<AdminQuestionBank
    questions={questions}
    total={total}
    page={page}
    query={query}
    subject={subject}
    topic={topic}
    difficulty={difficulty}
    catalog={catalog}
    filteredTopics={filteredTopics}
    selected={selected}
    busy={busy}
    onQueryChange={setQuery}
    onSubjectChange={(value) => { setSubject(value); setTopic(""); }}
    onTopicChange={setTopic}
    onDifficultyChange={setDifficulty}
    onToggleSelected={toggleSelected}
    onDeleteSelected={() => void deleteSelected()}
    onEditQuestion={editQuestion}
    onUpload={() => setTab("import")}
    onPageChange={(value) => void loadQuestions(value)}
   />}
   {tab==="add"&&<AdminQuestionEditor form={form} editing={editingId !== null} busy={busy} onChange={(field, value) => setForm((current) => ({ ...current, [field]: value }))} onSubmit={(event) => void saveQuestion(event)} onBack={() => { setEditingId(null); setTab("questions"); }} />}
   {tab==="import"&&<AdminQuestionImport
    uploadText={uploadText}
    uploadFormat={uploadFormat}
    previewReady={previewReady}
    report={report}
    busy={busy}
    onReadFile={readFile}
    onTextChange={setUploadText}
    onFormatChange={setUploadFormat}
    onLoadExample={() => setUploadText(["subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty","Mathematics,Algebra,What is 2 + 2?,1,2,3,4,3,Basic addition,ECET practice,easy"].join("\n"))}
    onDownloadTemplate={downloadTemplate}
    onPreview={() => void previewImport()}
    onConfirm={() => void confirmImport()}
    onCancelPreview={() => setPreviewReady(false)}
   />}
   {tab==="builder"&&<AdminPaperBuilder
    exam={exam}
    examIds={examIds}
    catalog={catalog}
    questions={questions}
    page={page}
    subject={subject}
    difficulty={difficulty}
    subjectQuotas={subjectQuotas}
    difficultyMix={difficultyMix}
    subjectScoring={subjectScoring}
    busy={busy}
    onExamChange={(field, value) => setExam((current) => ({ ...current, [field]: value }))}
    onLoadPreset={() => { setExam((current) => ({ ...current, selectionMode: "random", duration: "180", negative: "0" })); setSubjectQuotas(AP_ECET_CSE_2026_QUOTAS); }}
    onSelectionModeChange={(value) => setExam((current) => ({ ...current, selectionMode: value }))}
    onSubjectQuotaChange={(name, value) => setSubjectQuotas((current) => ({ ...current, [canonicalPaperSubject(name)]: Math.max(0, value) }))}
    onDifficultyMixChange={(level, value) => setDifficultyMix((current) => ({ ...current, [level]: Math.max(0, Math.min(100, value)) }))}
    onSubjectChange={(value) => { setSubject(value); setTopic(""); }}
    onDifficultyChange={setDifficulty}
    onSelectVisible={() => setExamIds((current) => Array.from(new Set([...current, ...questions.map((question) => question.id)])))}
    onToggleQuestion={toggleId}
    onPageChange={(value) => void loadQuestions(value)}
    onSubjectScoringChange={(name, rule) => setSubjectScoring((current) => ({ ...current, [name]: rule }))}
    onSubmit={(event) => void createExam(event)}
   />}
   {tab==="exams"&&<AdminExamManagement exams={exams} students={students} assignmentExam={assignmentExam} assignedStudents={assignedStudents} availableFrom={availableFrom} dueAt={dueAt} preview={preview} busy={busy} onNewExam={() => setTab("builder")} onPreview={(id) => void openPreview(id)} onPublish={(id) => void publish(id)} onToggleAssignment={(id) => { setAssignmentExam(assignmentExam === id ? null : id); setAssignedStudents([]); }} onToggleStudent={(id, checked) => setAssignedStudents((current) => checked ? [...current, id] : current.filter((studentId) => studentId !== id))} onAvailableFromChange={setAvailableFrom} onDueAtChange={setDueAt} onCancelAssignment={() => setAssignmentExam(null)} onAssign={() => void assignExam()} onClosePreview={() => setPreview(null)} />}
   {tab==="results"&&<AdminResultsAnalytics results={results} onRefresh={() => void loadResults()} />}
   {tab==="announcements"&&<AdminAnnouncements announcements={announcements} title={announcementTitle} message={announcementMessage} expiry={announcementExpiry} publishAt={announcementPublishAt} busy={busy} onTitleChange={setAnnouncementTitle} onMessageChange={setAnnouncementMessage} onExpiryChange={setAnnouncementExpiry} onPublishAtChange={setAnnouncementPublishAt} onCreate={createAnnouncement} onRefresh={() => void loadAnnouncements()} onDelete={(id) => void deleteAnnouncement(id)} />}
   {tab==="subjects"&&<AdminSubjects catalog={catalog} onRefresh={() => void loadCatalog()} />}
   {tab==="invitations"&&<AdminInvitations invitations={p.invitations} inviteEmail={p.inviteEmail} createdInvitation={p.createdInvitation} busy={p.busy} onInviteEmailChange={p.setInviteEmail} onCreate={p.createInvitation} onRevoke={p.revokeInvitation} />}
  
  </div></main></div>;
}
