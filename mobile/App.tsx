import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { deleteLocalValue, getLocalValue, setLocalValue } from "./src/localSettings";
import StudentPracticeBuilder, { type PracticePaperConfig } from "./src/StudentPracticeBuilder";
import { clearOfflineLearningPackage, getOfflineLearningPackage, saveOfflineLearningPackage, type OfflineLearningPackage } from "./src/learningStore";
import OfflinePracticeLibrary from "./src/OfflinePracticeLibrary";

const API_URL = (() => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : true;
  if (isDev) return (url || "https://arctester.onrender.com").replace(/\/+$/, "");
  if (!url) throw new Error("EXPO_PUBLIC_API_URL is required for release builds. Set it to an https URL.");
  if (!/^https:\/\//.test(url)) throw new Error("EXPO_PUBLIC_API_URL must use https (cleartext http is blocked on Android).");
  return url.replace(/\/+$/, "");
})();
type User = { id: number; email: string; role: "ADMIN" | "STUDENT" };
type Bank = { total: number; practiceTotal?: number; subjects: { subject: string; count: number; practiceCount?: number; topics?: { topic: string; count: number; practiceCount?: number }[] }[] };
type LearningOverview = { practice: { completedAttempts: number; questions: number; correct: number; incorrect: number; unanswered: number; accuracy: number | null; subjects: { subject: string; accuracy: number | null; seen: number; correct: number; incorrect: number }[]; trend: { attemptId: number; finishedAt: string; accuracy: number | null; correct: number; total: number }[] }; formalExams: { graded: number; scorePercentage: number | null; reviewRequired: number; subjects: { subject: string; accuracy: number | null; correct: number; incorrect: number }[] } };
type Announcement = {
  id: string;
  title: string;
  message: string;
  publishedAt: string;
  expiresAt: string | null;
  seenAt?: string | null;
  acknowledgedAt?: string | null;
};
type Notification = {
  id: string;
  kind: string;
  title: string;
  message: string;
  href: string;
  createdAt: string;
  readAt: string | null;
  expiresAt: string | null;
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
  serverNow: string;
  questions: Question[];
  warnings?: string[];
  saved?: { questionId: number; selectedIndex: number | null }[];
};
type PracticeRecovery = {
  attemptId: number;
  answers: Record<number, number>;
  currentQuestionIndex: number;
};
type PracticeResult = {
  attemptId: number;
  mode: string;
  score: number;
  incorrect: number;
  unanswered: number;
  total: number;
  expired: boolean;
  breakdown: { subject: string; correct: number; incorrect: number; unanswered: number; total: number }[];
  questions: {
    questionId: number;
    subject: string;
    topic: string | null;
    text: string;
    options: string[];
    selectedIndex: number | null;
    correctIndex: number;
    isCorrect: boolean;
    explanation: string;
  }[];
};
class ApiRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiRequestError";
  }
}
const practiceRecoveryKey = (userId: number) => `arctester-practice-recovery:${userId}`;

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [register, setRegister] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [learningOverview, setLearningOverview] = useState<LearningOverview | null>(null);
  const [offlineLearningPackage, setOfflineLearningPackage] = useState<OfflineLearningPackage | null>(null);
  const [offlineBankBusy, setOfflineBankBusy] = useState(false);
  const [questionTextSize, setQuestionTextSize] = useState<14 | 16 | 18>(16);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [refreshingAnnouncements, setRefreshingAnnouncements] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [refreshingNotifications, setRefreshingNotifications] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [result, setResult] = useState<PracticeResult | null>(null);
  const [hasSavedPracticeAttempt, setHasSavedPracticeAttempt] = useState(false);
  const [checkingPracticeRecovery, setCheckingPracticeRecovery] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "practice" | "profile" | "settings">("home");

  const [darkMode, setDarkMode] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [busy, setBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sessionIdentity = token && user ? `${user.id}:${token}` : null;
  const sessionIdentityRef = useRef<string | null>(sessionIdentity);
  const notificationRequestSequence = useRef(0);
  sessionIdentityRef.current = sessionIdentity;
  const questionTransition = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const practiceSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const practiceRestoreLock = useRef(false);
  const questionSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  const [startupVisible, setStartupVisible] = useState(true);
  const startupFade = useRef(new Animated.Value(1)).current;
  const startupLogo = useRef(new Animated.Value(0)).current;
  const startupProgress = useRef(new Animated.Value(0)).current;
  const startupOrbit = useRef(new Animated.Value(0)).current;
  const startupPulse = useRef(new Animated.Value(0.85)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const statsEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => { void getLocalValue("arctester-dark-mode").then((value) => setDarkMode(value === "true")).catch(() => undefined); void getLocalValue("arctester-reduce-motion").then((value) => { if (value !== null) setReduceMotion(value === "true"); }).catch(() => undefined); void getLocalValue("arctester-question-text-size").then((value) => { if (value === "14" || value === "16" || value === "18") setQuestionTextSize(Number(value) as 14 | 16 | 18); }).catch(() => undefined); }, []);

  async function toggleDarkMode(value: boolean) {
    setDarkMode(value);
    try { await setLocalValue("arctester-dark-mode", String(value)); }
    catch { /* Keep the selected theme for this session even if persistence is unavailable. */ }
  }

  async function downloadOfflinePracticeBank() {
    if (!user) return;
    setOfflineBankBusy(true);
    setError("");
    try {
      const pack = await api<OfflineLearningPackage>("/learning/package");
      await saveOfflineLearningPackage(String(user.id), pack);
      setOfflineLearningPackage(pack);
    } catch (cause) {
      setError((cause as Error).message || "Could not download the offline practice bank.");
    } finally {
      setOfflineBankBusy(false);
    }
  }

  function removeOfflinePracticeBank() {
    if (!user || !offlineLearningPackage) return;
    Alert.alert("Remove offline practice bank?", "This removes downloaded practice questions from this device. Your account and exam records are not affected.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => {
        void clearOfflineLearningPackage(String(user.id)).then(() => setOfflineLearningPackage(null)).catch((cause) => setError((cause as Error).message));
      } },
    ]);
  }


  async function refreshQuestionBank() {
    setBusy(true); setError("");
    try { const fresh = await api<Bank>("/bank"); setBank(fresh); }
    catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  useEffect(() => {
    let mounted = true;
    void getLocalValue("arctester-reduce-motion").then(async (saved) => {
      if (saved === null) {
        const systemPreference = await AccessibilityInfo.isReduceMotionEnabled();
        if (mounted) setReduceMotion(systemPreference);
      }
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      startupLogo.setValue(1);
      startupProgress.setValue(1);
      startupFade.setValue(0);
      setStartupVisible(false);
      return;
    }
    const orbit = Animated.loop(
      Animated.timing(startupOrbit, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(startupPulse, { toValue: 1.08, duration: 850, useNativeDriver: true }),
        Animated.timing(startupPulse, { toValue: 0.85, duration: 850, useNativeDriver: true }),
      ]),
    );
    orbit.start();
    pulse.start();
    Animated.sequence([
      Animated.delay(180),
      Animated.parallel([
        Animated.spring(startupLogo, { toValue: 1, speed: 12, bounciness: 7, useNativeDriver: true }),
        Animated.timing(startupProgress, { toValue: 1, duration: 2350, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
      ]),
      Animated.delay(450),
      Animated.timing(startupFade, { toValue: 0, duration: 420, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setStartupVisible(false);
      orbit.stop();
      pulse.stop();
    });
    return () => {
      orbit.stop();
      pulse.stop();
      startupFade.stopAnimation();
      startupLogo.stopAnimation();
      startupProgress.stopAnimation();
    };
  }, [reduceMotion, startupFade, startupLogo, startupOrbit, startupProgress, startupPulse]);

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      statsEntrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    statsEntrance.setValue(0);
    Animated.parallel([
      Animated.timing(entrance, {
        toValue: 1,
        duration: 520,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(110),
        Animated.spring(statsEntrance, {
          toValue: 1,
          speed: 16,
          bounciness: 5,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [entrance, reduceMotion, statsEntrance, user, test]);

  async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_URL}${path}`, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new ApiRequestError(body.error || "The server request failed.", response.status);
    return body as T;
  }

  useEffect(() => {
    SecureStore.getItemAsync("arctester-token").then((saved) => {
      if (saved) setToken(saved);
    }).catch(async () => { await SecureStore.deleteItemAsync("arctester-token").catch(() => undefined); setToken(null); });
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ user: User }>("/auth/me")
      .then(async (result) => {
        if (result.user.role !== "STUDENT") {
          await SecureStore.deleteItemAsync("arctester-token").catch(() => undefined);
          setToken(null);
          setUser(null);
          setError("Admin accounts cannot use the mobile app. Please sign in through ArcTester Web.");
          return;
        }
        setUser(result.user);
      })
      .catch(async () => {
        await SecureStore.deleteItemAsync("arctester-token").catch(() => undefined);
        setToken(null);
      });
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    const requestIdentity = `${user.id}:${token}`;
    const initialNotificationRequest = ++notificationRequestSequence.current;
    let cancelled = false;
    const isCurrentSession = () => !cancelled && sessionIdentityRef.current === requestIdentity;
    setOfflineLearningPackage(null);
    const registerDevice = async () => {
      let fingerprint = await getLocalValue("arctester-device-fingerprint");
      if (!fingerprint) {
        fingerprint = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        await setLocalValue("arctester-device-fingerprint", fingerprint);
      }
      const platform = Platform.OS === "android" || Platform.OS === "ios" ? Platform.OS : "web";
      await api("/auth/devices/register", {
        method: "POST",
        body: JSON.stringify({
          deviceName:
            Platform.OS === "android"
              ? "Android device"
              : Platform.OS === "ios"
                ? "iOS device"
                : "Mobile app",
          platform,
          fingerprint,
        }),
      });
    };
    registerDevice().catch(() => undefined);
    api<Bank>("/bank")
      .then((result) => { if (isCurrentSession()) setBank(result); })
      .catch((cause) => { if (isCurrentSession()) setError((cause as Error).message); });
    api<LearningOverview>("/analytics/overview").then((result) => { if (isCurrentSession()) setLearningOverview(result); }).catch(() => undefined);
    getOfflineLearningPackage(String(user.id)).then((result) => { if (isCurrentSession()) setOfflineLearningPackage(result); }).catch(() => { if (isCurrentSession()) setOfflineLearningPackage(null); });
    api<{ announcements: Announcement[] }>("/announcements")
      .then((result) => { if (isCurrentSession()) setAnnouncements(result.announcements); })
      .catch(() => undefined);
    api<{ notifications: Notification[]; unreadCount?: number }>("/notifications")
      .then((result) => {
        if (!isCurrentSession() || notificationRequestSequence.current !== initialNotificationRequest) return;
        const items = (Array.isArray(result.notifications) ? result.notifications : [])
          .filter((item) => !["EXAM_ASSIGNMENT", "EXAM_RESULT"].includes(item.kind));
        setNotifications(items);
        setUnreadNotificationCount(items.filter((item) => !item.readAt).length);
      })
      .catch(() => undefined);
    setCheckingPracticeRecovery(true);
    void getLocalValue(practiceRecoveryKey(user.id)).then((raw) => {
      if (!isCurrentSession() || !raw) return;
      try {
        const recovery = JSON.parse(raw) as Partial<PracticeRecovery>;
        if (Number.isInteger(recovery.attemptId) && recovery.attemptId! > 0) {
          setHasSavedPracticeAttempt(true);
        } else {
          void deleteLocalValue(practiceRecoveryKey(user.id));
        }
      } catch {
        void deleteLocalValue(practiceRecoveryKey(user.id));
      }
    }).catch(() => undefined).finally(() => {
      if (isCurrentSession()) setCheckingPracticeRecovery(false);
    });
    return () => { cancelled = true; };
  }, [token, user]);

  async function refreshAnnouncements() {
    const requestIdentity = sessionIdentityRef.current;
    setRefreshingAnnouncements(true);
    try {
      const result = await api<{ announcements: Announcement[] }>("/announcements");
      if (sessionIdentityRef.current === requestIdentity) setAnnouncements(result.announcements);
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) setError((cause as Error).message);
    } finally {
      if (sessionIdentityRef.current === requestIdentity) setRefreshingAnnouncements(false);
    }
  }

  async function refreshNotifications() {
    const requestIdentity = sessionIdentityRef.current;
    const requestSequence = ++notificationRequestSequence.current;
    setRefreshingNotifications(true);
    try {
      const result = await api<{ notifications: Notification[]; unreadCount?: number }>("/notifications");
      if (sessionIdentityRef.current !== requestIdentity || notificationRequestSequence.current !== requestSequence) return;
      const items = (Array.isArray(result.notifications) ? result.notifications : [])
        .filter((item) => !["EXAM_ASSIGNMENT", "EXAM_RESULT"].includes(item.kind));
      setNotifications(items);
      setUnreadNotificationCount(items.filter((item) => !item.readAt).length);
    } catch (cause) {
      if (
        sessionIdentityRef.current === requestIdentity &&
        notificationRequestSequence.current === requestSequence
      ) setError((cause as Error).message);
    } finally {
      if (
        sessionIdentityRef.current === requestIdentity &&
        notificationRequestSequence.current === requestSequence
      ) setRefreshingNotifications(false);
    }
  }

  async function acknowledgeAnnouncement(id: string) {
    const requestIdentity = sessionIdentityRef.current;
    try {
      const result = await api<{ seenAt: string; acknowledgedAt: string | null }>(
        `/announcements/${encodeURIComponent(id)}/acknowledge`,
        { method: "POST" },
      );
      if (sessionIdentityRef.current === requestIdentity) {
        setAnnouncements((items) => items.map((item) => item.id === id
          ? { ...item, seenAt: result.seenAt, acknowledgedAt: result.acknowledgedAt }
          : item));
      }
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) setError((cause as Error).message);
    }
  }

  async function markNotificationRead(id: string) {
    const requestIdentity = sessionIdentityRef.current;
    const current = notifications.find((item) => item.id === id);
    if (!current || current.readAt) return;

    // Prevent a poll started before this action from restoring the unread row.
    notificationRequestSequence.current += 1;
    const optimisticReadAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => item.id === id
      ? { ...item, readAt: optimisticReadAt }
      : item));
    setUnreadNotificationCount((count) => Math.max(0, count - 1));

    try {
      const result = await api<{ readAt: string; alreadyRead?: boolean }>(
        `/notifications/${encodeURIComponent(id)}/read`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (sessionIdentityRef.current !== requestIdentity) return;
      setNotifications((items) => items.map((item) => item.id === id
        ? { ...item, readAt: result.readAt }
        : item));
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) {
        setError((cause as Error).message);
        void refreshNotifications();
      }
    }
  }

  function openNotification(notification: Notification) {
    void markNotificationRead(notification.id);
    if (notification.href === "/assignments" || /^\/assignments\/[^/]+\/result$/.test(notification.href)) {
      setActiveTab("home");
    }
  }

  async function authenticate() {
    setBusy(true);
    setError("");
    try {
      if (register) {
        await api("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            email: email.trim(),
            password,
            invitationToken: invitationToken.trim(),
          }),
        });
        setRegister(false);
        setInvitationToken("");
      } else {
        const result = await api<{ token: string; user: User }>("/auth/token", {
          method: "POST",
          body: JSON.stringify({ email: email.trim(), password }),
        });
        if (result.user.role !== "STUDENT") {
          setError("Admin accounts cannot use the mobile app. Please sign in through ArcTester Web.");
          setPassword("");
          return;
        }
        await SecureStore.setItemAsync("arctester-token", result.token).catch(() => { throw new Error("Secure sign-in storage is unavailable. Update or reinstall ArcTester, then sign in again."); });
        setToken(result.token);
        setUser(result.user);
      }
      setPassword("");
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function savePracticeRecovery(attemptId: number, nextAnswers: Record<number, number>, nextIndex: number) {
    if (!user) return;
    const requestIdentity = sessionIdentityRef.current;
    const payload: PracticeRecovery = { attemptId, answers: nextAnswers, currentQuestionIndex: nextIndex };
    practiceSaveQueue.current = practiceSaveQueue.current
      .catch(() => undefined)
      .then(() => setLocalValue(practiceRecoveryKey(user.id), JSON.stringify(payload)));
    try {
      await practiceSaveQueue.current;
      if (sessionIdentityRef.current === requestIdentity) setHasSavedPracticeAttempt(true);
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) {
        setError(`Practice is running, but its local recovery copy could not be saved: ${(cause as Error).message}`);
      }
    }
  }

  function updatePracticeAnswer(questionId: number, selectedIndex: number) {
    if (!test) return;
    const nextAnswers = { ...answers, [questionId]: selectedIndex };
    setAnswers(nextAnswers);
    void savePracticeRecovery(test.attemptId, nextAnswers, currentQuestionIndex);
  }

  function updatePracticeQuestionIndex(nextIndex: number) {
    if (!test) return;
    const safeIndex = Math.max(0, Math.min(test.questions.length - 1, nextIndex));
    setCurrentQuestionIndex(safeIndex);
    void savePracticeRecovery(test.attemptId, answers, safeIndex);
  }

  async function resumePractice() {
    if (!user || busy || practiceRestoreLock.current) return;
    practiceRestoreLock.current = true;
    const requestIdentity = sessionIdentityRef.current;
    setBusy(true);
    setError("");
    let recoveryAttemptId: number | null = null;
    try {
      const raw = await getLocalValue(practiceRecoveryKey(user.id));
      if (!raw) {
        if (sessionIdentityRef.current === requestIdentity) setHasSavedPracticeAttempt(false);
        return;
      }
      let recovery: PracticeRecovery;
      try {
        recovery = JSON.parse(raw) as PracticeRecovery;
      } catch {
        await deleteLocalValue(practiceRecoveryKey(user.id));
        setHasSavedPracticeAttempt(false);
        throw new Error("The saved practice recovery record was corrupted and has been cleared.");
      }
      if (
        !Number.isInteger(recovery.attemptId) || recovery.attemptId <= 0 ||
        !recovery.answers || typeof recovery.answers !== "object" ||
        !Number.isInteger(recovery.currentQuestionIndex)
      ) {
        await deleteLocalValue(practiceRecoveryKey(user.id));
        setHasSavedPracticeAttempt(false);
        throw new Error("The saved practice recovery record was invalid and has been cleared.");
      }
      recoveryAttemptId = recovery.attemptId;
      const restored = await api<Test>(`/tests/${recovery.attemptId}`);
      if (sessionIdentityRef.current !== requestIdentity) return;
      if (restored.mode !== "practice" || !restored.questions.length) {
        throw new Error("This saved item is not a resumable practice attempt.");
      }
      const serverAnswers = Object.fromEntries(
        (restored.saved ?? [])
          .filter((answer) => answer.selectedIndex !== null)
          .map((answer) => [answer.questionId, answer.selectedIndex as number]),
      );
      const localAnswers = recovery.answers && typeof recovery.answers === "object" ? recovery.answers : {};
      setTest(restored);
      setResult(null);
      setAnswers({ ...serverAnswers, ...localAnswers });
      setCurrentQuestionIndex(Math.max(0, Math.min(restored.questions.length - 1, recovery.currentQuestionIndex ?? 0)));
      const remaining = restored.deadline && restored.serverNow
        ? Math.ceil((Date.parse(restored.deadline) - Date.parse(restored.serverNow)) / 1000)
        : 20 * 60;
      setSecondsLeft(Math.max(0, remaining));
      setHasSavedPracticeAttempt(false);
    } catch (cause) {
      if (sessionIdentityRef.current !== requestIdentity) return;
      if (cause instanceof ApiRequestError && cause.status === 404) {
        await deleteLocalValue(practiceRecoveryKey(user.id));
        setHasSavedPracticeAttempt(false);
      } else if (cause instanceof ApiRequestError && cause.status === 409 && recoveryAttemptId !== null) {
        // The submit may have reached the server before the app lost its response.
        // Recover the completed result instead of leaving the student stranded.
        try {
          const completed = await api<PracticeResult>(`/tests/${recoveryAttemptId}/result`);
          if (sessionIdentityRef.current === requestIdentity) {
            await deleteLocalValue(practiceRecoveryKey(user.id));
            setHasSavedPracticeAttempt(false);
            setResult(completed);
            setError("");
          }
          return;
        } catch {
          // A 409 can also mean an invalid/non-resumable attempt. Preserve the
          // local copy unless the server definitively says it does not exist.
        }
      }
      setError((cause as Error).message);
    } finally {
      practiceRestoreLock.current = false;
      if (sessionIdentityRef.current === requestIdentity) setBusy(false);
    }
  }

  async function startPractice(config: PracticePaperConfig) {
    if (checkingPracticeRecovery) {
      setError("Checking this account for a saved practice attempt. Try again in a moment.");
      return;
    }
    if (hasSavedPracticeAttempt) {
      setError("Resume or submit your saved practice before starting another one.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Refresh the bank immediately before creating a session. The dashboard
      // count can be stale after an administrator imports or publishes questions.
      const freshBank = await api<Bank>("/bank");
      setBank(freshBank);
      const availableSubjects = freshBank.subjects.filter((item) => item.count > 0);
      if (availableSubjects.length === 0) throw new Error("The question bank currently has no practice questions.");
      const created = await api<Test>("/tests", {
        method: "POST",
        body: JSON.stringify({ mode: "practice", subjects: config.subjects, topicFilters: config.topicFilters, difficulty: config.difficulty, count: config.count }),
      });
      setTest(created);
      setResult(null);
      setAnswers({});
      setCurrentQuestionIndex(0);
      const remaining = created.deadline && created.serverNow
        ? Math.ceil((Date.parse(created.deadline) - Date.parse(created.serverNow)) / 1000)
        : 20 * 60;
      setSecondsLeft(Math.max(0, remaining));
      if (user) {
        await setLocalValue(practiceRecoveryKey(user.id), JSON.stringify({
          attemptId: created.attemptId,
          answers: {},
          currentQuestionIndex: 0,
        } satisfies PracticeRecovery));
        setHasSavedPracticeAttempt(true);
      }
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!test) return;
    const deadlineMs = test.deadline ? Date.parse(test.deadline) : Number.NaN;
    const serverNowMs = Date.parse(test.serverNow);
    if (Number.isFinite(deadlineMs) && Number.isFinite(serverNowMs)) {
      // Recalculate from the server deadline on every tick. This catches up
      // after the app is backgrounded instead of trusting throttled intervals.
      const serverOffsetMs = serverNowMs - Date.now();
      const tick = () => {
        setSecondsLeft(Math.max(0, Math.ceil((deadlineMs - (Date.now() + serverOffsetMs)) / 1000)));
      };
      tick();
      const timer = setInterval(tick, 1000);
      return () => clearInterval(timer);
    }
    const timer = setInterval(() => {
      setSecondsLeft((remaining) => Math.max(0, remaining - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [test]);

  useEffect(() => {
    if (!test) return;
    if (reduceMotion) {
      questionTransition.setValue(1);
      progress.setValue((currentQuestionIndex + 1) / test.questions.length);
      return;
    }
    questionTransition.setValue(0);
    Animated.timing(questionTransition, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    Animated.timing(progress, {
      toValue: (currentQuestionIndex + 1) / test.questions.length,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [test, currentQuestionIndex, progress, questionTransition, reduceMotion]);

  function formatTime(totalSeconds: number) {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }

  function confirmSubmit() {
    if (!test || busy) return;
    const answered = Object.keys(answers).length;
    const unanswered = test.questions.length - answered;
    Alert.alert(
      "Submit practice?",
      unanswered > 0
        ? `You answered ${answered} of ${test.questions.length} questions. ${unanswered} will be submitted unanswered.`
        : `You answered all ${test.questions.length} questions. Submit your practice now?`,
      [
        { text: "Keep practicing", style: "cancel" },
        { text: "Submit", style: "default", onPress: () => { void submit(); } },
      ],
    );
  }

  function confirmExitPractice() {
    if (!test || busy) return;
    const answered = Object.keys(answers).length;
    Alert.alert(
      "Exit practice?",
      answered > 0
        ? `Your ${answered} answered question(s) are saved on this device. You can resume later.`
        : "Your practice attempt is saved on this device and can be resumed later.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Exit to dashboard", style: "default", onPress: () => { setTest(null); setHasSavedPracticeAttempt(true); } },
      ],
    );
  }

  async function submit() {
    if (!test || !user) return;
    setBusy(true);
    try {
      await practiceSaveQueue.current;
      const summary = await api<{ attemptId: number; score: number; total: number; expired: boolean }>(
        `/tests/${test.attemptId}/submit`,
        {
          method: "POST",
          body: JSON.stringify({
            answers: test.questions.map((question) => ({
              questionId: question.id,
              selectedIndex: answers[question.id] ?? null,
            })),
          }),
        },
      );
      await deleteLocalValue(practiceRecoveryKey(user.id));
      setHasSavedPracticeAttempt(false);
      setTest(null);
      setCurrentQuestionIndex(0);
      try {
        const review = await api<PracticeResult>(`/tests/${test.attemptId}/result`);
        setResult(review);
        setError("");
      } catch {
        setError(`Practice submitted: ${summary.score}/${summary.total}. Full review could not be loaded; retry from the web app.`);
      }
      const fresh = await api<Bank>("/bank");
      setBank(fresh);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    sessionIdentityRef.current = null;
    setBusy(false);
    await SecureStore.deleteItemAsync("arctester-token").catch(() => undefined);
    setToken(null);
    setUser(null);
    setBank(null);
    setAnnouncements([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
    setRefreshingAnnouncements(false);
    setRefreshingNotifications(false);
    setTest(null);
    setResult(null);
    setHasSavedPracticeAttempt(false);
    setCheckingPracticeRecovery(false);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setActiveTab("home");
  }

  return (
    <SafeAreaView style={[styles.safe, darkMode && { backgroundColor: "#0b1220" }]}>
      <StatusBar style={startupVisible || darkMode ? "light" : "dark"} />
      <ScrollView style={[styles.dashboardScroll, darkMode && { backgroundColor: "#0b1220" }]} contentContainerStyle={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>A</Text>
          </View>
          <View>
            <Text style={styles.brand}>ArcTester</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Practice with purpose</Text>
          </View>
        </View>

        {!user ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>{register ? "Create your account" : "Welcome back"}</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>
              {register
                ? "Enter the invitation code shared by your admin."
                : "Sign in to continue your preparation."}
            </Text>
            <TextInput
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="Email address"
              placeholderTextColor="#8b95a7"
              value={email}
              onChangeText={setEmail}
              style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
            />
            <TextInput
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#8b95a7"
              value={password}
              onChangeText={setPassword}
              style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
            />
            {register && (
              <TextInput
                autoCapitalize="none"
                placeholder="Invitation code"
                placeholderTextColor="#8b95a7"
                value={invitationToken}
                onChangeText={setInvitationToken}
                style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
              />
            )}
            <TouchableOpacity disabled={busy} onPress={authenticate} style={styles.primary}>
              <Text style={styles.primaryText}>
                {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRegister(!register)} style={styles.secondary}>
              <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>
                {register
                  ? "Already have an account? Sign in"
                  : "Have an invitation? Create account"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : result ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>Practice result</Text>
            <Text style={styles.statValue}>{result.score} / {result.total}</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{result.incorrect} incorrect · {result.unanswered} unanswered</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{result.expired ? "Time expired" : "Submitted successfully"}</Text>
            {result.breakdown.map((item) => (
              <View key={item.subject} style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>{item.subject}</Text>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{item.correct} correct · {item.incorrect} incorrect · {item.unanswered} unanswered</Text>
              </View>
            ))}
            <Text style={[styles.sectionTitle, darkMode && { color: "#f1f5f9" }]}>Answer review</Text>
            {result.questions.map((question, index) => (
              <View key={question.questionId} style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>Question {index + 1} · {question.subject}</Text>
                <Text style={[styles.announcementMessage, darkMode && { color: "#cbd5e1" }]}>{question.text}</Text>
                {question.options.map((option, optionIndex) => (
                  <Text key={optionIndex} style={{
                    color: optionIndex === question.correctIndex ? "#15803d" : optionIndex === question.selectedIndex ? "#b42318" : "#526078",
                    fontWeight: optionIndex === question.correctIndex || optionIndex === question.selectedIndex ? "800" : "400",
                    marginTop: 6,
                  }}>
                    {String.fromCharCode(65 + optionIndex)}. {option}{optionIndex === question.correctIndex ? " · Correct" : optionIndex === question.selectedIndex ? " · Your answer" : ""}
                  </Text>
                ))}
                <Text style={[styles.announcementDate, darkMode && { color: "#94a3b8" }]}>{question.explanation || "No explanation provided."}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => setResult(null)} style={styles.primary}>
              <Text style={styles.primaryText}>Back to dashboard</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : test ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <View style={styles.examHeader}>
              <View>
                <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>Practice session</Text>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Question {currentQuestionIndex + 1} of {test.questions.length}</Text>
              </View>
              <View style={[styles.timerPill, secondsLeft === 0 && styles.timerExpired]}>
                <MaterialCommunityIcons name="timer-outline" size={17} color={secondsLeft === 0 ? "#b42318" : "#2563eb"} />
                <Text style={[styles.timerText, secondsLeft === 0 && styles.timerExpiredText]}>{formatTime(secondsLeft)}</Text>
              </View>
            </View>
            <View style={[styles.progressTrack, darkMode && { backgroundColor: "#334155" }]}>
              <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
            </View>
            <Text style={[styles.examHint, darkMode && { color: "#94a3b8" }]}>{Object.keys(answers).length} of {test.questions.length} answered · timed practice</Text>
            {test.warnings?.map((warning, index) => <Text key={index} style={[styles.timerNotice, darkMode && { color: "#fbbf24" }]}>{warning}</Text>)}
            <View style={[styles.navigator, darkMode && { backgroundColor: "#172235", borderColor: "#334155" }]}>
              <Text style={[styles.navigatorTitle, darkMode && { color: "#cbd5e1" }]}>JUMP TO QUESTION</Text>
              <View style={styles.navigatorGrid}>
                {test.questions.map((question, index) => {
                  const answered = answers[question.id] !== undefined;
                  const current = index === currentQuestionIndex;
                  return (
                    <TouchableOpacity
                      key={question.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Question ${index + 1}${answered ? ", answered" : ", unanswered"}`}
                      accessibilityState={{ selected: current }}
                      onPress={() => updatePracticeQuestionIndex(index)}
                      style={[
                        styles.navigatorItem,
                        darkMode && { backgroundColor: "#1e293b", borderColor: "#475569" },
                        answered && styles.navigatorAnswered,
                        current && styles.navigatorCurrent,
                      ]}
                    >
                      <Text style={[
                        styles.navigatorNumber,
                        answered && styles.navigatorNumberAnswered,
                        current && styles.navigatorNumberCurrent,
                      ]}>{index + 1}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <View style={styles.navigatorLegend}>
                <Text style={[styles.navigatorLegendText, darkMode && { color: "#94a3b8" }]}>● Answered</Text>
                <Text style={[styles.navigatorLegendText, darkMode && { color: "#94a3b8" }]}>○ Unanswered</Text>
              </View>
            </View>
            {secondsLeft === 0 && <Text style={styles.timerNotice}>Time is up. Submit your answers to finish.</Text>}
            {test.questions[currentQuestionIndex] && (
              <Animated.View
                key={test.questions[currentQuestionIndex].id}
                onTouchStart={(event) => {
                  questionSwipeStart.current = {
                    x: event.nativeEvent.pageX,
                    y: event.nativeEvent.pageY,
                  };
                }}
                onTouchEnd={(event) => {
                  const start = questionSwipeStart.current;
                  questionSwipeStart.current = null;
                  if (!start || busy) return;
                  const dx = event.nativeEvent.pageX - start.x;
                  const dy = event.nativeEvent.pageY - start.y;
                  if (Math.abs(dx) < 72 || Math.abs(dx) < Math.abs(dy) * 1.25) return;
                  updatePracticeQuestionIndex(currentQuestionIndex + (dx < 0 ? 1 : -1));
                }}
                style={[
                  styles.question,
                  {
                    opacity: questionTransition,
                    transform: [{ translateX: questionTransition.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                  },
                ]}
              >
                <Text style={[styles.examHint, darkMode && { color: "#94a3b8" }]}>{test.questions[currentQuestionIndex].subject}{test.questions[currentQuestionIndex].topic ? " · " + test.questions[currentQuestionIndex].topic : ""}</Text>
                <Text style={[styles.questionTitle, { fontSize: questionTextSize }, darkMode && { color: "#f1f5f9" }]}>{test.questions[currentQuestionIndex].text}</Text>
                <Text style={styles.swipeHint}>Swipe left for next · right for previous</Text>
                {test.questions[currentQuestionIndex].options.map((option, optionIndex) => {
                  const selected = answers[test.questions[currentQuestionIndex].id] === optionIndex;
                  return (
                    <TouchableOpacity
                      key={optionIndex}
                      onPress={() => updatePracticeAnswer(test.questions[currentQuestionIndex].id, optionIndex)}
                      style={[styles.option, darkMode && { borderColor: "#475569" }, selected && styles.optionSelected]}
                      activeOpacity={0.78}
                    >
                      <View style={styles.optionRow}>
                        <View style={[styles.optionLetter, selected && styles.optionLetterSelected]}>
                          <Text style={[styles.optionLetterText, selected && styles.optionLetterTextSelected]}>{String.fromCharCode(65 + optionIndex)}</Text>
                        </View>
                        <Text style={[styles.optionText, { flex: 1 }, darkMode && { color: "#e2e8f0" }]}>{option}</Text>
                        {selected && <MaterialCommunityIcons name="check-circle" size={20} color="#2563eb" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </Animated.View>
            )}
            <View style={styles.examActions}>
              <TouchableOpacity
                disabled={currentQuestionIndex === 0}
                onPress={() => updatePracticeQuestionIndex(currentQuestionIndex - 1)}
                style={[styles.examSecondary, currentQuestionIndex === 0 && styles.examButtonDisabled]}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color={currentQuestionIndex === 0 ? "#aab2c0" : "#526078"} />
                <Text style={[styles.examSecondaryText, darkMode && { color: "#cbd5e1" }]}>Previous</Text>
              </TouchableOpacity>
              {currentQuestionIndex < test.questions.length - 1 ? (
                <TouchableOpacity onPress={() => updatePracticeQuestionIndex(currentQuestionIndex + 1)} style={styles.examNext}>
                  <Text style={styles.primaryText}>Next question</Text>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#ffffff" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity disabled={busy} onPress={confirmSubmit} style={styles.examNext}>
                  <Text style={styles.primaryText}>{busy ? "Submitting…" : "Submit practice"}</Text>
                  <MaterialCommunityIcons name="check" size={19} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
            {currentQuestionIndex < test.questions.length - 1 && (
              <TouchableOpacity disabled={busy} onPress={confirmSubmit} style={styles.submitLink}>
                <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Submit practice now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={confirmExitPractice} style={styles.secondary}>
              <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Exit practice</Text>
            </TouchableOpacity>
          </Animated.View>
                   ) : activeTab === "practice" ? (
           <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
             {hasSavedPracticeAttempt && <TouchableOpacity disabled={busy || checkingPracticeRecovery} onPress={() => void resumePractice()} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Restoring…" : "Resume saved practice"}</Text></TouchableOpacity>}
             {bank ? <StudentPracticeBuilder subjects={bank.subjects} total={bank.total} darkMode={darkMode} disabled={busy || checkingPracticeRecovery || hasSavedPracticeAttempt} onRefresh={() => void refreshQuestionBank()} onStart={(config) => void startPractice(config)} /> : <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Loading subject and topic catalogue…</Text>}
              {offlineLearningPackage ? <OfflinePracticeLibrary questions={offlineLearningPackage.questions} darkMode={darkMode} /> : null}
           </Animated.View>
) : activeTab === "settings" ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>Settings</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>App preferences and account controls</Text>
            <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>APPEARANCE</Text><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}><View style={{ flex: 1 }}><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>Dark mode</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Use a darker interface in low light</Text></View><Switch value={darkMode} onValueChange={(value) => void toggleDarkMode(value)} accessibilityLabel="Enable dark mode" /></View></View>
            <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>QUESTION DISPLAY</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Question text size</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>{([14, 16, 18] as const).map((size) => <TouchableOpacity key={size} onPress={() => { setQuestionTextSize(size); void setLocalValue("arctester-question-text-size", String(size)).catch(() => undefined); }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: questionTextSize === size ? "#dbeafe" : (darkMode ? "#26364d" : "#f1f5f9") }}><Text style={{ color: questionTextSize === size ? "#1d4ed8" : (darkMode ? "#cbd5e1" : "#526078"), fontWeight: "700" }}>{size === 14 ? "Small" : size === 16 ? "Medium" : "Large"}</Text></TouchableOpacity>)}</View></View>
            <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>OFFLINE PRACTICE</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{offlineLearningPackage ? offlineLearningPackage.total + " practice questions · " + offlineLearningPackage.subjects.length + " subjects downloaded" : "No practice question bank is saved on this device."}</Text>{offlineLearningPackage ? <Text style={[styles.muted, darkMode && { color: "#94a3b8" }]}>Downloaded {new Date(offlineLearningPackage.exportedAt).toLocaleString()}</Text> : null}<TouchableOpacity onPress={() => void downloadOfflinePracticeBank()} disabled={offlineBankBusy || busy} style={[styles.secondary, { marginTop: 10 }]}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>{offlineBankBusy ? "Downloading…" : offlineLearningPackage ? "Update offline question bank" : "Download practice bank"}</Text></TouchableOpacity>{offlineLearningPackage ? <TouchableOpacity onPress={removeOfflinePracticeBank} disabled={offlineBankBusy} style={styles.secondary}><Text style={[styles.secondaryText, { color: "#b42318" }]}>Remove offline download</Text></TouchableOpacity> : null}</View>
             <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACCESSIBILITY</Text><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}><View style={{ flex: 1 }}><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>Reduce motion</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Reduce animated transitions</Text></View><Switch value={reduceMotion} onValueChange={(value) => { setReduceMotion(value); void setLocalValue("arctester-reduce-motion", String(value)).catch(() => undefined); }} /></View></View><View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACCOUNT</Text><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{user.email}</Text></View>
            <TouchableOpacity onPress={refreshQuestionBank} disabled={busy} style={styles.secondary}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>{busy ? "Refreshing…" : "Refresh question bank"}</Text></TouchableOpacity>
            <TouchableOpacity onPress={signOut} style={styles.dangerButton}><MaterialCommunityIcons name="logout" size={18} color="#b42318" /><Text style={styles.dangerText}>Sign out</Text></TouchableOpacity>
          </Animated.View>
        ) : activeTab === "profile" ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <View style={styles.profileAvatar}>
              <MaterialCommunityIcons name="account" size={34} color="#ffffff" />
            </View>
            <Text style={[styles.heading, { textAlign: "center" }, darkMode && { color: "#f1f5f9" }]}>Your profile</Text>
            <Text style={[styles.muted, { textAlign: "center" }, darkMode && { color: "#a7b4c8" }]}>{user.email}</Text>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACCOUNT ID</Text>
              <Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{user.id}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>QUESTION BANK</Text>
              <Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{bank?.total ?? "Loading…"} questions</Text>
            </View>
            <TouchableOpacity onPress={signOut} style={styles.dangerButton}>
              <MaterialCommunityIcons name="logout" size={18} color="#b42318" />
              <Text style={styles.dangerText}>Sign out</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            <Animated.View style={[styles.hero, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>SIGNED IN AS</Text>
              <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>{user.email}</Text>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Your next focused session starts here.</Text>
            </Animated.View>
            <Animated.View style={[styles.stats, { opacity: statsEntrance, transform: [{ translateY: statsEntrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: statsEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
              <View style={[styles.stat, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.statValue, darkMode && { color: "#f1f5f9" }]}>{bank?.total ?? "—"}</Text>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Questions</Text>
              </View>
              <View style={[styles.stat, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.statValue, darkMode && { color: "#f1f5f9" }]}>{bank?.subjects.length ?? "—"}</Text>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Subjects</Text>
              </View>
            </Animated.View>
            <View style={[styles.card, { marginTop: 14, padding: 16 }, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}><Text style={[styles.sectionTitle, { marginTop: 0 }, darkMode && { color: "#f1f5f9" }]}>Your performance</Text>
              <View style={styles.dashboardMetricGrid}>
                <View style={[styles.dashboardMetric, darkMode && { backgroundColor: "#1e293b" }]}><Text style={[styles.dashboardMetricValue, darkMode && { color: "#93c5fd" }]}>{learningOverview?.practice.completedAttempts ?? "—"}</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Practice papers</Text></View>
                <View style={[styles.dashboardMetric, darkMode && { backgroundColor: "#1e293b" }]}><Text style={[styles.dashboardMetricValue, darkMode && { color: "#93c5fd" }]}>{learningOverview?.practice.accuracy == null ? "—" : Math.round(learningOverview.practice.accuracy * 100) + "%"}</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Practice accuracy</Text></View>
              </View>
              {learningOverview?.practice.trend.length ? <View style={{ marginTop: 14 }}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>RECENT PRACTICE ACCURACY</Text>{learningOverview.practice.trend.slice(-6).map((item) => { const percent = item.accuracy === null ? 0 : Math.round(item.accuracy * 100); return <View key={item.attemptId} style={{ marginTop: 8 }}><View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={[styles.muted, darkMode && { color: "#cbd5e1" }]}>{new Date(item.finishedAt).toLocaleDateString()}</Text><Text style={[styles.muted, darkMode && { color: "#cbd5e1" }]}>{item.accuracy === null ? "No answered questions" : percent + "%"}</Text></View><View style={{ height: 7, borderRadius: 8, backgroundColor: darkMode ? "#334155" : "#e9edf5", overflow: "hidden", marginTop: 4 }}><View style={{ height: "100%", width: `${percent}%` as `${number}%`, backgroundColor: "#2563eb", borderRadius: 8 }} /></View></View>; })}</View> : null}
              {learningOverview?.practice.subjects.length ? <View style={{ marginTop: 14 }}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>SUBJECT ACCURACY · LOWEST FIRST</Text>{learningOverview.practice.subjects.slice(0, 3).map((item) => <View key={item.subject} style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 7 }}><Text style={[styles.muted, darkMode && { color: "#cbd5e1" }]}>{item.subject}</Text><Text style={[styles.muted, darkMode && { color: "#cbd5e1" }]}>{item.accuracy === null ? "—" : Math.round(item.accuracy * 100) + "%"} · {item.seen} answered</Text></View>)}</View> : null}
            </View>
            <View style={styles.announcementHeader}>
              <Text style={[styles.sectionTitle, darkMode && { color: "#f1f5f9" }]}>Announcements</Text>
              <TouchableOpacity onPress={refreshAnnouncements} disabled={refreshingAnnouncements}>
                <Text style={styles.refreshText}>
                  {refreshingAnnouncements ? "Refreshing…" : "Refresh"}
                </Text>
              </TouchableOpacity>
            </View>
            {announcements.length === 0 ? (
              <View style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>No announcements right now.</Text>
              </View>
            ) : (
              announcements.map((announcement) => (
                <Animated.View key={announcement.id} style={[styles.announcementCard, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                  <Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>{announcement.title}</Text>
                  <Text style={[styles.announcementMessage, darkMode && { color: "#cbd5e1" }]}>{announcement.message}</Text>
                  <Text style={[styles.announcementDate, darkMode && { color: "#94a3b8" }]}>
                    {new Date(announcement.publishedAt).toLocaleString()}
                  </Text>
                  {announcement.seenAt ? (
                    <Text style={[styles.announcementDate, darkMode && { color: "#94a3b8" }]}>Seen</Text>
                  ) : (
                    <TouchableOpacity onPress={() => void acknowledgeAnnouncement(announcement.id)} style={styles.secondary}>
                      <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Mark as seen</Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              ))
            )}
            <View style={styles.announcementHeader}>
              <Text style={[styles.sectionTitle, darkMode && { color: "#f1f5f9" }]}>
                Notifications{unreadNotificationCount > 0 ? ` · ${unreadNotificationCount} unread` : ""}
              </Text>
              <TouchableOpacity onPress={refreshNotifications} disabled={refreshingNotifications}>
                <Text style={styles.refreshText}>
                  {refreshingNotifications ? "Refreshing…" : "Refresh"}
                </Text>
              </TouchableOpacity>
            </View>
            {notifications.length === 0 ? (
              <View style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>No notifications right now.</Text>
              </View>
            ) : (
              notifications.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  onPress={() => openNotification(notification)}
                  style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#334155" }, !notification.readAt && styles.notificationUnread]}
                  accessibilityRole="button"
                  accessibilityLabel={`${notification.readAt ? "Read" : "Unread"} notification: ${notification.title}`}
                >
                  <View style={styles.announcementHeader}>
                    <Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>{notification.title}</Text>
                    {!notification.readAt ? <Text style={styles.notificationBadge}>NEW</Text> : null}
                  </View>
                  <Text style={[styles.announcementMessage, darkMode && { color: "#cbd5e1" }]}>{notification.message}</Text>
                  <Text style={[styles.announcementDate, darkMode && { color: "#94a3b8" }]}>{new Date(notification.createdAt).toLocaleString()}</Text>
                </TouchableOpacity>
              ))
            )}
            {hasSavedPracticeAttempt && (
              <TouchableOpacity disabled={busy} onPress={() => void resumePractice()} style={styles.primary}>
                <Text style={styles.primaryText}>{busy ? "Restoring…" : "Resume saved practice"}</Text>
              </TouchableOpacity>
            )}

<TouchableOpacity onPress={signOut} style={styles.secondary}>
              <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Sign out</Text>
            </TouchableOpacity>
          </>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator style={{ marginTop: 16 }} />}
        <Text style={[styles.footer, darkMode && { color: "#64748b" }]}>ArcTester · Your progress, across devices</Text>
      </ScrollView>
      {user && !test && (
        <Animated.View style={[styles.bottomNav, animatedEntrance(entrance), darkMode && { backgroundColor: "#111c2e", borderColor: "#334155" }]}>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "home" }} accessibilityLabel="Home tab" style={styles.navItem} onPress={() => setActiveTab("home")}>
            <MaterialCommunityIcons name="view-dashboard" size={23} color={activeTab === "home" ? "#2563eb" : "#8993a5"} />
            <Text style={[styles.navLabel, activeTab === "home" && styles.navLabelActive]}>Home</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "practice" }} accessibilityLabel="Practice tab" style={styles.navItem} onPress={() => setActiveTab("practice")}><MaterialCommunityIcons name="pencil-box-multiple" size={23} color={activeTab === "practice" ? "#2563eb" : "#8993a5"} /><Text style={[styles.navLabel, activeTab === "practice" && styles.navLabelActive]}>Practice</Text></TouchableOpacity>

          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "settings" }} accessibilityLabel="Settings tab" style={styles.navItem} onPress={() => setActiveTab("settings")}><MaterialCommunityIcons name="cog" size={23} color={activeTab === "settings" ? "#2563eb" : "#8993a5"} /><Text style={[styles.navLabel, activeTab === "settings" && styles.navLabelActive]}>Settings</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "profile" }} accessibilityLabel="Profile tab" style={styles.navItem} onPress={() => setActiveTab("profile")}>
            <MaterialCommunityIcons name="account-circle" size={23} color={activeTab === "profile" ? "#2563eb" : "#8993a5"} />
            <Text style={[styles.navLabel, activeTab === "profile" && styles.navLabelActive]}>Profile</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      {startupVisible && (
        <Animated.View style={[styles.startupOverlay, { opacity: startupFade }]}>
          <View style={styles.startupContent}>
            <Animated.View style={[styles.startupOrbit, {
              transform: [{ rotate: startupOrbit.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] }) }, { scale: startupPulse }],
            }]}>
              <View style={styles.startupOrbitDot} />
            </Animated.View>
            <Animated.View style={[styles.startupLogoFrame, {
              opacity: startupLogo,
              transform: [
                { scale: startupLogo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
                { translateY: startupLogo.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            }]}>
              <Text style={styles.startupLogoText}>A</Text>
            </Animated.View>
            <Animated.Text style={[styles.startupEyebrow, { opacity: startupLogo }]}>NEURAL EXAMINATION SYSTEM</Animated.Text>
            <Animated.Text style={[styles.startupTitle, { opacity: startupLogo }]}>ArcTester</Animated.Text>
            <Animated.Text style={[styles.startupSubtitle, { opacity: startupLogo }]}>ESTABLISHING SECURE CONNECTION</Animated.Text>
            <View style={styles.startupProgressTrack}>
              <Animated.View style={[styles.startupProgressFill, {
                width: startupProgress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }),
              }]} />
            </View>
            <Animated.Text style={[styles.startupLinkText, { opacity: startupLogo }]}>LINK START</Animated.Text>
            <Animated.Text style={[styles.startupStatus, { opacity: startupLogo }]}>SYSTEM LINK ESTABLISHED  ·  READY</Animated.Text>
          </View>
          <Text style={styles.startupFooter}>ARCTESTER OS  /  MOBILE INTERFACE</Text>
        </Animated.View>
      )}
    </SafeAreaView>
  );
}

function animatedEntrance(value: Animated.Value) {
  return {
    opacity: value,
    transform: [
      { translateY: value.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) },
      { scale: value.interpolate({ inputRange: [0, 1], outputRange: [0.985, 1] }) },
    ],
  };
}

const styles = StyleSheet.create({
  startupOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    elevation: 100,
    backgroundColor: "#050b18",
    alignItems: "center",
    justifyContent: "center",
    padding: 28,
  },
  startupContent: { width: "100%", maxWidth: 360, alignItems: "center" },
  startupOrbit: {
    position: "absolute",
    top: 12,
    width: 184,
    height: 184,
    borderRadius: 92,
    borderWidth: 1,
    borderColor: "rgba(56,189,248,0.32)",
    borderStyle: "dashed",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  startupOrbitDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: "#67e8f9", marginRight: -5, shadowColor: "#22d3ee", shadowOpacity: 1, shadowRadius: 12, elevation: 8 },
  startupLogoFrame: {
    width: 112,
    height: 112,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: "#38bdf8",
    backgroundColor: "rgba(14,165,233,0.12)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#0ea5e9",
    shadowOpacity: 0.65,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
    marginBottom: 36,
  },
  startupLogoText: { color: "#e0f2fe", fontSize: 58, fontWeight: "200", letterSpacing: -4 },
  startupEyebrow: { color: "#67e8f9", fontSize: 9, fontWeight: "800", letterSpacing: 3, marginBottom: 9 },
  startupTitle: { color: "#f8fafc", fontSize: 34, fontWeight: "800", letterSpacing: 1 },
  startupSubtitle: { color: "#94a3b8", fontSize: 9, fontWeight: "700", letterSpacing: 2, marginTop: 10 },
  startupProgressTrack: { width: "78%", height: 3, borderRadius: 4, overflow: "hidden", backgroundColor: "#1e293b", marginTop: 30 },
  startupProgressFill: { height: 3, backgroundColor: "#22d3ee", shadowColor: "#22d3ee", shadowOpacity: 1, shadowRadius: 8 },
  startupLinkText: { color: "#a5f3fc", fontSize: 13, fontWeight: "900", letterSpacing: 6, marginTop: 22 },
  startupStatus: { color: "#64748b", fontSize: 8, fontWeight: "700", letterSpacing: 1.5, marginTop: 10 },
  startupFooter: { position: "absolute", bottom: 28, color: "#475569", fontSize: 8, letterSpacing: 2 },
  safe: { flex: 1, backgroundColor: "#f4f6fa" },
  dashboardScroll: { flex: 1 },
  container: {
    padding: 20,
    paddingBottom: 28,
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  logo: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 22 },
  brand: { color: "#172033", fontSize: 19, fontWeight: "800" },
  muted: { color: "#748096", fontSize: 13, marginTop: 3 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  hero: {
    backgroundColor: "#fff",
    padding: 22,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  heading: { color: "#172033", fontSize: 23, fontWeight: "800", marginTop: 6, marginBottom: 5 },
  input: {
    borderWidth: 1,
    borderColor: "#dce2eb",
    borderRadius: 12,
    padding: 14,
    marginTop: 14,
    color: "#172033",
    backgroundColor: "#fff",
  },
  primary: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginTop: 18,
  },
  primaryText: { color: "#fff", fontWeight: "700" },
  secondary: { padding: 14, alignItems: "center", marginTop: 8 },
  secondaryText: { color: "#526078", fontWeight: "600" },
  stats: { flexDirection: "row", gap: 12, marginTop: 14 },
  stat: {
    flex: 1,
    backgroundColor: "#fff",
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e4e8ef",
  },
  statValue: { color: "#172033", fontSize: 25, fontWeight: "800" },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  refreshText: { color: "#2563eb", fontWeight: "700", fontSize: 13 },
  announcementCard: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 14,
    padding: 15,
    marginBottom: 9,
  },
  announcementTitle: { color: "#172033", fontWeight: "800", fontSize: 15 },
  announcementMessage: {
    color: "#526078",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  notificationUnread: { borderColor: "#93c5fd", borderWidth: 1.5 },
  notificationBadge: { color: "#2563eb", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  announcementDate: { color: "#9aa3b2", fontSize: 11, marginTop: 10 },
  dashboardMetricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 10 },
  dashboardMetric: { width: "47%", padding: 10, borderRadius: 12, backgroundColor: "#f7f9fc" },
  dashboardMetricValue: { color: "#172033", fontSize: 22, fontWeight: "800" },
  sectionTitle: {
    color: "#172033",
    fontSize: 17,
    fontWeight: "800",
    marginTop: 26,
    marginBottom: 10,
  },
  subject: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 14,
    padding: 16,
    marginBottom: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subjectName: { color: "#172033", fontWeight: "700", fontSize: 15 },
  arrow: { color: "#2563eb", fontSize: 25 },
  examHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#eff6ff", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  timerText: { color: "#2563eb", fontWeight: "800", fontVariant: ["tabular-nums"] },
  timerExpired: { backgroundColor: "#fff1f0" },
  timerExpiredText: { color: "#b42318" },
  progressTrack: { height: 7, backgroundColor: "#e9edf5", borderRadius: 8, overflow: "hidden", marginTop: 18 },
  progressFill: { height: "100%", backgroundColor: "#2563eb", borderRadius: 8 },
  examHint: { color: "#8993a5", fontSize: 11, marginTop: 8 },
  navigator: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "#f7f9fc", borderWidth: 1, borderColor: "#e8edf5" },
  navigatorTitle: { color: "#748096", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  navigatorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  navigatorItem: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: "#dce2eb", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  navigatorAnswered: { backgroundColor: "#eaf7f0", borderColor: "#9bd4b5" },
  navigatorCurrent: { borderColor: "#2563eb", borderWidth: 2, backgroundColor: "#eff6ff" },
  navigatorNumber: { color: "#526078", fontSize: 12, fontWeight: "700" },
  navigatorNumberAnswered: { color: "#167647" },
  navigatorNumberCurrent: { color: "#2563eb" },
  navigatorLegend: { flexDirection: "row", gap: 14, marginTop: 10 },
  navigatorLegendText: { color: "#748096", fontSize: 10 },
  timerNotice: { color: "#b42318", fontWeight: "700", marginTop: 12 },
  question: { borderTopWidth: 1, borderTopColor: "#edf0f5", paddingTop: 18, marginTop: 18 },
  optionRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  optionLetter: { width: 29, height: 29, borderRadius: 9, backgroundColor: "#f0f2f6", alignItems: "center", justifyContent: "center" },
  optionLetterSelected: { backgroundColor: "#dbeafe" },
  optionLetterText: { color: "#526078", fontWeight: "800", fontSize: 12 },
  optionLetterTextSelected: { color: "#1d4ed8" },
  examActions: { flexDirection: "row", gap: 10, marginTop: 22 },
  examSecondary: { flexDirection: "row", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "#dce2eb", borderRadius: 12, paddingHorizontal: 12, minHeight: 48 },
  examSecondaryText: { color: "#526078", fontWeight: "700", fontSize: 12 },
  examButtonDisabled: { opacity: 0.55 },
  examNext: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: "#2563eb", borderRadius: 12, minHeight: 48, paddingHorizontal: 10 },
  submitLink: { alignItems: "center", marginTop: 8, padding: 6 },

  swipeHint: { color: "#8993a5", fontSize: 10, fontWeight: "600", marginBottom: 10 },
  questionTitle: {
    color: "#172033",
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 24,
    marginBottom: 10,
  },
  option: {
    borderWidth: 1,
    borderColor: "#e0e5ed",
    borderRadius: 11,
    padding: 13,
    marginTop: 8,
  },
  optionSelected: { borderColor: "#2563eb", backgroundColor: "#eff6ff" },
  optionText: { color: "#293449", lineHeight: 21 },
  error: { color: "#b42318", marginTop: 16, lineHeight: 21 },
  footer: { textAlign: "center", color: "#9aa3b2", fontSize: 12, marginTop: 30 },
  bottomNav: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    alignSelf: "center",
    width: "100%",
    maxWidth: 680,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    minHeight: 64,
    shadowColor: "#172033",
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0, minHeight: 48, gap: 4 },
  navLabel: { color: "#8993a5", fontSize: 11, fontWeight: "600" },
  navLabelActive: { color: "#2563eb" },
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: "#2563eb",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  profileInfo: {
    borderTopWidth: 1,
    borderTopColor: "#edf0f5",
    paddingVertical: 14,
    marginTop: 8,
  },
  profileLabel: { color: "#8993a5", fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  profileValue: { color: "#172033", fontSize: 15, fontWeight: "700", marginTop: 5 },
  dangerButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#fff1f0",
    borderRadius: 12,
    padding: 14,
    marginTop: 20,
  },
  dangerText: { color: "#b42318", fontWeight: "700" },
});
