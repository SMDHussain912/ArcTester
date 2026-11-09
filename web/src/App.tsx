import { useEffect, useRef, useState } from "react";
import { xlsxToCsv } from "./xlsx";
import { mergeAssignedExamAnswers } from "../lib/answerRecovery";
import { classifyAssignmentHeartbeatFailure } from "./assignedExamHeartbeat";
import { safeStorage } from "./safeStorage";
import type { FormEvent } from "react";
import AdminWorkspace from "./AdminWorkspace";
import AssignedExams from "./AssignedExams";

const API = (import.meta.env.VITE_API_URL || "http://localhost:4000").replace(/\/+$/, "");
type User = { id: number; email: string; role: "ADMIN" | "STUDENT" };
type Announcement = { id:string; title:string; message:string; expiresAt:string|null };
type Bank = { total: number; subjects: { subject: string; count: number }[] };
type Invitation = {
  id: string;
  email: string;
  expiresAt: string;
  usedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
  status: "PENDING" | "USED" | "REVOKED" | "EXPIRED";
};
type CreatedInvitation = { id: string; email: string; token: string; expiresAt: string };
type Announcement = { id: string; title: string; message: string; createdAt: string; publishedAt: string; expiresAt: string | null; seenAt?: string | null };
type AdminQuestion = { id: number; subject: string; topic: string | null; text: string; options: string[]; correctIndex?: number; explanation?: string; source?: string; difficulty?: string };
type AdminSubject = { id: number; name: string; questionCount: number; topics: { id: number; name: string }[] };
type AdminStudent = { id: number; email: string };
type ReviewRequiredSubmission = { submissionId: string; assignmentId: string; studentId: number; studentEmail: string; examTitle: string; submittedAt: string; receivedAt: string; score: number | null; maximumScore: number | null };
type AssignedExam = { id: string; status: string; assignedAt: string; availableFrom: string | null; dueAt: string | null; exam: { id: string; title: string; description: string }; version: number; durationMinutes: number; questionCount: number; submission: { id: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string } | null };
type AssignedExamPackage = { assignmentId: string; title: string; description: string; version: number; instructions: string; durationMinutes: number; availableFrom: string | null; dueAt: string | null; serverTime: string; questions: { id: string; position: number; subject: string; topic: string | null; text: string; options: string[]; marks: number; negativeMarks: number }[] };
type AssignedExamResult = { submissionId: string; status: string; score: number | null; maximumScore: number | null; submittedAt: string; questions: { id: string; position: number; text: string; options: string[]; correctIndex: number; explanation: string; selectedIndex: number | null; isCorrect: boolean; awardedMarks: number; marks: number; negativeMarks: number }[] };
type AdminExam = {
  id: string;
  title: string;
  description: string;
  status: string;
  versions: { id: string; version: number; publishedAt: string | null; durationMinutes: number; _count: { questions: number; assignments: number } }[];
};
type AdminAnalytics = {
  totals: { students: number; exams: number; assignments: number; submissions: number; reviewRequired: number; submissionRate: number; averagePercentage: number | null };
  exams: { examId: string; title: string; assigned: number; submitted: number; submissionRate: number; averagePercentage: number | null }[];
  recentSubmissions: { submissionId: string; studentEmail: string; examTitle: string; submittedAt: string; score: number | null; maximumScore: number | null; status: string }[];
};
type ModelDataset = {
  id: string; name: string; task: "regression" | "binary-classification"; rowCount: number; datasetKind: "synthetic" | "real-anonymized";
  sourceDescription: string; sourceAttested: boolean; fingerprint: string; createdById: number | null; createdAt: string;
  featureSchema: { name: string; type: "numeric" | "categorical"; categories?: string[] }[];
};
type ModelTrainingJob = {
  id: string; datasetId: string; modelId: string; status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
  progress: number; errorMessage: string; createdAt: string; startedAt: string | null; completedAt: string | null;
  result: { productionEligible: boolean; reason: string; candidate: { mae: number; rmse: number }; baseline: { mae: number; rmse: number }; model: { version: number } | null } | null;
};
type RegisteredModel = {
  modelId: string; version: number; algorithm: string; task: string; dataset: string;
  isActive: boolean; createdAt: string; activatedAt: string | null;
};
type ModelAuditEvent = {
  id: string; actorId: number | null; modelId: string; version: number;
  action: string; details: Record<string, unknown>; createdAt: string;
};
type ModelDriftReport = {
  modelId: string; version: number; baselineDataset: string; windowDays: number;
  overall: "NO_DATA" | "LOW" | "MODERATE" | "HIGH";
  features: Array<{
    featureName: string; sampleCount: number; psi: number | null;
    status: "NO_DATA" | "LOW" | "MODERATE" | "HIGH";
    expected: Record<string, number>; observed: Record<string, number>;
  }>;
};
type TrainedCandidate = {
  modelId: string; version: number; algorithm: string; isActive: boolean; rank: number;
  trainRows: number; testRows: number; heldOutMetrics: object;
  crossValidation: object | null; parameters: Record<string, number> | null;
};
type ModelEvaluationReport = {
  status: "PASSED" | "REJECTED"; evaluationDataset: string; datasetFingerprint: string;
  sampleCount: number; candidateVersion: number; baselineVersion: number;
  candidateMetrics: Record<string, number | null>; baselineMetrics: Record<string, number | null>;
  acceptanceRule: string; evaluatedAt: string;
};
type LiveSession = {
  id: string; status: string; student: { id: number; email: string }; exam: { id: string; title: string };
  assignmentId: string; startedAt: string | null; lastHeartbeatAt: string | null; connectivity: string;
  heartbeatCount: number; focusLossCount: number; disconnectCount: number;
  submission: { id: string; status: string } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { email: string; role: string } | null }[];
};
type ExamAttendance = {
  assignmentId: string; candidate: { id: number; email: string }; exam: { id: string; title: string };
  version: number; questionCount: number; assignedAt: string; availableFrom: string | null; dueAt: string | null;
  attendanceStatus: string; connectivity: string;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string; score: number | null; maximumScore: number | null } | null;
};
type SessionAudit = {
  assignmentId: string; candidate: { id: number; email: string }; exam: { title: string }; version: number;
  session: { id: string; status: string; startedAt: string | null; lastHeartbeatAt: string | null; endedAt: string | null; heartbeatCount: number; focusLossCount: number; disconnectCount: number } | null;
  submission: { id: string; status: string; submittedAt: string; receivedAt: string; score: number | null; maximumScore: number | null } | null;
  events: { id: string; type: string; detail: string; createdAt: string; actor: { id: number; email: string; role: string } | null }[];
};
type Question = {
  id: number;
  subject: string;
  topic: string | null;
  text: string;
  options: string[];
};
type Test = {
  attemptId: number;
  mode: string;
  deadline: string | null;
  questions: Question[];
  warnings: string[];
};
type RestoredTest = Omit<Test, "warnings"> & { warnings?: string[]; serverNow: string; saved: { questionId: number; selectedIndex: number | null }[] };
function practiceAnswersKey(attemptId: number | string): string { return `arctester-practice-answers-${attemptId}`; }
function assignedAnswersKey(assignmentId: string): string { return `arctester-assignment-answers-${assignmentId}`; }
function assignedAttemptKey(assignmentId: string): string { return `arctester-assigned-attempt-${assignmentId}`; }
type Result = {
  attemptId: number;
  score: number;
  total: number;
  breakdown: { subject: string; correct: number; total: number }[];
  questions: {
    questionId: number;
    text: string;
    options: string[];
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[];
};

function browserDeviceFingerprint(): string {
  const key = "arctester-device-fingerprint";
  const existing = safeStorage.getItem(key);
  if (existing) return existing;
  const fingerprint =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  safeStorage.setItem(key, fingerprint);
  return fingerprint;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "The request failed.");
  return body as T;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [activeAnnouncements, setActiveAnnouncements] = useState<Announcement[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [createdInvitation, setCreatedInvitation] = useState<CreatedInvitation | null>(null);
  const [adminAnalytics, setAdminAnalytics] = useState<AdminAnalytics | null>(null);
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [examAttendance, setExamAttendance] = useState<ExamAttendance[]>([]);
  const [sessionAudit, setSessionAudit] = useState<SessionAudit | null>(null);
  const [sessionActionBusy, setSessionActionBusy] = useState<string | null>(null);
  const [adminQuestions, setAdminQuestions] = useState<AdminQuestion[]>([]);
  const [adminSubjects, setAdminSubjects] = useState<AdminSubject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState("");
  const [newTopicName, setNewTopicName] = useState("");
  const [newTopicSubjectId, setNewTopicSubjectId] = useState(0);
  const [editingQuestionId, setEditingQuestionId] = useState<number | null>(null);
  const [assignmentAvailableFrom, setAssignmentAvailableFrom] = useState("");
  const [assignmentDueAt, setAssignmentDueAt] = useState("");
  const [adminStudents, setAdminStudents] = useState<AdminStudent[]>([]);
  const [adminStudentPage, setAdminStudentPage] = useState(1);
  const [adminStudentSearch, setAdminStudentSearch] = useState("");
  const [adminStudentTotal, setAdminStudentTotal] = useState(0);
  const [reviewQueue, setReviewQueue] = useState<ReviewRequiredSubmission[]>([]);
  const [reviewQueuePage, setReviewQueuePage] = useState(1);
  const [reviewQueueTotal, setReviewQueueTotal] = useState(0);
  const [liveSessionsPage, setLiveSessionsPage] = useState(1);
  const [liveSessionsTotal, setLiveSessionsTotal] = useState(0);
  const [attendancePage, setAttendancePage] = useState(1);
  const [attendanceTotal, setAttendanceTotal] = useState(0);
  const [adminExams, setAdminExams] = useState<AdminExam[]>([]);
  const [assignedExams, setAssignedExams] = useState<AssignedExam[]>([]);
  const [assignmentResult, setAssignmentResult] = useState<AssignedExamResult | null>(null);
  const [assignmentResultForId, setAssignmentResultForId] = useState<string | null>(null);
  const [activeAssignmentPackage, setActiveAssignmentPackage] = useState<AssignedExamPackage | null>(null);
  const [assignmentAnswers, setAssignmentAnswers] = useState<Record<string, number>>({});
  const [assignmentStartedAt, setAssignmentStartedAt] = useState<string | null>(null);
  const [assignmentDeadline, setAssignmentDeadline] = useState<string | null>(null);
  const [assignmentServerOffset, setAssignmentServerOffset] = useState(0);
  const [assignmentSessionPaused, setAssignmentSessionPaused] = useState(false);
  const [assignmentClock, setAssignmentClock] = useState(Date.now());
  const [assignmentAutoSubmitTriggered, setAssignmentAutoSubmitTriggered] = useState(false);
  const [examTitle, setExamTitle] = useState("");
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [examDescription, setExamDescription] = useState("");
  const [examInstructions, setExamInstructions] = useState("");
  const [examDuration, setExamDuration] = useState(180);
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<number[]>([]);
  const [examQuestionSearch, setExamQuestionSearch] = useState("");
  const [examMarks, setExamMarks] = useState(1);
  const [examNegativeMarks, setExamNegativeMarks] = useState(0);
  const [examQuestionScoring, setExamQuestionScoring] = useState<Record<number, { marks: number; negativeMarks: number }>>({});
  const [shuffleExamQuestions, setShuffleExamQuestions] = useState(false);
  const [shuffleExamOptions, setShuffleExamOptions] = useState(false);
  const [questionSubject, setQuestionSubject] = useState("Computer Science");
  const [questionTopic, setQuestionTopic] = useState("General");
  const [questionText, setQuestionText] = useState("");
  const [questionOptions, setQuestionOptions] = useState(["", "", "", ""]);
  const [questionCorrectIndex, setQuestionCorrectIndex] = useState(0);
  const [questionExplanation, setQuestionExplanation] = useState("");
  const [questionDifficulty, setQuestionDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [questionSaved, setQuestionSaved] = useState(false);
  const [importText, setImportText] = useState("");
  const [importFormat, setImportFormat] = useState<"csv" | "json">("csv");
  const [importReport, setImportReport] = useState<{ added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } | null>(null);
  const [importPreviewReady, setImportPreviewReady] = useState(false);
  const [importPreviewError, setImportPreviewError] = useState("");
  const [importPreviewDetails, setImportPreviewDetails] = useState<{ valid: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [bankSubjectFilter, setBankSubjectFilter] = useState("all");
  const [bankSearch, setBankSearch] = useState("");
  const [selectedBankQuestionIds, setSelectedBankQuestionIds] = useState<number[]>([]);
  const [bulkDifficulty, setBulkDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [subjectQuotas, setSubjectQuotas] = useState<Record<string, number>>({});
  const [difficultyMix, setDifficultyMix] = useState<"any" | "balanced" | "easy" | "medium" | "hard">("any");
  const [practiceSubjects, setPracticeSubjects] = useState<string[]>([]);
  const [practiceTopicKeys, setPracticeTopicKeys] = useState<string[]>([]);
  const [practiceQuestionCount, setPracticeQuestionCount] = useState(20);
  const [practiceDifficulty, setPracticeDifficulty] = useState<"any" | "easy" | "medium" | "hard">("any");
  const [topicSelectionMode, setTopicSelectionMode] = useState<"all" | "include" | "exclude">("all");
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<number[]>([]);
  const [assigningExamId, setAssigningExamId] = useState("");
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementExpiresAt, setAnnouncementExpiresAt] = useState("");
  const [register, setRegister] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [practiceClock, setPracticeClock] = useState(Date.now());
  const practiceAutoSubmitRef = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [assignmentSaveStatus, setAssignmentSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const assignmentSaveSequenceRef = useRef(0);
  const assignmentSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const assignmentAnswersRevisionRef = useRef(0);
  const [activePage, setActivePage] = useState<"dashboard" | "practice" | "question-bank" | "subjects" | "exams" | "live-sessions" | "attendance" | "review-queue" | "announcements" | "invitations" | "assigned-exams" | "model-lab">("dashboard");
  const [modelDatasets, setModelDatasets] = useState<ModelDataset[]>([]);
  const [modelTrainingJobs, setModelTrainingJobs] = useState<ModelTrainingJob[]>([]);
  const [registeredModels, setRegisteredModels] = useState<RegisteredModel[]>([]);
  const [modelDatasetName, setModelDatasetName] = useState("ecet-holdout-v1");
  const [modelDatasetTask, setModelDatasetTask] = useState<"regression" | "binary-classification">("binary-classification");
  const [modelDatasetTargetColumn, setModelDatasetTargetColumn] = useState("target_readiness_label");
  const [modelFeatureSchemaJson, setModelFeatureSchemaJson] = useState('[{"name":"practice_score","type":"numeric"}]');
  const [modelSamplesJson, setModelSamplesJson] = useState(JSON.stringify(
    Array.from({ length: 40 }, (_, index) => ({
      features: { practice_score: index },
      target: index >= 20 ? 1 : 0,
    })),
    null,
    2,
  ));
  const [modelDatasetSource, setModelDatasetSource] = useState("");
  const [modelDatasetAttested, setModelDatasetAttested] = useState(false);
  const [modelCandidateId, setModelCandidateId] = useState("");
  const [trainingModelPrefix, setTrainingModelPrefix] = useState("ecet-readiness");
  const [modelCandidateVersion, setModelCandidateVersion] = useState("2");
  const [modelBaselineVersion, setModelBaselineVersion] = useState("1");
  const [modelEvaluationDatasetId, setModelEvaluationDatasetId] = useState("");
  const [modelEvaluationReport, setModelEvaluationReport] = useState<ModelEvaluationReport | null>(null);
  const [trainedCandidates, setTrainedCandidates] = useState<TrainedCandidate[]>([]);
  const [modelAuditId, setModelAuditId] = useState("");
  const [modelAuditEvents, setModelAuditEvents] = useState<ModelAuditEvent[]>([]);
  const [modelAuditLoading, setModelAuditLoading] = useState(false);
  const [modelDriftReport, setModelDriftReport] = useState<ModelDriftReport | null>(null);
  const [modelDriftLoading, setModelDriftLoading] = useState(false);
  const [modelLabLoading, setModelLabLoading] = useState(false);
  const [modelLabNotice, setModelLabNotice] = useState("");
  const [theme, setTheme] = useState<"light" | "dark">(
    () => (safeStorage.getItem("arctester-theme") as "light" | "dark") || "light"
  );

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    safeStorage.setItem("arctester-theme", theme);
  }, [theme]);

  useEffect(() => {
    request<{ user: User }>("/auth/me")
      .then(({ user: current }) => setUser(current))
      .catch(() => setUser(null));
  }, []);

  useEffect(() => {
    if (!user) return;
    request("/auth/devices/register", {
      method: "POST",
      body: JSON.stringify({
        deviceName: "Web browser",
        platform: "web",
        fingerprint: browserDeviceFingerprint(),
      }),
    }).catch((cause) => setError((cause as Error).message));
    request<Bank>("/bank")
      .then(setBank)
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  useEffect(() => {
    if (user?.role !== "STUDENT") {
      setActiveAnnouncements([]);
      return;
    }
    request<{ announcements: Announcement[] }>("/announcements/active")
      .then(({ announcements }) => setActiveAnnouncements(Array.isArray(announcements) ? announcements : []))
      .catch((cause) => setError((cause as Error).message));
  }, [user]);

  async function dismissAnnouncement(id: string) {
    try {
      await request("/announcements/" + id + "/seen", { method: "POST" });
      setActiveAnnouncements((items) => items.filter((item) => item.id !== id));
    } catch (cause) {
      setError((cause as Error).message);
    }
  }

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    request<{ invitations: Invitation[] }>("/auth/invitations")
      .then(({ invitations: items }) => setInvitations(Array.isArray(items) ? items : []))
      .catch((cause) => setError((cause as Error).message));
    request<{ announcements: Announcement[] }>("/admin/announcements")
      .then(({ announcements: items }) => setAnnouncements(Array.isArray(items) ? items : []))
      .catch((cause) => setError((cause as Error).message));
    void fetchAllAdminQuestions().catch((cause) => setError((cause as Error).message));
    request<{ subjects: AdminSubject[] }>("/admin/subjects")
      .then(({ subjects }) => { const items = subjects ?? []; setAdminSubjects(items); if (items[0]) setNewTopicSubjectId(items[0].id); })
      .catch((cause) => setError((cause as Error).message));
    request<{ exams: AdminExam[] }>("/admin/exams")
      .then(({ exams }) => setAdminExams(Array.isArray(exams) ? exams : []))
      .catch((cause) => setError((cause as Error).message));
    request<AdminAnalytics>("/admin/analytics/overview")
      .then(setAdminAnalytics)
      .catch((cause) => setError((cause as Error).message));
    void refreshLiveSessions();
    void refreshExamAttendance();
  }, [user]);

  useEffect(() => {
    if (user?.role !== "ADMIN" || activePage !== "model-lab") return;
    void refreshModelLab();
  }, [user, activePage]);

  useEffect(() => {
    if (user?.role !== "ADMIN") return;
    void refreshAdminStudents();
  }, [user, adminStudentPage, adminStudentSearch]);

  useEffect(() => {
    if (user?.role !== "ADMIN" || activePage !== "review-queue") return;
    void refreshReviewQueue();
  }, [user, activePage, reviewQueuePage]);

  useEffect(() => {
    if (user?.role !== "ADMIN" || !["live-sessions", "attendance"].includes(activePage)) return;
    const refresh = () => {
      if (activePage === "live-sessions") void refreshLiveSessions();
      if (activePage === "attendance") void refreshExamAttendance();
    };
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    return () => window.clearInterval(interval);
  }, [user, activePage, liveSessionsPage, attendancePage]);

  const hasActiveTrainingJobs = modelTrainingJobs.some((job) => job.status === "QUEUED" || job.status === "RUNNING");
  useEffect(() => {
    if (user?.role !== "ADMIN" || activePage !== "model-lab") return;
    if (!hasActiveTrainingJobs) return;
    const interval = window.setInterval(() => { void refreshTrainingJobs().catch((cause) => setError((cause as Error).message)); }, 2_000);
    return () => window.clearInterval(interval);
  }, [user, activePage, hasActiveTrainingJobs]);

  async function refreshModelLab() {
    setModelLabLoading(true);
    try {
      const [datasetResponse, modelResponse, jobResponse] = await Promise.all([
        request<{ datasets: ModelDataset[] }>("/admin/model-datasets"),
        request<{ models: RegisteredModel[] }>("/admin/models"),
        request<{ jobs: ModelTrainingJob[] }>("/admin/model-training-jobs"),
      ]);
      setModelDatasets(datasetResponse.datasets);
      setRegisteredModels(modelResponse.models);
      setModelTrainingJobs(jobResponse.jobs);
      if (!modelEvaluationDatasetId && datasetResponse.datasets[0]) setModelEvaluationDatasetId(datasetResponse.datasets[0].id);
      if (!modelCandidateId && modelResponse.models[0]) setModelCandidateId(modelResponse.models[0].modelId);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setModelLabLoading(false);
    }
  }

  async function refreshTrainingJobs() {
    const response = await request<{ jobs: ModelTrainingJob[] }>("/admin/model-training-jobs");
    setModelTrainingJobs(response.jobs);
  }

  async function queueTensorflowTraining(dataset: ModelDataset) {
    setBusy(true);
    setError("");
    setModelLabNotice("");
    try {
      const response = await request<{ job: ModelTrainingJob }>(
        `/admin/model-datasets/${encodeURIComponent(dataset.id)}/tensorflow-jobs`,
        { method: "POST", body: JSON.stringify({ modelId: `${trainingModelPrefix}-tensorflow`, seed: 42, epochs: 80, batchSize: 32 }) },
      );
      setModelLabNotice(`TensorFlow.js job ${response.job.id} queued. It will run in the API worker.`);
      await refreshTrainingJobs();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function registerModelDataset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setModelLabNotice("");
    try {
      const featureSchema = JSON.parse(modelFeatureSchemaJson);
      const samples = JSON.parse(modelSamplesJson);
      await request("/admin/model-datasets", {
        method: "POST",
        body: JSON.stringify({
          name: modelDatasetName,
          task: modelDatasetTask,
          targetColumn: modelDatasetTargetColumn,
          featureSchema,
          samples,
          sourceDescription: modelDatasetSource,
          sourceAttested: modelDatasetAttested,
        }),
      });
      setModelLabNotice("Evaluation dataset registered and fingerprinted.");
      setModelDatasetAttested(false);
      setModelDatasetSource("");
      await refreshModelLab();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function loadModelAudit(modelId: string) {
    setModelAuditId(modelId);
    setModelAuditLoading(true);
    try {
      const response = await request<{ events: ModelAuditEvent[] }>(
        `/admin/models/${encodeURIComponent(modelId)}/audit`,
      );
      setModelAuditEvents(response.events);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setModelAuditLoading(false);
    }
  }

  async function loadModelDrift(modelId: string, version: number) {
    setModelDriftLoading(true);
    setError("");
    try {
      const response = await request<ModelDriftReport>(
        `/admin/models/${encodeURIComponent(modelId)}/${version}/drift`,
      );
      setModelDriftReport(response);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setModelDriftLoading(false);
    }
  }

  async function trainRegisteredDataset(datasetId: string) {
    setBusy(true);
    setError("");
    setModelLabNotice("");
    try {
      const response = await request<{ models: TrainedCandidate[] }>(
        `/admin/model-datasets/${encodeURIComponent(datasetId)}/train`,
        {
          method: "POST",
          body: JSON.stringify({ modelId: trainingModelPrefix, seed: 42 }),
        },
      );
      setTrainedCandidates(response.models);
      setModelLabNotice(`Training completed: ${response.models.length} inactive candidates registered. Review and evaluate them before promotion.`);
      await refreshModelLab();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function evaluateModelCandidate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setModelLabNotice("");
    try {
      const response = await request<{ report: ModelEvaluationReport }>(
        `/admin/models/${encodeURIComponent(modelCandidateId)}/${Number(modelCandidateVersion)}/evaluate`,
        {
          method: "POST",
          body: JSON.stringify({
            baselineVersion: Number(modelBaselineVersion),
            datasetId: modelEvaluationDatasetId,
          }),
        },
      );
      setModelEvaluationReport(response.report);
      setModelLabNotice(`Evaluation completed: ${response.report.status}.`);
      await refreshModelLab();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function activateModelCandidate(modelId: string, version: number) {
    setBusy(true);
    setError("");
    setModelLabNotice("");
    try {
      await request(`/admin/models/${encodeURIComponent(modelId)}/${version}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setModelLabNotice(`${modelId} v${version} is now active.`);
      await refreshModelLab();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAssignedExams() {
    const response = await request<{ assignments: AssignedExam[] }>("/exams/assigned");
    setAssignedExams(response.assignments);
  }

  async function reviewAssignedExam(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ result: AssignedExamResult }>(`/exams/assignments/${assignmentId}/result`);
      setAssignmentResult(response.result);
      setAssignmentResultForId(assignmentId);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function startAssignedExam(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ package: AssignedExamPackage }>(`/exams/assignments/${assignmentId}/package`);
      const sessionResponse = await request<{ session: { startedAt: string; serverTime: string; deadline: string | null; status: string } }>(
        `/exams/assignments/${assignmentId}/session/start`, { method: "POST", body: JSON.stringify({}) },
      );
      const serverSaved = await request<{ revision: number; answers: { examQuestionId: string; selectedIndex: number | null }[] }>(
        `/exams/assignments/${assignmentId}/answers`,
      );
      let restoredAnswers: Record<string, number> = {};
      try {
        const cached = JSON.parse(safeStorage.getItem(assignedAnswersKey(assignmentId)) ?? "{}") as Record<string, unknown>;
        const validQuestionIds = new Set(response.package.questions.map((question) => question.id));
        restoredAnswers = Object.fromEntries(Object.entries(cached).flatMap(([id, value]) => {
          const questionId = id;
          return validQuestionIds.has(questionId) && Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 3 ? [[questionId, Number(value)] as const] : [];
        }));
      } catch { safeStorage.removeItem(assignedAnswersKey(assignmentId)); }
      assignmentAnswersRevisionRef.current = serverSaved.revision ?? 0;
      const serverAnswers = Object.fromEntries(serverSaved.answers.flatMap((answer) =>
        answer.selectedIndex === null ? [] : [[answer.examQuestionId, answer.selectedIndex] as const]
      ));
      restoredAnswers = mergeAssignedExamAnswers(serverAnswers, restoredAnswers);
      setAssignmentSaveStatus(serverSaved.answers.length > 0 ? "saved" : "idle");
      setActiveAssignmentPackage(response.package);
      setAssignmentAnswers(restoredAnswers);
      setAssignmentStartedAt(sessionResponse.session.startedAt);
      setAssignmentDeadline(sessionResponse.session.deadline);
      setAssignmentServerOffset(new Date(sessionResponse.session.serverTime).getTime() - performance.now());
      setAssignmentSessionPaused(false);
      setAssignmentClock(performance.now());
      setAssignmentAutoSubmitTriggered(false);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    if (!activeAssignmentPackage || !assignmentStartedAt || assignmentSessionPaused || Object.keys(assignmentAnswers).length === 0) return;
    const assignmentId = activeAssignmentPackage.assignmentId;
    const saveVersion = ++assignmentSaveSequenceRef.current;
    setAssignmentSaveStatus("saving");
    const timer = window.setTimeout(() => {
      // Serialize saves so an older, slower request cannot overwrite newer answers.
      const save = assignmentSaveQueueRef.current.catch(() => undefined).then(async () => {
        const saved = await request<{ revision: number }>(`/exams/assignments/${assignmentId}/answers`, {
          method: "PUT",
          body: JSON.stringify({
            revision: assignmentAnswersRevisionRef.current,
            answers: activeAssignmentPackage.questions.map((question) => ({
              examQuestionId: question.id,
              selectedIndex: assignmentAnswers[question.id] ?? null,
            })),
          }),
        });
        assignmentAnswersRevisionRef.current = saved.revision;
        if (assignmentSaveSequenceRef.current === saveVersion) setAssignmentSaveStatus("saved");
      }).catch((cause) => {
        if (assignmentSaveSequenceRef.current === saveVersion) {
          setAssignmentSaveStatus("error");
          setError(`Server autosave failed: ${(cause as Error).message}. Your local backup is still available.`);
        }
      });
      assignmentSaveQueueRef.current = save.then(() => undefined);
    }, 450);
    return () => {
      window.clearTimeout(timer);
      if (assignmentSaveSequenceRef.current === saveVersion) assignmentSaveSequenceRef.current += 1;
    };
  }, [activeAssignmentPackage, assignmentStartedAt, assignmentSessionPaused, assignmentAnswers]);

  function selectAssignedAnswer(questionId: string, selectedIndex: number) {
    if (!activeAssignmentPackage) return;
    const next = { ...assignmentAnswers, [questionId]: selectedIndex };
    setAssignmentAnswers(next);
    if (!safeStorage.setItem(assignedAnswersKey(activeAssignmentPackage.assignmentId), JSON.stringify(next))) {
      setError("Browser storage is unavailable. Keep this exam tab open until you submit; server autosave will continue.");
    }
  }

  async function submitAssignedExam(force = false) {
    if (!activeAssignmentPackage || !assignmentStartedAt) return;
    if (!force && !window.confirm("Submit this exam now? You cannot change answers after submission.")) return;
    setBusy(true);
    setError("");
    try {
      // Drain the autosave queue so the final submit carries the latest server revision.
      await assignmentSaveQueueRef.current.catch(() => undefined);
      const attemptKey = assignedAttemptKey(activeAssignmentPackage.assignmentId);
      let attemptUuid = safeStorage.getItem(attemptKey);
      if (!attemptUuid) {
        attemptUuid = typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
              const random = Math.floor(Math.random() * 16);
              return (character === "x" ? random : (random & 0x3) | 0x8).toString(16);
            });
        safeStorage.setItem(attemptKey, attemptUuid);
      }
      await request(`/exams/assignments/${activeAssignmentPackage.assignmentId}/submission`, {
        method: "POST",
        body: JSON.stringify({
          revision: assignmentAnswersRevisionRef.current,
          attemptUuid,
          startedAt: assignmentStartedAt,
          submittedAt: new Date().toISOString(),
          answers: activeAssignmentPackage.questions.map((question) => ({
            examQuestionId: question.id,
            selectedIndex: assignmentAnswers[question.id] ?? null,
          })),
        }),
      });
      safeStorage.removeItem(attemptKey);
      safeStorage.removeItem(assignedAnswersKey(activeAssignmentPackage.assignmentId));
      setActiveAssignmentPackage(null);
      setAssignmentStartedAt(null);
      setAssignmentDeadline(null);
      setAssignmentSessionPaused(false);
      setAssignmentAnswers({});
      setAssignmentSaveStatus("idle");
      setAssignmentAutoSubmitTriggered(false);
      await refreshAssignedExams();
      setActivePage("assigned-exams");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreatedInvitation(null);
    try {
      const response = await request<{ invitation: CreatedInvitation }>("/auth/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      setCreatedInvitation(response.invitation);
      setInviteEmail("");
      const refreshed = await request<{ invitations: Invitation[] }>("/auth/invitations");
      setInvitations(refreshed.invitations);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fetchAllAdminQuestions() {
    const first = await request<{ questions: AdminQuestion[]; pages?: number }>("/admin/question-bank?page=1&pageSize=200");
    const pages = Math.max(1, first.pages ?? 1);
    const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) =>
      request<{ questions: AdminQuestion[] }>(`/admin/question-bank?page=${index + 2}&pageSize=200`)
    ));
    setAdminQuestions([...first.questions, ...remaining.flatMap((page) => page.questions)]);
  }

  async function refreshAdminExams() {
    const refreshed = await request<{ exams: AdminExam[] }>("/admin/exams");
    setAdminExams(refreshed.exams);
  }

  async function releaseSubmission(submissionId: string) {
    if (!window.confirm("Approve this submission and release its score and answer review to the student?")) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(`/admin/submissions/${submissionId}/release`, { method: "POST", body: JSON.stringify({}) });
      const refreshed = await request<AdminAnalytics>("/admin/analytics/overview");
      setAdminAnalytics(refreshed);
      await refreshReviewQueue();
      setNotice("Submission approved. The student can now view the result.");
    } catch (cause) {
      setNotice("");
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function refreshAdminStudents(page = adminStudentPage, search = adminStudentSearch) {
    try {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (search.trim()) params.set("search", search.trim());
      const response = await request<{ students: AdminStudent[]; total: number }>(`/admin/students?${params.toString()}`);
      setAdminStudents(response.students ?? []);
      setAdminStudentTotal(response.total ?? 0);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function refreshReviewQueue(page = reviewQueuePage) {
    try {
      const response = await request<{ submissions: ReviewRequiredSubmission[]; total: number }>(`/admin/submissions/review-required?page=${page}&limit=25`);
      setReviewQueue(response.submissions ?? []);
      setReviewQueueTotal(response.total ?? 0);
      if ((response.submissions?.length ?? 0) === 0 && page > 1 && page > Math.ceil((response.total ?? 0) / 25)) setReviewQueuePage(Math.max(1, Math.ceil((response.total ?? 0) / 25)));
    } catch (cause) { setError((cause as Error).message); }
  }

  async function refreshLiveSessions(page = liveSessionsPage) {
    try {
      const response = await request<{ sessions: LiveSession[]; total: number }>(`/admin/exams/live-sessions?page=${page}&limit=25`);
      setLiveSessions(response.sessions ?? []);
      setLiveSessionsTotal(response.total ?? 0);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function refreshExamAttendance(page = attendancePage) {
    try {
      const response = await request<{ attendance: ExamAttendance[]; total: number }>(`/admin/exams/attendance?page=${page}&limit=25`);
      setExamAttendance(response.attendance ?? []);
      setAttendanceTotal(response.total ?? 0);
    } catch (cause) { setError((cause as Error).message); }
  }

  async function controlExamSession(sessionId: string, action: "PAUSE" | "RESUME" | "TERMINATE") {
    const confirmation = action === "TERMINATE"
      ? "Terminate this candidate session? The candidate will not be able to continue."
      : action === "PAUSE" ? "Pause this candidate session?" : "Resume this candidate session?";
    if (!window.confirm(confirmation)) return;
    setSessionActionBusy(sessionId);
    setError("");
    try {
      await request(`/admin/exams/sessions/${sessionId}/action`, {
        method: "POST", body: JSON.stringify({ action, reason: `Administrator selected ${action.toLowerCase()} from the live invigilation workspace.` }),
      });
      await refreshLiveSessions();
      await refreshExamAttendance();
    } catch (cause) { setError((cause as Error).message); }
    finally { setSessionActionBusy(null); }
  }

  async function loadSessionAudit(assignmentId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ audit: SessionAudit }>(`/admin/exams/assignments/${assignmentId}/audit`);
      setSessionAudit(response.audit);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setQuestionSaved(false);
    try {
      const payload = { subject: questionSubject.trim(), topic: questionTopic.trim() || "General", text: questionText.trim(), options: questionOptions.map((option) => option.trim()), correctIndex: questionCorrectIndex, explanation: questionExplanation.trim(), difficulty: questionDifficulty, source: "Admin question editor" };
      const endpoint = editingQuestionId === null ? "/admin/questions" : `/admin/questions/${editingQuestionId}`;
      const { question } = await request<{ question: AdminQuestion }>(endpoint, {
        method: editingQuestionId === null ? "POST" : "PATCH",
        body: JSON.stringify(payload),
      });
      setAdminQuestions((current) => {
        const next = editingQuestionId === null ? [...current, question] : current.map((item) => item.id === question.id ? question : item);
        return next.sort((a, b) => a.subject.localeCompare(b.subject) || a.id - b.id);
      });
      setEditingQuestionId(null);
      setQuestionText("");
      setQuestionOptions(["", "", "", ""]);
      setQuestionCorrectIndex(0);
      setQuestionExplanation("");
      setQuestionSaved(true);
      await refreshSubjects();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function editQuestion(question: AdminQuestion) {
    setEditingQuestionId(question.id);
    setQuestionSubject(question.subject);
    setQuestionTopic(question.topic ?? "General");
    setQuestionText(question.text);
    setQuestionOptions([...question.options]);
    setQuestionCorrectIndex(question.correctIndex ?? 0);
    setQuestionExplanation(question.explanation ?? "");
    setQuestionDifficulty((question.difficulty ?? "medium") as "easy" | "medium" | "hard");
    setQuestionSaved(false);
    document.getElementById("question-editor-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function deleteQuestion(question: AdminQuestion) {
    if (!window.confirm(`Delete question #${question.id}? It will also remove linked practice history for this question.`)) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/questions/${question.id}`, { method: "DELETE" });
      setAdminQuestions((current) => current.filter((item) => item.id !== question.id));
      setSelectedQuestionIds((current) => current.filter((id) => id !== question.id));
      setSelectedBankQuestionIds((current) => current.filter((id) => id !== question.id));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function bulkDeleteQuestions() {
    if (!selectedBankQuestionIds.length) return;
    if (!window.confirm(`Delete ${selectedBankQuestionIds.length} selected questions? Linked practice history for these questions will also be removed.`)) return;
    setBusy(true);
    setError("");
    try {
      await request("/admin/questions/bulk", { method: "DELETE", body: JSON.stringify({ ids: selectedBankQuestionIds }) });
      const removed = new Set(selectedBankQuestionIds);
      setAdminQuestions((current) => current.filter((question) => !removed.has(question.id)));
      setSelectedBankQuestionIds([]);
      setSelectedQuestionIds((current) => current.filter((id) => !removed.has(id)));
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function bulkUpdateQuestionDifficulty() {
    if (!selectedBankQuestionIds.length) return;
    setBusy(true);
    setError("");
    try {
      await request("/admin/questions/bulk", {
        method: "PATCH",
        body: JSON.stringify({ ids: selectedBankQuestionIds, difficulty: bulkDifficulty }),
      });
      const selected = new Set(selectedBankQuestionIds);
      setAdminQuestions((current) => current.map((question) => selected.has(question.id) ? { ...question, difficulty: bulkDifficulty } : question));
      setSelectedBankQuestionIds([]);
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function refreshSubjects() {
    const response = await request<{ subjects: AdminSubject[] }>("/admin/subjects");
    const subjects = response.subjects ?? [];
    setAdminSubjects(subjects);
    if (!newTopicSubjectId && subjects[0]) setNewTopicSubjectId(subjects[0].id);
  }

  async function createSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/admin/subjects", { method: "POST", body: JSON.stringify({ name: newSubjectName.trim() }) });
      setNewSubjectName("");
      await refreshSubjects();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createTopic(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTopicSubjectId) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/subjects/${newTopicSubjectId}/topics`, { method: "POST", body: JSON.stringify({ name: newTopicName.trim() }) });
      setNewTopicName("");
      await refreshSubjects();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function deleteTopic(topicId: number) {
    if (!window.confirm("Delete this topic? Questions assigned to it will move to no topic.")) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/topics/${topicId}`, { method: "DELETE" });
      await refreshSubjects();
      await fetchAllAdminQuestions();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function importQuestions() {
    setImportBusy(true);
    setError("");
    setImportReport(null);
    try {
      const endpoint = importFormat === "csv" ? "/admin/questions/import/csv" : "/admin/questions/import/json";
      const payload = importFormat === "csv"
        ? { content: importText }
        : { questions: JSON.parse(importText) };
      const response = await request<{ report: { added: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } }>(endpoint, {
        method: "POST", body: JSON.stringify(payload),
      });
      setImportReport(response.report);
      setImportPreviewReady(false);
      await fetchAllAdminQuestions();
      const bankInfo = await request<Bank>("/bank");
      setBank(bankInfo);
      await refreshSubjects();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setImportBusy(false);
    }
  }

  async function loadImportFile(file?: File) {
    if (!file) return;
    if (file.size > 8_000_000) {
      setImportPreviewError("The selected file exceeds the 8 MB upload limit.");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    try {
      const isJson = extension === "json";
      const content = extension === "xlsx" ? await xlsxToCsv(file) : await file.text();
      setImportFormat(isJson ? "json" : "csv");
      setImportText(content);
      setImportReport(null);
      setImportPreviewReady(false);
      setImportPreviewDetails(null);
      setImportPreviewError("");
    } catch (cause) {
      setImportPreviewError((cause as Error).message);
    }
  }

  async function previewQuestionImport() {
    setImportPreviewError("");
    setImportPreviewDetails(null);
    setImportBusy(true);
    try {
      const payload = importFormat === "csv"
        ? { format: "csv", content: importText }
        : { format: "json", questions: JSON.parse(importText) };
      const response = await request<{ preview: { valid: number; duplicates: number; invalid: { row: number; reason: string }[]; total: number } }>("/admin/questions/import/preview", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImportPreviewDetails(response.preview);
      setImportPreviewReady(response.preview.valid > 0);
      if (response.preview.valid === 0) setImportPreviewError("No valid new questions found. Fix the invalid rows or remove duplicates before importing.");
    } catch (cause) {
      setImportPreviewError((cause as Error).message);
      setImportPreviewReady(false);
    } finally {
      setImportBusy(false);
    }
  }

  function downloadQuestionTemplate(format: "csv" | "json") {
    const sample = format === "csv"
      ? "subject,topic,text,optionA,optionB,optionC,optionD,correctIndex,explanation,source,difficulty\nComputer Science,Data Structures,Which structure uses FIFO?,Stack,Queue,Tree,Graph,1,Queue follows first in first out,AP ECET,easy"
      : JSON.stringify([["Computer Science","Which structure uses FIFO?",["Stack","Queue","Tree","Graph"],1,"Queue follows first in first out"]], null, 2);
    const blob = new Blob([sample], { type: format === "csv" ? "text/csv" : "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `arctester-questions-template.${format}`; anchor.click();
    URL.revokeObjectURL(url);
  }

  function loadEcetBlueprint() {
    const blueprint: [RegExp, number][] = [
      [/math|mathematics/i, 50],
      [/physics/i, 25],
      [/chemistry/i, 25],
      [/computer science|\bcse\b/i, 100],
    ];
    const quotas: Record<string, number> = {};
    for (const [pattern, count] of blueprint) {
      const subject = [...new Set(adminQuestions.map((question) => question.subject))].find((name) => pattern.test(name));
      if (subject) quotas[subject] = count;
    }
    setSubjectQuotas(quotas);
    setDifficultyMix("any");
    setTopicSelectionMode("all");
    setSelectedTopics([]);
    const matched = Object.keys(quotas).length;
    setError(matched === 4 ? "Loaded the AP ECET 200-question blueprint." : `Loaded ${matched} of 4 AP ECET subject quotas. Add or rename the missing subjects in Subjects & Topics.`);
  }

  function generateSubjectPaper() {
    if (topicSelectionMode === "include" && selectedTopics.length === 0) {
      setError("Select at least one topic or switch Topic selection to All topics.");
      return;
    }
    const subjects = [...new Set(adminQuestions.map((question) => question.subject))];
    const requestedTotal = subjects.reduce((sum, subject) => sum + (Number.isFinite(subjectQuotas[subject]) ? Math.max(0, Math.floor(subjectQuotas[subject] ?? 0)) : 0), 0);
    if (requestedTotal > 500) {
      setError("A formal examination cannot contain more than 500 questions.");
      return;
    }
    const picked: number[] = [];
    const shortfalls: string[] = [];
    for (const subject of subjects) {
      const quota = Math.max(0, Math.floor(subjectQuotas[subject] ?? 0));
      let pool = adminQuestions.filter((question) => question.subject === subject && !picked.includes(question.id));
      const selectedForSubject = selectedTopics.filter((key) => key.startsWith(`${subject}::`));
      if (topicSelectionMode === "include" && selectedForSubject.length > 0) {
        pool = pool.filter((question) => question.topic && selectedForSubject.includes(`${subject}::${question.topic}`));
      }
      if (topicSelectionMode === "exclude" && selectedForSubject.length > 0) {
        pool = pool.filter((question) => !question.topic || !selectedForSubject.includes(`${subject}::${question.topic}`));
      }
      if (difficultyMix === "balanced") {
        const shuffled = (items: AdminQuestion[]) => {
          const values = [...items];
          for (let index = values.length - 1; index > 0; index -= 1) {
            const swapIndex = Math.floor(Math.random() * (index + 1));
            [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
          }
          return values;
        };
        const easy = shuffled(pool.filter((question) => question.difficulty === "easy"));
        const medium = shuffled(pool.filter((question) => (question.difficulty ?? "medium") === "medium"));
        const hard = shuffled(pool.filter((question) => question.difficulty === "hard"));
        const base = Math.floor(quota / 3);
        const remainder = quota % 3;
        const selected = [
          ...easy.slice(0, base + (remainder > 0 ? 1 : 0)),
          ...medium.slice(0, base + (remainder > 1 ? 1 : 0)),
          ...hard.slice(0, base),
        ];
        const selectedIds = new Set(selected.map((question) => question.id));
        if (selected.length < quota) {
          selected.push(...shuffled(pool.filter((question) => !selectedIds.has(question.id))).slice(0, quota - selected.length));
        }
        pool = shuffled(selected);
      } else {
        if (difficultyMix !== "any") pool = pool.filter((question) => (question.difficulty ?? "medium") === difficultyMix);
        pool = [...pool].sort(() => Math.random() - 0.5).slice(0, quota);
      }
      const subjectSelection = pool.slice(0, quota);
      for (const question of subjectSelection) picked.push(question.id);
      if (subjectSelection.length < quota) {
        shortfalls.push(`${subject}: requested ${quota}, only ${subjectSelection.length} questions match the selected topic and difficulty rules.`);
      }
    }
    setSelectedQuestionIds(picked);
    setError(picked.length
      ? `Generated a ${picked.length}-question paper. ${shortfalls.length ? shortfalls.join(" ") : "All subject quotas were satisfied."}`
      : "No questions matched the current blueprint. Check subject quotas and topic filters.");
  }

  async function editExam(examId: string) {
    setBusy(true);
    setError("");
    try {
      const response = await request<{ exam: { id: string; title: string; description: string; version: { instructions: string; durationMinutes: number; shuffleQuestions: boolean; shuffleOptions: boolean; questions: { questionId: number | null; marks: number; negativeMarks: number }[] } | null } }>(`/admin/exams/${examId}`);
      const exam = response.exam;
      setEditingExamId(exam.id);
      setExamTitle(exam.title);
      setExamDescription(exam.description);
      setExamInstructions(exam.version?.instructions ?? "");
      setExamDuration(exam.version?.durationMinutes ?? 180);
      setShuffleExamQuestions(exam.version?.shuffleQuestions ?? false);
      setShuffleExamOptions(exam.version?.shuffleOptions ?? false);
      setSelectedQuestionIds((exam.version?.questions ?? []).flatMap((question) => question.questionId === null ? [] : [question.questionId]));
      const firstQuestion = exam.version?.questions[0];
      setExamMarks(firstQuestion?.marks ?? 1);
      setExamNegativeMarks(firstQuestion?.negativeMarks ?? 0);
      setExamQuestionScoring(Object.fromEntries((exam.version?.questions ?? []).flatMap((question) => question.questionId === null ? [] : [[question.questionId, { marks: question.marks, negativeMarks: question.negativeMarks }]])));
      setActivePage("exams");
      document.getElementById("exam-management")?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function createExam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selectedQuestionIds.length === 0) {
      setError("Select at least one question for the exam.");
      return;
    }
    if (selectedQuestionIds.length > 500) {
      setError("A formal examination cannot contain more than 500 questions.");
      return;
    }
    if (selectedQuestionIds.some((questionId) => {
      const scoring = examQuestionScoring[questionId];
      return (scoring?.negativeMarks ?? examNegativeMarks) > (scoring?.marks ?? examMarks);
    })) {
      setError("Negative marks cannot exceed the marks for a correct answer on any selected question.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await request(editingExamId ? `/admin/exams/${editingExamId}` : "/admin/exams", {
        method: editingExamId ? "PATCH" : "POST",
        body: JSON.stringify({
          title: examTitle.trim(),
          description: examDescription.trim(),
          instructions: examInstructions.trim(),
          durationMinutes: examDuration,
          shuffleQuestions: shuffleExamQuestions,
          shuffleOptions: shuffleExamOptions,
          questions: selectedQuestionIds.map((questionId) => ({ questionId, marks: examQuestionScoring[questionId]?.marks ?? examMarks, negativeMarks: examQuestionScoring[questionId]?.negativeMarks ?? examNegativeMarks })),
        }),
      });
      setExamTitle("");
      setExamDescription("");
      setExamInstructions("");
      setSelectedQuestionIds([]);
      setExamQuestionScoring({});
      setEditingExamId(null);
      await refreshAdminExams();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publishExam(examId: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/exams/${examId}/publish`, { method: "POST" });
      await refreshAdminExams();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cloneExam(examId: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/admin/exams/${examId}/clone`, { method: "POST" });
      await refreshAdminExams();
      setError("Exam copied as a new draft.");
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function archiveExam(examId: string) {
    if (!window.confirm("Archive this exam? It will remain in the exam library but cannot be treated as an active exam.")) return;
    setBusy(true);
    setError("");
    try {
      await request(`/admin/exams/${examId}/archive`, { method: "POST" });
      await refreshAdminExams();
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  async function assignExam(examId: string) {
    if (selectedStudentIds.length === 0) {
      setError("Select at least one student before assigning this exam.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await request<{ created: number }>(`/admin/exams/${examId}/assign`, {
        method: "POST",
        body: JSON.stringify({ studentIds: selectedStudentIds, availableFrom: assignmentAvailableFrom ? new Date(assignmentAvailableFrom).toISOString() : undefined, dueAt: assignmentDueAt ? new Date(assignmentDueAt).toISOString() : undefined }),
      });
      setAssigningExamId("");
      setSelectedStudentIds([]);
      setAssignmentAvailableFrom("");
      setAssignmentDueAt("");
      setError(`Exam assigned to ${result.created} student(s).`);
      await refreshAdminExams();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function createAnnouncement(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request("/admin/announcements", {
        method: "POST",
        body: JSON.stringify({
          title: announcementTitle.trim(),
          message: announcementMessage.trim(),
          expiresAt: announcementExpiresAt ? new Date(announcementExpiresAt).toISOString() : undefined,
        }),
      });
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      setAnnouncementExpiresAt("");
      const refreshed = await request<{ announcements: Announcement[] }>("/admin/announcements");
      setAnnouncements(refreshed.announcements);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function acknowledgeAnnouncement(id: string) {
    setBusy(true);
    try {
      const result = await request<{ seenAt: string }>(`/announcements/${id}/read`, { method: "POST" });
      setAnnouncements((current) => current.map((item) => item.id === id ? { ...item, seenAt: result.seenAt } : item));
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function revokeInvitation(id: string) {
    setBusy(true);
    setError("");
    try {
      await request(`/auth/invitations/${id}/revoke`, { method: "POST" });
      const refreshed = await request<{ invitations: Invitation[] }>("/auth/invitations");
      setInvitations(refreshed.invitations);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      if (register) {
        await request("/auth/register", {
          method: "POST",
          body: JSON.stringify({ email, password, invitationToken: invitationToken.trim() }),
        });
        setRegister(false);
        setInvitationToken("");
      } else {
        const session = await request<{ user: User }>("/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });
        setUser(session.user);
      }
      setPassword("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function startTest(mode: "mock" | "practice" | "mistakes", subject?: string, practiceConfig?: { subjects: string[]; topicFilters: { subject: string; topic: string }[]; count: number; difficulty: "any" | "easy" | "medium" | "hard" }) {
    if (mode === "practice" && !subject && (!practiceConfig || practiceConfig.subjects.length === 0)) {
      setError("Select at least one subject before creating your practice paper.");
      return;
    }
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const created = await request<Test>("/tests", {
        method: "POST",
        body: JSON.stringify({ mode, ...(subject ? { subject } : {}), ...(practiceConfig ? { subjects: practiceConfig.subjects, topicFilters: practiceConfig.topicFilters, count: practiceConfig.count, difficulty: practiceConfig.difficulty } : mode === "practice" ? { count: 10 } : {}) }),
      });
      const previousAttemptId = safeStorage.getItem("arctester-active-practice-attempt");
      if (previousAttemptId) safeStorage.removeItem(practiceAnswersKey(previousAttemptId));
      setTest(created);
      setActivePage("practice");
      practiceAutoSubmitRef.current = null;
      setPracticeClock(Date.now());
      safeStorage.setItem("arctester-active-practice-attempt", String(created.attemptId));
      safeStorage.setItem(practiceAnswersKey(created.attemptId), "{}");
      setAnswers({});
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function createStudentPracticePaper() {
    const topicFilters = practiceTopicKeys.flatMap((key) => {
      try { const parsed = JSON.parse(key) as [string, string]; return [{ subject: parsed[0], topic: parsed[1] }]; }
      catch { return []; }
    });
    void startTest("practice", undefined, { subjects: practiceSubjects, topicFilters, count: practiceQuestionCount, difficulty: practiceDifficulty });
  }

  function selectPracticeAnswer(questionId: number, selectedIndex: number) {
    if (!test) return;
    const next = { ...answers, [questionId]: selectedIndex };
    setAnswers(next);
    if (!safeStorage.setItem(practiceAnswersKey(test.attemptId), JSON.stringify(next))) {
      setError("Browser storage is unavailable. Submit your practice test before closing this tab.");
    }
  }

  async function submitTest() {
    if (!test) return;
    setBusy(true);
    setError("");
    try {
      await request(`/tests/${test.attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: test.questions.map((question) => ({
            questionId: question.id,
            selectedIndex: answers[question.id] ?? null,
          })),
        }),
      });
      const fullResult = await request<Result>(`/tests/${test.attemptId}/result`);
      setResult(fullResult);
      safeStorage.removeItem("arctester-active-practice-attempt");
      safeStorage.removeItem(practiceAnswersKey(test.attemptId));
      setTest(null);
    } catch (cause) {
      try {
        const recovered = await request<Result>(`/tests/${test.attemptId}/result`);
        setResult(recovered);
        safeStorage.removeItem("arctester-active-practice-attempt");
        safeStorage.removeItem(practiceAnswersKey(test.attemptId));
        setTest(null);
      } catch {
        setError((cause as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    setError("");
    try {
      await request("/auth/logout", { method: "POST" });
    } catch (cause) {
      setError(`Secure sign-out failed. Your server session may still be active. ${(cause as Error).message}`);
      setBusy(false);
      return;
    }
    setUser(null);
    setBank(null);
    const activePracticeId = safeStorage.getItem("arctester-active-practice-attempt");
    if (activePracticeId) safeStorage.removeItem(practiceAnswersKey(activePracticeId));
    safeStorage.removeItem("arctester-active-practice-attempt");
    setTest(null);
    setResult(null);
    setAnswers({});
    setAssignmentAnswers({});
    if (activeAssignmentPackage) {
      safeStorage.removeItem(assignedAnswersKey(activeAssignmentPackage.assignmentId));
      safeStorage.removeItem(assignedAttemptKey(activeAssignmentPackage.assignmentId));
    }
    setActiveAssignmentPackage(null);
    setAssignmentStartedAt(null);
    setAssignmentDeadline(null);
    setAssignmentSessionPaused(false);
    setAssignmentResult(null);
    setAssignmentResultForId(null);
    setAssignedExams([]);
    setAnnouncements([]);
    setInvitations([]);
    setAdminQuestions([]);
    setAdminSubjects([]);
    setAdminStudents([]);
    setAdminExams([]);
    setAdminAnalytics(null);
    setLiveSessions([]);
    setExamAttendance([]);
    setSessionAudit(null);
    setPracticeSubjects([]);
    setPracticeTopicKeys([]);
    setPracticeQuestionCount(20);
    setPracticeDifficulty("any");
    setSelectedQuestionIds([]);
    setSelectedStudentIds([]);
    setSelectedTopics([]);
    setSubjectQuotas({});
    setTopicSelectionMode("all");
    setDifficultyMix("any");
    setCreatedInvitation(null);
    setInviteEmail("");
    setNewSubjectName("");
    setNewTopicName("");
    setQuestionText("");
    setQuestionOptions(["", "", "", ""]);
    setQuestionExplanation("");
    setEditingQuestionId(null);
    setQuestionSaved(false);
    setExamTitle("");
    setExamDescription("");
    setExamInstructions("");
    setEditingExamId(null);
    setImportText("");
    setImportReport(null);
    setImportPreviewReady(false);
    setImportPreviewDetails(null);
    setImportPreviewError("");
    setError("");
    setActivePage("dashboard");
    setBusy(false);
  }

  if (!user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <Brand />
          <p className="eyebrow">YOUR PERSONAL PRACTICE SPACE</p>
          <h1>{register ? "Create your account" : "Welcome back"}</h1>
          <p className="muted">Sign in to continue your preparation.</p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void authenticate();
            }}
          >
            <label>
              Email address
              <input
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                autoComplete={register ? "new-password" : "current-password"}
                minLength={register ? 8 : 1}
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {register && (
              <label>
                Invitation code
                <input
                  type="text"
                  autoComplete="one-time-code"
                  required
                  value={invitationToken}
                  onChange={(event) => setInvitationToken(event.target.value)}
                />
              </label>
            )}
            <button className="primary full" disabled={busy}>
              {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
            </button>
          </form>
          <button className="text-button" onClick={() => setRegister(!register)}>
            {register ? "Already have an account? Sign in" : "Have an invitation? Create account"}
          </button>
          {error && <p className="error">{error}</p>}
        </section>
      </main>
    );
  }

  if (user.role === "ADMIN") {
    return <AdminWorkspace
      email={user.email}
      theme={theme}
      setTheme={setTheme}
      signOut={signOut}
      invitations={invitations}
      createInvitation={createInvitation}
      inviteEmail={inviteEmail}
      setInviteEmail={setInviteEmail}
      createdInvitation={createdInvitation}
      revokeInvitation={revokeInvitation}
      busy={busy}
    />;
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <Brand />
        <nav aria-label="Student navigation">
          <button disabled={Boolean(activeAssignmentPackage)} title={activeAssignmentPackage ? "Navigation is locked while an assigned exam is active" : undefined} className={activePage === "dashboard" ? "nav-active" : "nav-button"} onClick={() => setActivePage("dashboard")}>Dashboard</button>
          <button disabled={Boolean(activeAssignmentPackage)} title={activeAssignmentPackage ? "Navigation is locked while an assigned exam is active" : undefined} className={activePage === "practice" ? "nav-active" : "nav-button"} onClick={() => setActivePage("practice")}>Practice</button>
          <button disabled={Boolean(activeAssignmentPackage)} title={activeAssignmentPackage ? "Navigation is locked while an assigned exam is active" : undefined} className={activePage === "assigned-exams" ? "nav-active" : "nav-button"} onClick={() => setActivePage("assigned-exams")}>Assigned exams{assignedExams.filter((item) => !item.submission).length ? ` (${assignedExams.filter((item) => !item.submission).length})` : ""}</button>
          <button disabled={Boolean(activeAssignmentPackage)} title={activeAssignmentPackage ? "Navigation is locked while an assigned exam is active" : undefined} className={activePage === "question-bank" ? "nav-active" : "nav-button"} onClick={() => setActivePage("question-bank")}>Question bank</button>
          <button disabled={Boolean(activeAssignmentPackage)} title={activeAssignmentPackage ? "Navigation is locked while an assigned exam is active" : undefined} className={activePage === "announcements" ? "nav-active" : "nav-button"} onClick={() => setActivePage("announcements")}>Announcements{announcements.filter((item) => !item.seenAt).length > 0 ? ` (${announcements.filter((item) => !item.seenAt).length})` : ""}</button>
        </nav>
        <div className="top-actions">
          <button
            className="icon-button"
            onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            aria-label="Toggle theme"
          >
            {theme === "light" ? "☾" : "☀"}
          </button>
          <span className="user-email">{user.email}</span>
          <button className="ghost" disabled={busy} onClick={signOut}>
            Sign out
          </button>
        </div>
      </header>

      {user.role === "STUDENT" && !test && !result && !activeAssignmentPackage && announcements.some((item) => !item.seenAt) ? (() => {
        const notice = announcements.find((item) => !item.seenAt)!;
        return (
          <div className="announcement-overlay">
            <section className="announcement-popup panel" role="dialog" aria-modal="true" aria-labelledby="announcement-popup-title">
              <div className="announcement-popup-top"><span className="status status-pending">NEW ANNOUNCEMENT</span><span className="muted">{new Date(notice.publishedAt).toLocaleString()}</span></div>
              <p className="eyebrow">FROM ARCTESTER ADMIN</p>
              <h2 id="announcement-popup-title">{notice.title}</h2>
              <p className="announcement-popup-message">{notice.message}</p>
              {notice.expiresAt ? <p className="announcement-popup-expiry">Expires {new Date(notice.expiresAt).toLocaleString()}</p> : null}
              <button className="primary" disabled={busy} onClick={() => void acknowledgeAnnouncement(notice.id)}>{busy ? "Saving…" : "Got it · Mark as seen"}</button>
              <p className="muted announcement-popup-footnote">You won't see this announcement again after marking it as seen.</p>
            </section>
          </div>
        );
      })() : null}
      <main className="main-content">
        {activeAssignmentPackage ? (
          <section className="assigned-exam-session">
            <div className="page-heading"><div><p className="eyebrow">OFFICIAL ASSIGNED EXAM · VERSION {activeAssignmentPackage.version}</p><h1>{activeAssignmentPackage.title}</h1><p className="muted">{activeAssignmentPackage.questions.length} questions · {activeAssignmentPackage.durationMinutes} minutes · <strong className={assignmentSessionPaused || assignmentRemainingSeconds < 300 ? "timer-warning" : "exam-countdown"}>{Math.floor(assignmentRemainingSeconds / 60).toString().padStart(2, "0")}:{(assignmentRemainingSeconds % 60).toString().padStart(2, "0")} remaining</strong></p></div><button className="ghost" disabled={busy} onClick={() => { if (window.confirm("Leave this exam? Your answers are saved on this device and synced to the server while online. You can reopen the exam and continue while time remains.")) { setActiveAssignmentPackage(null); setAssignmentStartedAt(null); setAssignmentDeadline(null); setAssignmentSessionPaused(false); setAssignmentAutoSubmitTriggered(false); } }}>Leave exam</button></div>
            {assignmentSessionPaused && <p className="notice session-paused" role="status">Session paused or awaiting invigilator action. The server-controlled timer is held.</p>}
            {activeAssignmentPackage.instructions && <div className="panel exam-instructions"><strong>Instructions</strong><p>{activeAssignmentPackage.instructions}</p></div>}
            {activeAssignmentPackage.dueAt && <p className="notice">Submission deadline: {new Date(activeAssignmentPackage.dueAt).toLocaleString()}</p>}
            <section className="panel exam-question-navigator" aria-label="Question navigator"><div className="exam-progress-heading"><strong>Question progress</strong><span>{Object.keys(assignmentAnswers).length} / {activeAssignmentPackage.questions.length} answered</span></div><div className="exam-progress-track"><span style={{ width: `${activeAssignmentPackage.questions.length ? Object.keys(assignmentAnswers).length / activeAssignmentPackage.questions.length * 100 : 0}%` }} /></div><div className="exam-palette">{activeAssignmentPackage.questions.map((question, index) => <button type="button" key={question.id} disabled={assignmentSessionPaused} aria-label={`Go to question ${index + 1}${assignmentAnswers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={assignmentAnswers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`assigned-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div></section>
            <div className="assigned-exam-question-list">{activeAssignmentPackage.questions.map((question, index) => <article id={`assigned-question-${question.id}`} className="panel question-card" key={question.id}><p className="eyebrow">QUESTION {index + 1} · {question.subject}{question.topic ? ` · ${question.topic}` : ""}</p><h2>{question.text}</h2><div className="options">{question.options.map((option, optionIndex) => <button type="button" key={optionIndex} disabled={assignmentSessionPaused} className={assignmentAnswers[question.id] === optionIndex ? "option selected" : "option"} onClick={() => selectAssignedAnswer(question.id, optionIndex)}><span>{String.fromCharCode(65 + optionIndex)}</span>{option}</button>)}</div><small className="muted">+{question.marks} marks · −{question.negativeMarks} for a wrong answer</small></article>)}</div>
            <div className="assigned-exam-submit"><span className="muted">{Object.keys(assignmentAnswers).length} of {activeAssignmentPackage.questions.length} answered</span><small className={`autosave-status autosave-${assignmentSaveStatus}`}>{assignmentSaveStatus === "saving" ? "Saving to server…" : assignmentSaveStatus === "saved" ? "All answers synced" : assignmentSaveStatus === "error" ? "Sync failed · local backup saved" : "Local backup active"}</small><button className="primary" disabled={busy || assignmentSessionPaused} onClick={() => void submitAssignedExam()}>{assignmentSessionPaused ? "Waiting for invigilator" : busy ? "Submitting…" : "Submit final answers"}</button></div>
          </section>
        ) : activePage === "practice" && test ? (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">PRACTICE SESSION</p>
                <h1>Stay focused.</h1>
                <p className="muted">
                  {test.questions.length} questions · {Object.keys(answers).length} answered
                </p>
              </div>
              <button className="ghost" onClick={() => setActivePage("dashboard")}>
                Leave session
              </button>
            </div>
            {test.warnings.map((warning) => (
              <p className="notice" key={warning}>
                {warning}
              </p>
            ))}
            <section className="panel exam-question-navigator" aria-label="Practice question navigator"><div className="exam-progress-heading"><strong>Question progress</strong><span>{Object.keys(answers).length} / {test.questions.length} answered</span></div><div className="exam-progress-track"><span style={{ width: `${test.questions.length ? Object.keys(answers).length / test.questions.length * 100 : 0}%` }} /></div><div className="exam-palette">{test.questions.map((question, index) => <button type="button" key={question.id} aria-label={`Go to question ${index + 1}${answers[question.id] !== undefined ? ", answered" : ", unanswered"}`} className={answers[question.id] !== undefined ? "exam-palette-item answered" : "exam-palette-item"} onClick={() => document.getElementById(`practice-question-${question.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}>{index + 1}</button>)}</div></section>
            <div className="question-list">
              {test.questions.map((question, index) => (
                <article id={`practice-question-${question.id}`} className="panel question-card" key={question.id}>
                  <p className="eyebrow">
                    QUESTION {index + 1} · {question.subject}
                  </p>
                  <h2>{question.text}</h2>
                  <div className="options">
                    {question.options.map((option, optionIndex) => (
                      <button
                        key={optionIndex}
                        className={
                          answers[question.id] === optionIndex ? "option selected" : "option"
                        }
                        onClick={() =>
                          selectPracticeAnswer(question.id, optionIndex)
                        }
                      >
                        <span>{String.fromCharCode(65 + optionIndex)}</span>
                        {option}
                      </button>
                    ))}
                  </div>
                </article>
              ))}
            </div>
            <button className="primary" disabled={busy} onClick={() => void submitTest()}>
              {busy ? "Submitting…" : "Submit answers"}
            </button>
          </section>
        ) : activePage === "practice" && result ? (
          <section>
            <div className="page-heading">
              <div>
                <p className="eyebrow">SESSION COMPLETE</p>
                <h1>Your result</h1>
              </div>
              <button className="ghost" onClick={() => setResult(null)}>
                Back to dashboard
              </button>
            </div>
            <div className="panel score-panel">
              <strong>
                {result.score} / {result.total}
              </strong>
              <span className="muted">Your score</span>
            </div>
            <div className="grid two">
              {result.breakdown.map((item) => (
                <article className="panel" key={item.subject}>
                  <h3>{item.subject}</h3>
                  <p>
                    {item.correct} / {item.total} correct
                  </p>
                </article>
              ))}
            </div>
            <h2 className="section-heading">Answer review</h2>
            {result.questions.map((question, index) => (
              <article className="panel question-card" key={question.questionId}>
                <p className="eyebrow">QUESTION {index + 1}</p>
                <h3>{question.text}</h3>
                <p className={question.selectedIndex === null ? "muted" : question.isCorrect ? "success" : "error"}>
                  {question.selectedIndex === null ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"}
                </p>
                <p><strong>Your answer:</strong> {question.selectedIndex === null ? "Not answered" : question.options[question.selectedIndex]}</p>
                <p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p>
                <p className="muted">{question.explanation}</p>
              </article>
            ))}
          </section>
        ) : activePage === "assigned-exams" ? (
          <section className="assigned-exams-page">
            <div className="page-heading"><div><p className="eyebrow">EXAM CENTRE</p><h1>Assigned exams</h1><p className="muted">Exams assigned to your account by the administrator.</p></div><button className="ghost" disabled={busy} onClick={() => void refreshAssignedExams()}>Refresh</button></div>
            {assignedExams.length === 0 ? <div className="panel empty-state"><h2>No assigned exams</h2><p className="muted">When an administrator assigns an exam, it will appear here.</p></div> : assignedExams.map((item) => {
              const unavailable = item.availableFrom && new Date(item.availableFrom).getTime() > Date.now();
              const expired = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
              return <article className="panel assigned-exam-card" key={item.id}>
                <div className="admin-exam-meta"><div><strong>{item.exam.title}</strong><p className="muted">{item.exam.description || "No description"} · Version {item.version} · {item.questionCount} questions · {item.durationMinutes} min</p></div><span className={item.submission ? "status status-used" : expired ? "status status-expired" : "status status-pending"}>{item.submission ? "SUBMITTED" : expired ? "EXPIRED" : unavailable ? "UPCOMING" : "READY"}</span></div>
                <div className="assigned-exam-dates"><small>Available: {item.availableFrom ? new Date(item.availableFrom).toLocaleString() : "Immediately"}</small><small>Deadline: {item.dueAt ? new Date(item.dueAt).toLocaleString() : "No deadline"}</small></div>
                {item.submission ? <><p className="muted">Submitted {new Date(item.submission.submittedAt).toLocaleString()} · {item.submission.status === "REVIEW_REQUIRED" ? "Awaiting administrator review. Your result will appear after approval." : `Score: ${item.submission.score ?? "Pending"} / ${item.submission.maximumScore ?? "—"}`}</p>{item.submission.status !== "REVIEW_REQUIRED" && <button type="button" className="ghost" disabled={busy} onClick={() => void reviewAssignedExam(item.id)}>Review answers</button>}{assignmentResultForId === item.id && assignmentResult && <div className="assigned-result-review"><h3>Answer review</h3><p><strong>{assignmentResult.score ?? "Pending"} / {assignmentResult.maximumScore ?? "—"}</strong> · {assignmentResult.status}</p>{assignmentResult.questions.map((question) => <article className="question-review-row" key={question.id}><strong>Q{question.position + 1}. {question.text}</strong><p className={question.isCorrect ? "success" : "error"}>{question.selectedIndex === null ? "Not answered" : question.isCorrect ? "Correct" : "Incorrect"} · {question.awardedMarks} marks</p><p><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p><p className="muted">{question.explanation || "No explanation provided."}</p></article>)}</div>}</> : <button className="primary" disabled={busy || Boolean(unavailable) || Boolean(expired)} onClick={() => void startAssignedExam(item.id)}>{unavailable ? "Not available yet" : expired ? "Deadline passed" : "Start examination"}</button>}
              </article>;
            })}
          </section>
        ) : activePage === "announcements" ? (
          <section className="student-announcements">
            <div className="page-heading">
              <div><p className="eyebrow">STUDENT COMMUNICATION</p><h1>Announcements</h1><p className="muted">Notices published by your ArcTester administrator.</p></div>
              <button className="ghost" onClick={() => request<{ announcements: Announcement[] }>("/announcements").then(({ announcements: items }) => setAnnouncements(items)).catch((cause) => setError((cause as Error).message))}>Refresh</button>
            </div>
            {announcements.length === 0 ? <div className="panel empty-state"><h2>No announcements yet</h2><p className="muted">New notices from your administrator will appear here automatically.</p></div> : announcements.map((item) => (
              <article className="panel announcement-row" key={item.id}>
                <div className="announcement-meta"><span className={item.seenAt ? "status status-used" : "status status-pending"}>{item.seenAt ? "SEEN" : "UNREAD"}</span><small>{new Date(item.publishedAt).toLocaleString()}</small></div>
                <h2>{item.title}</h2><p>{item.message}</p>
                {item.expiresAt ? <small className="muted">Expires {new Date(item.expiresAt).toLocaleString()}</small> : null}
              </article>
            ))}
          </section>
        ) : (
          <>
            <section hidden={activePage !== "dashboard"} className="welcome panel" id="dashboard">
              <div>
                <p className="eyebrow">YOUR LEARNING DASHBOARD</p>
                <h1>Make every practice count.</h1>
                <p className="muted">
                  Pick a subject or start a mixed session. Your progress is saved to your account.
                </p>
              </div>
              <div className="welcome-mark">A</div>
            </section>
            {activePage === "dashboard" && announcements.length > 0 ? (
              <section className="panel student-notice-preview">
                <div className="section-head"><div><p className="eyebrow">IMPORTANT UPDATES</p><h2>Latest announcement</h2></div><button className="ghost" onClick={() => setActivePage("announcements")}>View all ({announcements.length}) →</button></div>
                <strong>{announcements[0].title}</strong><p>{announcements[0].message}</p><small className="muted">{new Date(announcements[0].publishedAt).toLocaleString()}</small>
              </section>
            ) : null}
            <div hidden={activePage !== "dashboard"} className="stats-row">
              <article className="panel stat">
                <span className="muted">Question bank</span>
                <strong>{bank?.total ?? "—"}</strong>
                <span className="muted">Available questions</span>
              </article>
              <article className="panel stat">
                <span className="muted">Subjects</span>
                <strong>{bank?.subjects.length ?? "—"}</strong>
                <span className="muted">In your question bank</span>
              </article>
            </div>
            <section hidden={activePage !== "practice"} id="practice">
              <div className="section-head">
                <div>
                  <p className="eyebrow">GET STARTED</p>
                  <h2>Choose your practice</h2>
                </div>
              </div>
              <div className="practice-builder-grid">
                <article className="panel practice-builder">
                  <div className="practice-builder-title"><div><span className="action-icon">◎</span><h3>Create your question paper</h3><p className="muted">Choose subjects first. Topic selection is optional and only filters the subjects you choose.</p></div><span className="status status-used">CUSTOM PAPER</span></div>
                  <div className="practice-builder-section">
                    <div className="practice-builder-label"><strong>1. Select subjects</strong><span className="muted">{practiceSubjects.length} selected</span></div>
                    <div className="practice-subject-grid">
                      {(bank?.subjects ?? []).map((item) => <label className={practiceSubjects.includes(item.subject) ? "practice-subject-choice selected" : "practice-subject-choice"} key={item.subject}>
                        <input type="checkbox" checked={practiceSubjects.includes(item.subject)} onChange={(event) => {
                          if (event.target.checked && practiceSubjects.length >= 30) {
                            setError("You can select up to 30 subjects in one practice paper.");
                            return;
                          }
                          setError("");
                          setPracticeSubjects((current) => event.target.checked ? [...current, item.subject] : current.filter((name) => name !== item.subject));
                          if (!event.target.checked) setPracticeTopicKeys((current) => current.filter((key) => { try { return (JSON.parse(key) as [string, string])[0] !== item.subject; } catch { return false; } }));
                        }} />
                        <span><strong>{item.subject}</strong><small>{item.count} questions available</small></span>
                      </label>)}
                    </div>
                    {(!bank || bank.subjects.length === 0) && <p className="muted">No subjects are available in the question bank yet.</p>}
                    <div className="practice-builder-actions"><button type="button" className="text-button" disabled={!bank?.subjects.length} onClick={() => { const all = bank?.subjects.map((item) => item.subject) ?? []; setPracticeSubjects(all.slice(0, 30)); setError(all.length > 30 ? "Only the first 30 subjects were selected. The API supports up to 30 subjects per paper." : ""); }}>Select all subjects</button><button type="button" className="text-button" disabled={!practiceSubjects.length} onClick={() => { setPracticeSubjects([]); setPracticeTopicKeys([]); }}>Clear selection</button></div>
                  </div>
                  <div className="practice-builder-section">
                    <div className="practice-builder-label"><strong>2. Choose topics <span className="muted">(optional)</span></strong><span className="muted">{practiceTopicKeys.length ? String(practiceTopicKeys.length) + " selected" : "All topics"}</span></div>
                    {practiceSubjects.length === 0 ? <p className="practice-helper">Select at least one subject to see its topics.</p> : <div className="practice-topic-groups">{practiceSubjects.map((subject) => {
                      const item = bank?.subjects.find((entry) => entry.subject === subject);
                      if (!item?.topics.length) return <div className="practice-topic-group" key={subject}><strong>{subject}</strong><p className="muted">No topics are defined. All questions in this subject remain eligible.</p></div>;
                      return <div className="practice-topic-group" key={subject}><strong>{subject}</strong><div className="practice-topic-list">{item.topics.map((topic) => {
                        const key = JSON.stringify([subject, topic.topic]);
                        return <label key={key}><input type="checkbox" checked={practiceTopicKeys.includes(key)} onChange={(event) => setPracticeTopicKeys((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} />{topic.topic}<small>{topic.count}</small></label>;
                      })}</div></div>;
                    })}</div>}
                    <p className="practice-helper">Leave all topics unchecked to include every topic in your selected subjects. For each subject, leave its topics unchecked to include all topics; selecting topics restricts only that subject.</p>
                    {practiceTopicKeys.length > 0 && <button type="button" className="text-button" onClick={() => setPracticeTopicKeys([])}>Clear topic filters</button>}
                  </div>
                  <div className="practice-builder-section">
                    <strong>3. Configure your paper</strong>
                    <div className="practice-config-grid">
                      <label>Number of questions<input type="number" min={1} max={200} value={practiceQuestionCount} onChange={(event) => setPracticeQuestionCount(Math.max(1, Math.min(200, Math.floor(Number(event.target.value) || 1))))} /></label>
                      <label>Difficulty<select value={practiceDifficulty} onChange={(event) => setPracticeDifficulty(event.target.value as typeof practiceDifficulty)}><option value="any">All difficulties</option><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
                    </div>
                    <p className="practice-helper">Questions are distributed as evenly as possible across selected subjects. If a subject has too few matching questions, ArcTester will tell you.</p>{practiceSubjects.length > 0 && <div className="practice-quota-preview"><span className="practice-helper">Requested subject distribution</span><div>{practiceSubjects.map((subject, index) => { const base = Math.floor(practiceQuestionCount / practiceSubjects.length); const quota = base + (index < practiceQuestionCount % practiceSubjects.length ? 1 : 0); return <span key={subject}><strong>{subject}</strong><b>{quota}</b></span>; })}</div></div>}
                  </div>
                  <div className="practice-builder-footer"><span className="muted">Your paper will use your selected filters.</span><button className="primary" disabled={busy || practiceSubjects.length === 0 || !bank?.total} onClick={createStudentPracticePaper}>{busy ? "Building paper…" : "Create " + practiceQuestionCount + "-question paper"}</button></div>
                </article>
                <div className="practice-side-actions">
                  <article className="panel action-card"><span className="action-icon">◈</span><h3>ECET mock test</h3><p className="muted">Take a full-length paper using the configured AP ECET test pattern.</p><button className="ghost" disabled={busy} onClick={() => void startTest("mock")}>Start mock test</button></article>
                  <article className="panel action-card"><span className="action-icon">↻</span><h3>Review mistakes</h3><p className="muted">Revisit questions you have answered incorrectly.</p><button className="ghost" disabled={busy} onClick={() => void startTest("mistakes")}>Review mistakes</button></article>
                </div>
              </div>
            </section>
            <section hidden={activePage !== "question-bank"}>
              <div className="section-head">
                <div>
                  <p className="eyebrow">QUESTION BANK</p>
                  <h2>Practice by subject</h2>
                </div>
              </div>
              <div className="grid two">
                {bank?.subjects.map((item) => (
                  <button
                    className="panel subject-card"
                    key={item.subject}
                    disabled={busy}
                    onClick={() => void startTest("practice", item.subject)}
                  >
                    <span>
                      <strong>{item.subject}</strong>
                      <small>{item.count} questions</small>
                    </span>
                    <b>→</b>
                  </button>
                ))}
              </div>
            </section>
            <AssignedExams />
            <p className="footnote">
              Assigned papers published by your examiner will appear above when they are ready.
            </p>
          </>
        )}
        {error && <p className="error">{error}</p>}
        {notice && <p className="success-message notice" role="status">{notice}</p>}
      </main>
      {activeAnnouncements[0] && (
        <div className="student-announcement-backdrop">
          <section className="student-announcement panel" role="dialog" aria-modal="true" aria-labelledby="announcement-title">
            <div className="announcement-mark">!</div>
            <p className="eyebrow">IMPORTANT ANNOUNCEMENT</p>
            <h2 id="announcement-title">{activeAnnouncements[0].title}</h2>
            <p className="announcement-message">{activeAnnouncements[0].message}</p>
            {activeAnnouncements[0].expiresAt && <small className="muted">Expires {new Date(activeAnnouncements[0].expiresAt).toLocaleString()}</small>}
            <button className="primary full" onClick={() => void dismissAnnouncement(activeAnnouncements[0].id)}>Got it</button>
            <small className="muted">This announcement will not pop up again after you acknowledge it.</small>
          </section>
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <a className="brand" href="#dashboard">
      <span className="brand-mark">A</span>
      <span>ArcTester</span>
    </a>
  );
}
