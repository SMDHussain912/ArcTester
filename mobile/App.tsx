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
import NetInfo from "@react-native-community/netinfo";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { deleteLocalValue, getLocalValue, setLocalValue } from "./src/localSettings";
import StudentPracticeBuilder, { type PracticePaperConfig } from "./src/StudentPracticeBuilder";
import StudentExamCenter from "./src/StudentExamCenter";
import StudentSecurityCenter from "./src/StudentSecurityCenter";
import StudentConceptLibrary from "./src/StudentConceptLibrary";
import { clearOfflineLearningPackage, getOfflineLearningPackage, saveOfflineLearningPackage, type OfflineLearningPackage } from "./src/learningStore";
import OfflinePracticeLibrary from "./src/OfflinePracticeLibrary";
import { mobilePalette, radius, spacing, typeScale } from "./src/design/tokens";
import ArcTesterMascot from "./src/components/ArcTesterMascot";
import { triggerHapticFeedback } from "./src/feedback";
import { filterResultReview } from "./src/resultReview";
import { clearPendingPracticeProgress, getPendingPracticeProgress, markPracticeProgressSynced, queuePracticeProgress } from "./src/offlineProgressQueue";
import { toggleMultiSelectAnswer } from "./src/multiSelectAnswer";
import { getBranchCode, getCollegeCode, searchBranches, searchColleges, validateAcademicRegistration, type AcademicRegistration } from "./src/academicRegistration";

const API_URL = (() => {
  const url = process.env.EXPO_PUBLIC_API_URL;
  const isDev = typeof __DEV__ !== "undefined" ? __DEV__ : true;
  if (isDev) return (url || "https://arctester.onrender.com").replace(/\/+$/, "");
  if (!url) throw new Error("EXPO_PUBLIC_API_URL is required for release builds. Set it to an https URL.");
  if (!/^https:\/\//.test(url)) throw new Error("EXPO_PUBLIC_API_URL must use https (cleartext http is blocked on Android).");
  return url.replace(/\/+$/, "");
})();
type User = { id: number; email: string; role: "ADMIN" | "STUDENT"; fullName?: string | null; collegeName?: string | null; collegeCode?: string | null; postalPin?: string | null; branchName?: string | null; branchCode?: string | null; registrationNumber?: string | null };
type GamificationSnapshot = { totalXp: number; xpBalance: number; currentStreak: number; longestStreak: number; dailyGoalXp: number; streakFreezeInventory: number; level: number; xpIntoLevel: number; xpToNextLevel: number; today: { xpEarned: number; goalReachedAt: string | null } | null; week: { date: string; xpEarned: number; goalReached: boolean; freezeUsed: boolean }[]; dailyChallengeCompleted: boolean };
type Bank = { total: number; practiceTotal?: number; subjects: { subject: string; count: number; practiceCount?: number; topics?: { topic: string; count: number; practiceCount?: number }[] }[] };
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
  questionType: "mcq" | "multi_select" | "true_false" | "fill_blank" | "numeric" | "matching";
  promptData: Record<string, unknown>;
};
type Test = {
  attemptId: number;
  mode: string;
  deadline: string | null;
  serverNow: string;
  questions: Question[];
  warnings?: string[];
  saved?: { questionId: number; selectedIndex: number | null; response: unknown }[];
};
type PracticeRecovery = {
  attemptId: number;
  answers: Record<number, unknown>;
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
    questionType: string;
    promptData: Record<string, unknown>;
    answerData: Record<string, unknown>;
    response: unknown;
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
async function clearPracticeRecoveryIfMatches(userId: number, attemptId: number): Promise<boolean> {
  const raw = await getLocalValue(practiceRecoveryKey(userId));
  if (!raw) return false;
  try {
    const recovery = JSON.parse(raw) as Partial<PracticeRecovery>;
    if (recovery.attemptId !== attemptId) return false;
  } catch { return false; }
  await deleteLocalValue(practiceRecoveryKey(userId));
  return true;
}

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [academicProfile, setAcademicProfile] = useState<AcademicRegistration>({ fullName: "", collegeName: "", collegeCode: "", postalPin: "", branchName: "", branchCode: "" });
  const [profileDraft, setProfileDraft] = useState<AcademicRegistration>({ fullName: "", collegeName: "", collegeCode: "", postalPin: "", branchName: "", branchCode: "" });
  const [profileRegistrationNumber, setProfileRegistrationNumber] = useState("");
  const [profileEditing, setProfileEditing] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileSuccessVisible, setProfileSuccessVisible] = useState(false);
  const [register, setRegister] = useState(false);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState("");
  const [twoFactorCode, setTwoFactorCode] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [gamification, setGamification] = useState<GamificationSnapshot | null>(null);
  const [dailyGoalDraft, setDailyGoalDraft] = useState("50");
  const [rewardBusy, setRewardBusy] = useState(false);
  const [offlineLearningPackage, setOfflineLearningPackage] = useState<OfflineLearningPackage | null>(null);
  const [offlineBankBusy, setOfflineBankBusy] = useState(false);
  const [networkConnected, setNetworkConnected] = useState<boolean | null>(null);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [pendingSubmitRequested, setPendingSubmitRequested] = useState(false);
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
  const [activeTab, setActiveTab] = useState<"home" | "practice" | "exams" | "learn" | "profile" | "settings" | "security">("home");
  const [practicePresetSubject, setPracticePresetSubject] = useState<string | undefined>(undefined);
  const [lessonSession, setLessonSession] = useState(false);
  const [speedRoundSession, setSpeedRoundSession] = useState(false);
  const [dailyChallengeSession, setDailyChallengeSession] = useState(false);
  const [mistakesSession, setMistakesSession] = useState(false);
  const [resultReviewFilter, setResultReviewFilter] = useState<"all" | "incorrect">("all");
  useEffect(() => { if (result) setResultReviewFilter("all"); }, [result?.attemptId]);

  const [darkMode, setDarkMode] = useState(false);
  const [answers, setAnswers] = useState<Record<number, unknown>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [busy, setBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [hapticsEnabled, setHapticsEnabled] = useState(false);
  const lastFeedbackAttempt = useRef<number | null>(null);
  const sessionIdentity = token && user ? `${user.id}:${token}` : null;
  const resultReviewQuestions = result ? filterResultReview(result.questions, resultReviewFilter) : [];
  const sessionIdentityRef = useRef<string | null>(sessionIdentity);
  const notificationRequestSequence = useRef(0);
  sessionIdentityRef.current = sessionIdentity;
  const questionTransition = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const practiceSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const practiceSyncLock = useRef(false);
  const practiceSyncRef = useRef<() => Promise<void>>(async () => undefined);
  const practiceRestoreLock = useRef(false);
  const questionSwipeStart = useRef<{ x: number; y: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!error) return;
    const message = !__DEV__ && /(?:Prisma|SQL|stack trace|node_modules|\\.tsx?:\\d+|Cannot read properties|undefined is not|internal server error|exception)/i.test(error)
      ? "Something went wrong. Please try again. If it continues, contact support."
      : error;
    Alert.alert("ArcTester", message, [{ text: "OK", onPress: () => setError("") }], { cancelable: true, onDismiss: () => setError("") });
  }, [error]);
  const [startupVisible, setStartupVisible] = useState(true);
  const startupFade = useRef(new Animated.Value(1)).current;
  const startupLogo = useRef(new Animated.Value(0)).current;
  const startupProgress = useRef(new Animated.Value(0)).current;
  const startupOrbit = useRef(new Animated.Value(0)).current;
  const startupPulse = useRef(new Animated.Value(0.85)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const statsEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => { void getLocalValue("arctester-dark-mode").then((value) => setDarkMode(value === "true")).catch(() => undefined); void getLocalValue("arctester-reduce-motion").then((value) => { if (value !== null) setReduceMotion(value === "true"); }).catch(() => undefined); void getLocalValue("arctester-haptics-enabled").then((value) => setHapticsEnabled(value === "true")).catch(() => undefined); void getLocalValue("arctester-question-text-size").then((value) => { if (value === "14" || value === "16" || value === "18") setQuestionTextSize(Number(value) as 14 | 16 | 18); }).catch(() => undefined); }, []);

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
    if (!result || lastFeedbackAttempt.current === result.attemptId) return;
    lastFeedbackAttempt.current = result.attemptId;
    triggerHapticFeedback(result.score > 0 ? "success" : "error", hapticsEnabled);
  }, [result, hapticsEnabled]);

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
    if (!response.ok) throw new ApiRequestError(response.status >= 500 ? "ArcTester couldn\u0027t complete this request right now. Please try again." : (typeof body.error === "string" ? body.error : "The server request failed."), response.status);
    return body as T;
  }
  async function refreshGamification() {
    if (!user || !token) return;
    try {
      const snapshot = await api<GamificationSnapshot>("/gamification");
      setGamification(snapshot);
      setDailyGoalDraft(String(snapshot.dailyGoalXp));
    } catch { /* Reward data must not block practice. */ }
  }

  async function saveDailyGoal() {
    const dailyGoalXp = Number(dailyGoalDraft);
    if (!Number.isInteger(dailyGoalXp) || dailyGoalXp < 20 || dailyGoalXp > 200) {
      setError("Daily XP goal must be a whole number from 20 to 200.");
      return;
    }
    setRewardBusy(true);
    try {
      const saved = await api<{ dailyGoalXp: number }>("/gamification/daily-goal", {
        method: "POST", body: JSON.stringify({ dailyGoalXp }),
      });
      setGamification((current) => current ? { ...current, dailyGoalXp: saved.dailyGoalXp } : current);
      setDailyGoalDraft(String(saved.dailyGoalXp));
      setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setRewardBusy(false); }
  }

  async function buyStreakFreeze() {
    if (!gamification || gamification.xpBalance < 100 || gamification.streakFreezeInventory >= 2) return;
    setRewardBusy(true);
    try {
      await api("/gamification/streak-freeze/buy", { method: "POST", body: JSON.stringify({}) });
      await refreshGamification();
      setError("");
    } catch (cause) { setError((cause as Error).message); }
    finally { setRewardBusy(false); }
  }


  useEffect(() => {
    let active = true;
    if (user?.id == null || !token) {
      setGamification(null);
      setDailyGoalDraft("50");
      return () => { active = false; };
    }
    fetch(API_URL + "/gamification", { headers: { authorization: "Bearer " + token } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Gamification unavailable");
        return response.json() as Promise<GamificationSnapshot>;
      })
      .then((snapshot) => {
        if (active) {
          setGamification(snapshot);
          setDailyGoalDraft(String(snapshot.dailyGoalXp));
        }
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [user?.id, token]);

  async function syncPendingPracticeProgress() {
    if (!user || !token || practiceSyncLock.current) return;
    const requestIdentity = sessionIdentityRef.current;
    practiceSyncLock.current = true;
    try {
      const connection = await NetInfo.fetch().catch(() => null);
      if (connection?.isConnected !== true || connection.isInternetReachable === false) return;
      for (let pass = 0; pass < 12; pass += 1) {
        if (sessionIdentityRef.current !== requestIdentity) return;
        const pendingItems = await getPendingPracticeProgress(String(user.id));
        setPendingSyncCount(pendingItems.length);
        if (!pendingItems.length) break;
        let madeProgress = false;
        for (const item of pendingItems) {
          if (sessionIdentityRef.current !== requestIdentity) return;
          try {
            await api("/tests/" + item.attemptId + "/answers", {
              method: "PUT",
              body: JSON.stringify({ answers: item.answers }),
            });
          } catch (cause) {
            if (cause instanceof ApiRequestError && cause.status === 409) {
              try {
                const completed = await api<PracticeResult>("/tests/" + item.attemptId + "/result");
                await clearPendingPracticeProgress(String(user.id), item.attemptId);
                const recoveryCleared = await clearPracticeRecoveryIfMatches(user.id, item.attemptId);
                if (recoveryCleared) setHasSavedPracticeAttempt(false);
                setPendingSubmitRequested(false);
                setTest((current) => current?.attemptId === item.attemptId ? null : current);
                if (item.submitRequested || test?.attemptId === item.attemptId) setResult(completed);
                void refreshGamification();
                setLessonSession(false);
                setError("");
                madeProgress = true;
                continue;
              } catch { /* Keep local data until a completed result can be verified. */ }
            }
            return;
          }
          if (item.submitRequested) {
            await practiceSaveQueue.current.catch(() => undefined);
            const latest = await getPendingPracticeProgress(String(user.id));
            const latestItem = latest.find((queued) => queued.attemptId === item.attemptId);
            if (!latestItem || latestItem.revision !== item.revision) {
              madeProgress = true;
              continue;
            }
            try {
              await api("/tests/" + item.attemptId + "/submit", {
                method: "POST",
                body: JSON.stringify({ answers: item.answers }),
              });
            } catch (cause) {
              if (!(cause instanceof ApiRequestError && cause.status === 409)) return;
            }
            let completed: PracticeResult;
            try { completed = await api<PracticeResult>("/tests/" + item.attemptId + "/result"); }
            catch { return; }
            await clearPendingPracticeProgress(String(user.id), item.attemptId);
            await clearPracticeRecoveryIfMatches(user.id, item.attemptId);
            setHasSavedPracticeAttempt(false);
            setPendingSubmitRequested(false);
            setTest((current) => current?.attemptId === item.attemptId ? null : current);
            setResult(completed);
            void refreshGamification();
            setLessonSession(false);
            setError("");
            madeProgress = true;
          } else {
            const removed = await markPracticeProgressSynced(String(user.id), item.attemptId, item.revision);
            madeProgress = true;
            if (!removed) continue;
          }
        }
        if (!madeProgress) break;
      }
      const remaining = await getPendingPracticeProgress(String(user.id));
      setPendingSyncCount(remaining.length);
      setPendingSubmitRequested(remaining.some((item) => item.submitRequested));
    } catch {
      const remaining = await getPendingPracticeProgress(String(user.id)).catch(() => []);
      if (sessionIdentityRef.current === requestIdentity) {
        setPendingSyncCount(remaining.length);
        setPendingSubmitRequested(remaining.some((item) => item.submitRequested));
      }
    } finally {
      practiceSyncLock.current = false;
    }
  }

  practiceSyncRef.current = syncPendingPracticeProgress;

  useEffect(() => {
    let active = true;
    const applyConnection = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      if (!active) return;
      const connected = state.isConnected === true && state.isInternetReachable !== false;
      setNetworkConnected(connected);
      if (connected) void practiceSyncRef.current();
    };
    const unsubscribe = NetInfo.addEventListener(applyConnection);
    NetInfo.fetch().then(applyConnection).catch(() => { if (active) setNetworkConnected(false); });
    return () => { active = false; unsubscribe(); };
  }, [token, user?.id]);

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
    getOfflineLearningPackage(String(user.id)).then((result) => { if (isCurrentSession()) setOfflineLearningPackage(result); }).catch(() => { if (isCurrentSession()) setOfflineLearningPackage(null); });
    getPendingPracticeProgress(String(user.id)).then((items) => { if (isCurrentSession()) { setPendingSyncCount(items.length); setPendingSubmitRequested(items.some((item) => item.submitRequested)); } }).catch(() => undefined);
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
    if (register) {
      const validationError = validateAcademicRegistration(academicProfile);
      if (validationError) { setError(validationError); return; }
    }
    setBusy(true);
    setError("");
    try {
      if (register) {
        await api("/auth/register", {
          method: "POST",
          headers: { "x-arctester-client": "mobile" },
          body: JSON.stringify({
            email: email.trim(),
            password,
            ...academicProfile,
          }),
        });
        setRegister(false);
        setError("Account request submitted. You can sign in after an administrator approves your account.");
      } else {
        if (twoFactorChallenge) {
          const verified = await api<{ token: string; user: User }>("/auth/token/2fa", { method: "POST", headers: { "x-arctester-client": "mobile" }, body: JSON.stringify({ challengeId: twoFactorChallenge, code: twoFactorCode.trim() }) });
          if (verified.user.role !== "STUDENT") { setError("Admin accounts cannot use the mobile app. Please sign in through ArcTester Web."); setTwoFactorChallenge(""); setPassword(""); return; }
          await SecureStore.setItemAsync("arctester-token", verified.token).catch(() => { throw new Error("Secure sign-in storage is unavailable. Update or reinstall ArcTester, then sign in again."); });
          setToken(verified.token); setUser(verified.user); setTwoFactorChallenge(""); setTwoFactorCode("");
          return;
        }
        const result = await api<{ token?: string; user?: User; twoFactorRequired?: boolean; challengeId?: string }>("/auth/token", {
          method: "POST",
          headers: { "x-arctester-client": "mobile" }, body: JSON.stringify({ email: email.trim(), password }),
        });
        if (result.twoFactorRequired && result.challengeId) {
          setTwoFactorChallenge(result.challengeId); setPassword(""); setTwoFactorCode("");
          return;
        }
        if (!result.user || !result.token) throw new Error("Sign-in response was incomplete.");
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

  async function savePracticeRecovery(attemptId: number, nextAnswers: Record<number, unknown>, nextIndex: number, queueForSync = false) {
    if (!user) return;
    const requestIdentity = sessionIdentityRef.current;
    const payload: PracticeRecovery = { attemptId, answers: nextAnswers, currentQuestionIndex: nextIndex };
    practiceSaveQueue.current = practiceSaveQueue.current
      .catch(() => undefined)
      .then(async () => {
        await setLocalValue(practiceRecoveryKey(user.id), JSON.stringify(payload));
        if (queueForSync && test?.attemptId === attemptId) {
          const queued = await queuePracticeProgress(String(user.id), {
            attemptId,
            answers: test.questions.map((question) => ({ questionId: question.id, response: nextAnswers[question.id] ?? null })),
            currentQuestionIndex: nextIndex,
          });
          setPendingSyncCount((count) => Math.max(count, 1));
          if (queued.submitRequested) setPendingSubmitRequested(true);
        }
      });
    try {
      await practiceSaveQueue.current;
      if (queueForSync && networkConnected === true) void syncPendingPracticeProgress();
      if (sessionIdentityRef.current === requestIdentity) setHasSavedPracticeAttempt(true);
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) {
        setError(`Practice is running, but its local recovery copy could not be saved: ${(cause as Error).message}`);
      }
    }
  }

  function updatePracticeResponse(questionId: number, response: unknown) {
    if (!test || pendingSubmitRequested) return;
    const nextAnswers = { ...answers };
    if (Array.isArray(response) && response.length === 0) delete nextAnswers[questionId];
    else nextAnswers[questionId] = response;
    setAnswers(nextAnswers);
    void savePracticeRecovery(test.attemptId, nextAnswers, currentQuestionIndex, true);
  }

  function updatePracticeAnswer(questionId: number, selectedIndex: number) {
    updatePracticeResponse(questionId, selectedIndex);
  }

  function updatePracticeQuestionIndex(nextIndex: number) {
    if (!test || pendingSubmitRequested) return;
    const safeIndex = Math.max(0, Math.min(test.questions.length - 1, nextIndex));
    setCurrentQuestionIndex(safeIndex);
    void savePracticeRecovery(test.attemptId, answers, safeIndex);
  }

  async function resumePractice() {
    if (!user || busy || practiceRestoreLock.current || pendingSubmitRequested) return;
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
      if ((restored.mode !== "practice" && restored.mode !== "speedRound") || !restored.questions.length) {
        throw new Error("This saved item is not a resumable practice attempt.");
      }
      const serverAnswers = Object.fromEntries(
        (restored.saved ?? [])
          .filter((answer) => answer.response !== null && answer.response !== undefined || answer.selectedIndex !== null)
          .map((answer) => [answer.questionId, answer.response !== null && answer.response !== undefined ? answer.response : answer.selectedIndex]),
      );
      const localAnswers = recovery.answers && typeof recovery.answers === "object" ? recovery.answers : {};
      setTest(restored);
      setSpeedRoundSession(restored.mode === "speedRound");
      setLessonSession(false);
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
                void refreshGamification();
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

  async function startPractice(config: PracticePaperConfig, lesson = false, speedRound = false, mistakes = false, dailyChallenge = false) {
    if (checkingPracticeRecovery) {
      setError("Checking this account for a saved practice attempt. Try again in a moment.");
      return;
    }
    if (hasSavedPracticeAttempt) {
      setError("Resume or submit your saved practice before starting another one.");
      return;
    }
    setLessonSession(lesson);
    setSpeedRoundSession(speedRound);
    setDailyChallengeSession(dailyChallenge);
    setMistakesSession(mistakes);
    setPendingSubmitRequested(false);
    setBusy(true);
    setError("");
    try {
      // Refresh the bank immediately before creating a session. The dashboard
      // count can be stale after an administrator imports or publishes questions.
      const freshBank = await api<Bank>("/bank");
      setBank(freshBank);
      const availableSubjects = freshBank.subjects.filter((item) => item.count > 0);
      if (availableSubjects.length === 0) throw new Error("The question bank currently has no practice questions.");
      const mode = dailyChallenge ? "dailyChallenge" : mistakes ? "mistakes" : speedRound ? "speedRound" : "practice";
      const request = dailyChallenge
        ? { mode, count: 10 }
        : mistakes
          ? { mode, count: 20 }
          : { mode, subjects: config.subjects, topicFilters: config.topicFilters, difficulty: config.difficulty, count: speedRound ? 10 : config.count, durationMinutes: config.durationMinutes, questionTypes: config.questionTypes };
      const created = await api<Test>("/tests", { method: "POST", body: JSON.stringify(request) });
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
      setLessonSession(false);
      setSpeedRoundSession(false);
      setDailyChallengeSession(false);
      setMistakesSession(false);
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
    if (test && speedRoundSession && secondsLeft === 0 && !busy && !pendingSubmitRequested) {
      void submit();
    }
  }, [test, speedRoundSession, secondsLeft, busy, pendingSubmitRequested]);

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
      speedRoundSession ? "Finish speed round?" : "Submit practice?",
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
        { text: "Exit to dashboard", style: "default", onPress: () => { setTest(null); setLessonSession(false); setHasSavedPracticeAttempt(true); } },
      ],
    );
  }

  async function submit() {
    if (!test || !user || pendingSubmitRequested) return;
    setBusy(true);
    setError("");
    try {
      await practiceSaveQueue.current;
      await queuePracticeProgress(String(user.id), {
        attemptId: test.attemptId,
        answers: test.questions.map((question) => ({ questionId: question.id, response: answers[question.id] ?? null })),
        currentQuestionIndex,
        submitRequested: true,
      });
      setPendingSubmitRequested(true);
      setPendingSyncCount((count) => Math.max(count, 1));
      await syncPendingPracticeProgress();
      const remaining = await getPendingPracticeProgress(String(user.id));
      setPendingSyncCount(remaining.length);
      if (remaining.some((item) => item.attemptId === test.attemptId)) {
        setTest(null);
        setHasSavedPracticeAttempt(true);
        setError(networkConnected === false
          ? "Submit request saved on this device. It is not submitted yet; reconnect to send it safely."
          : "Submit request is saved locally and waiting for synchronization. Do not start another attempt.");
      }
    } catch (cause) {
      setError("Your answers remain saved on this device. " + ((cause as Error).message || "Synchronization will retry when online."));
    } finally {
      setBusy(false);
    }
  }

  async function saveAcademicProfile() {
    const validation = validateAcademicRegistration(profileDraft);
    if (validation) { setError(validation); return; }
    if (profileRegistrationNumber.trim() && !/^\d{5}-[A-Z]{1,3}-\d{3}$/i.test(profileRegistrationNumber.trim())) {
      setError("Enter a valid diploma registration number, e.g. 24010-CM-053.");
      return;
    }
    setProfileBusy(true);
    setError("");
    try {
      const result = await api<{ changed: boolean; requiresReauthentication?: boolean }>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({ ...profileDraft, registrationNumber: profileRegistrationNumber.trim() }),
      });
      if (!result.changed || !result.requiresReauthentication) {
        setError("No profile changes were made.");
        return;
      }
      setProfileEditing(false);
      setProfileSuccessVisible(true);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setProfileBusy(false);
    }
  }

  function continueAfterProfileChange() {
    setProfileSuccessVisible(false);
    void signOut(true);
  }
  async function signOut(clearIdentityCache = false) {
    sessionIdentityRef.current = null;
    setBusy(false);
    await SecureStore.deleteItemAsync("arctester-token").catch(() => undefined);
    await SecureStore.deleteItemAsync("arctester-refresh-token").catch(() => undefined);
    setToken(null);
    const previousUserId = user?.id;
    setUser(null);
    setProfileDraft({ fullName: "", collegeName: "", collegeCode: "", postalPin: "", branchName: "", branchCode: "" });
    setProfileRegistrationNumber("");
    setProfileEditing(false);
    setProfileSuccessVisible(false);
    if (clearIdentityCache && previousUserId !== undefined) {
      await clearOfflineLearningPackage(String(previousUserId)).catch(() => undefined);
    }
    setBank(null);
    setAnnouncements([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
    setRefreshingAnnouncements(false);
    setRefreshingNotifications(false);
    setTest(null);
    setLessonSession(false);
    setResult(null);
    setHasSavedPracticeAttempt(false);
    setPendingSyncCount(0);
    setPendingSubmitRequested(false);
    setCheckingPracticeRecovery(false);
    setAnswers({});
    setCurrentQuestionIndex(0);
    setActiveTab("home");
  }

  return (
    <SafeAreaView style={[styles.safe, darkMode && { backgroundColor: "#0b1220" }]}>
      <StatusBar style={startupVisible || darkMode ? "light" : "dark"} />
      <ScrollView style={[styles.dashboardScroll, darkMode && { backgroundColor: "#0b1220" }]} contentContainerStyle={[styles.container, !user && styles.authContainer]}>
        <View style={styles.brandRow}>
          <ArcTesterMascot variant="mark" size={40} />
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
                ? "Register with your email. An administrator will review your account before you can sign in."
                : "Sign in to continue your preparation."}
            </Text>
            {register ? (
              <View>
                <TextInput
                  accessibilityLabel="Full name"
                  autoCapitalize="words"
                  placeholder="Full name"
                  placeholderTextColor="#8b95a7"
                  value={academicProfile.fullName}
                  onChangeText={(value) => setAcademicProfile((current) => ({ ...current, fullName: value }))}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
                <TextInput
                  accessibilityLabel="College / Polytechnic"
                  autoCapitalize="words"
                  placeholder="Search or type college / polytechnic"
                  placeholderTextColor="#8b95a7"
                  value={academicProfile.collegeName}
                  onChangeText={(value) => setAcademicProfile((current) => ({ ...current, collegeName: value, collegeCode: getCollegeCode(value) }))}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
                {searchColleges(academicProfile.collegeName).length > 0 ? (
                  <View style={[styles.suggestionList, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155" }]}>
                    {searchColleges(academicProfile.collegeName).map((college) => (
                      <TouchableOpacity key={college.code} accessibilityRole="button" onPress={() => setAcademicProfile((current) => ({ ...current, collegeName: college.name, collegeCode: college.code }))} style={[styles.suggestionItem, darkMode && { borderBottomColor: "#334155" }]}>
                        <Text style={[styles.suggestionName, darkMode && { color: "#f1f5f9" }]}>{college.name}</Text>
                        <Text style={[styles.suggestionCode, darkMode && { color: "#94a3b8" }]}>{college.code}{college.district ? " · " + college.district : ""}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.fieldHint, darkMode && { color: "#94a3b8" }]}>If your college is missing, type its name and enter its institute PIN/code below.</Text>
                <TextInput
                  accessibilityLabel="College PIN / institute code"
                  placeholder="College PIN / institute code (e.g. 010)"
                  placeholderTextColor="#8b95a7"
                  value={academicProfile.collegeCode}
                  onChangeText={(value) => setAcademicProfile((current) => ({ ...current, collegeCode: value }))}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
                <TextInput
                  accessibilityLabel="Postal PIN code"
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder="Postal PIN code (optional, 6 digits)"
                  placeholderTextColor="#8b95a7"
                  value={academicProfile.postalPin}
                  onChangeText={(value) => setAcademicProfile((current) => ({ ...current, postalPin: value.replace(/\D/g, "") }))}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
                <TextInput
                  accessibilityLabel="Diploma branch"
                  autoCapitalize="words"
                  placeholder="Search or type diploma branch"
                  placeholderTextColor="#8b95a7"
                  value={academicProfile.branchName}
                  onChangeText={(value) => setAcademicProfile((current) => ({ ...current, branchName: value, branchCode: getBranchCode(value) }))}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
                {searchBranches(academicProfile.branchName).length > 0 ? (
                  <View style={[styles.suggestionList, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155" }]}>
                    {searchBranches(academicProfile.branchName).map((branch, index) => (
                      <TouchableOpacity key={branch.code + branch.name + index} accessibilityRole="button" onPress={() => setAcademicProfile((current) => ({ ...current, branchName: branch.name, branchCode: branch.code }))} style={[styles.suggestionItem, darkMode && { borderBottomColor: "#334155" }]}>
                        <Text style={[styles.suggestionName, darkMode && { color: "#f1f5f9" }]}>{branch.name}</Text>
                        <Text style={[styles.suggestionCode, darkMode && { color: "#94a3b8" }]}>{branch.code}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
                <Text style={[styles.fieldHint, darkMode && { color: "#94a3b8" }]}>You can type a custom branch if it is not in the suggestions.</Text>
                <TextInput
                  accessibilityLabel="Branch code"
                  placeholder="Branch code (optional)"
                  placeholderTextColor="#8b95a7"
                  value={academicProfile.branchCode}
                  onChangeText={(value) => setAcademicProfile((current) => ({ ...current, branchCode: value }))}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
              </View>
            ) : null}
            {!register && twoFactorChallenge ? (
              <View>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Two-step verification is enabled. Enter your authenticator code or one unused recovery code.</Text>
                <TextInput
                  accessibilityLabel="Authenticator or recovery code"
                  autoCapitalize="characters"
                  autoComplete="one-time-code"
                  placeholder="Authenticator / recovery code"
                  placeholderTextColor="#8b95a7"
                  value={twoFactorCode}
                  onChangeText={setTwoFactorCode}
                  style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]}
                />
              </View>
            ) : (
              <>
                <TextInput autoCapitalize="none" keyboardType="email-address" placeholder="Email address" placeholderTextColor="#8b95a7" value={email} onChangeText={setEmail} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                <TextInput secureTextEntry placeholder="Password" placeholderTextColor="#8b95a7" value={password} onChangeText={setPassword} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
              </>
            )}
            <TouchableOpacity disabled={busy} onPress={authenticate} style={styles.primary}>
              <Text style={styles.primaryText}>
                {busy ? "Please wait…" : twoFactorChallenge ? "Verify code" : register ? "Create account" : "Sign in"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setRegister(!register); setTwoFactorChallenge(""); setTwoFactorCode(""); }} style={styles.secondary}>
              <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>
                {register
                  ? "Already have an account? Sign in"
                  : "New student? Create an account"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : result ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>{lessonSession ? "Lesson complete" : result.mode === "speedRound" ? "Speed round complete" : result.mode === "dailyChallenge" ? "Daily challenge result" : result.mode === "mistakes" ? "Mistakes practice result" : "Practice result"}</Text>
                <Text style={[styles.statValue, { marginTop: 4 }]}>{result.score} / {result.total}</Text>
              </View>
              <ArcTesterMascot size={64} />
            </View>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              {[{ label: "Correct", value: result.questions.filter((q) => q.isCorrect).length, color: "#15803d" }, { label: "Incorrect", value: result.incorrect, color: "#b42318" }, { label: "Skipped", value: result.unanswered, color: darkMode ? "#cbd5e1" : "#526078" }].map((metric) => (
                <View key={metric.label} style={{ flex: 1, borderRadius: 12, padding: 10, backgroundColor: darkMode ? "#1e293b" : "#f1f5f9", alignItems: "center" }}>
                  <Text style={{ fontSize: 20, fontWeight: "900", color: metric.color }}>{metric.value}</Text>
                  <Text style={[styles.muted, { fontSize: 11 }, darkMode && { color: "#a7b4c8" }]}>{metric.label}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{result.expired ? "Time expired" : "Submitted successfully"}</Text>
            {result.breakdown.map((item) => (
              <View key={item.subject} style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>{item.subject}</Text>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{item.correct} correct · {item.incorrect} incorrect · {item.unanswered} unanswered</Text>
              </View>
            ))}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 16 }}>
              <Text style={[styles.sectionTitle, { marginTop: 0 }, darkMode && { color: "#f1f5f9" }]}>Answer review</Text>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {([{ value: "all", label: "All" }, { value: "incorrect", label: "Mistakes" }] as const).map((filter) => (
                  <TouchableOpacity key={filter.value} accessibilityRole="button" accessibilityState={{ selected: resultReviewFilter === filter.value }} onPress={() => setResultReviewFilter(filter.value)} style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, backgroundColor: resultReviewFilter === filter.value ? "#dbeafe" : (darkMode ? "#26364d" : "#f1f5f9") }}>
                    <Text style={{ fontSize: 12, fontWeight: "800", color: resultReviewFilter === filter.value ? "#1d4ed8" : (darkMode ? "#cbd5e1" : "#526078") }}>{filter.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            {resultReviewQuestions.length === 0 ? <Text style={[styles.muted, { marginTop: 12 }, darkMode && { color: "#a7b4c8" }]}>{resultReviewFilter === "incorrect" ? "No mistakes in this attempt. Nice work!" : "No answer review is available."}</Text> : resultReviewQuestions.map((question, index) => (
              <View key={question.questionId} style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
                <Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>Question {index + 1} · {question.subject}</Text>
                <Text style={[styles.announcementMessage, darkMode && { color: "#cbd5e1" }]}>{question.text}</Text>
                {question.options.map((option, optionIndex) => {
                  const correct = question.questionType === "multi_select" && Array.isArray(question.answerData.correctIndices)
                    ? question.answerData.correctIndices.includes(optionIndex)
                    : optionIndex === question.correctIndex;
                  const selected = Array.isArray(question.response)
                    ? question.response.includes(optionIndex)
                    : optionIndex === question.selectedIndex;
                  return (
                    <Text key={optionIndex} style={{
                      color: correct ? "#15803d" : selected ? "#b42318" : "#526078",
                      fontWeight: correct || selected ? "800" : "400",
                      marginTop: 6,
                    }}>
                      {String.fromCharCode(65 + optionIndex)}. {option}{correct ? " · Correct" : selected ? " · Your answer" : ""}
                    </Text>
                  );
                })}
                <Text style={[styles.announcementDate, darkMode && { color: "#94a3b8" }]}>{question.explanation || "No explanation provided."}</Text>
              </View>
            ))}
            <TouchableOpacity onPress={() => { setResult(null); setLessonSession(false); setActiveTab("home"); }} style={styles.primary}>
              <Text style={styles.primaryText}>Back to dashboard</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : test ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <View style={styles.examHeader}>
              <View>
                <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>{lessonSession ? "Quick lesson" : speedRoundSession ? "Speed round" : "Practice session"}</Text>
                <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Question {currentQuestionIndex + 1} of {test.questions.length}</Text>
              </View>
              {!lessonSession && <View style={[styles.timerPill, secondsLeft === 0 && styles.timerExpired]}>
                <MaterialCommunityIcons name="timer-outline" size={17} color={secondsLeft === 0 ? "#b42318" : "#2563eb"} />
                <Text style={[styles.timerText, secondsLeft === 0 && styles.timerExpiredText]}>{formatTime(secondsLeft)}</Text>
              </View>}
            </View>
            <View style={[styles.progressTrack, darkMode && { backgroundColor: "#334155" }]}>
              <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
            </View>
            <Text style={[styles.examHint, darkMode && { color: "#94a3b8" }]}>{Object.keys(answers).length} of {test.questions.length} answered · {lessonSession ? "learn at your pace" : speedRoundSession ? "5-minute challenge" : "timed practice"}</Text>
            {networkConnected === false ? <Text style={[styles.timerNotice, darkMode && { color: "#fbbf24" }]}>Offline · your answers are saved on this device and will sync when you reconnect.</Text> : pendingSyncCount > 0 ? <Text style={[styles.examHint, darkMode && { color: "#94a3b8" }]}>Syncing saved progress…</Text> : null}
            {test.warnings?.map((warning, index) => <Text key={index} style={[styles.timerNotice, darkMode && { color: "#fbbf24" }]}>{warning}</Text>)}
            {!lessonSession && <View style={[styles.navigator, darkMode && { backgroundColor: "#172235", borderColor: "#334155" }]}>
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
            </View>}
            {!lessonSession && secondsLeft === 0 && <Text style={styles.timerNotice}>Time is up. Submit your answers to finish.</Text>}
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
                {!lessonSession && <Text style={styles.swipeHint}>Swipe left for next · right for previous</Text>}
                {test.questions[currentQuestionIndex].questionType === "multi_select" ? (
                  <View>
                    <Text style={[styles.examHint, { marginBottom: 8 }, darkMode && { color: "#94a3b8" }]}>Select all that apply</Text>
                    {test.questions[currentQuestionIndex].options.map((option, optionIndex) => {
                      const currentResponse = answers[test.questions[currentQuestionIndex].id];
                      const selected = Array.isArray(currentResponse) && currentResponse.includes(optionIndex);
                      return (
                        <TouchableOpacity
                          key={optionIndex}
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: selected }}
                          onPress={() => updatePracticeResponse(
                            test.questions[currentQuestionIndex].id,
                            toggleMultiSelectAnswer(currentResponse, optionIndex, test.questions[currentQuestionIndex].options.length),
                          )}
                          style={[styles.option, darkMode && { borderColor: "#475569" }, selected && styles.optionSelected]}
                          activeOpacity={0.78}
                        >
                          <View style={styles.optionRow}>
                            <View style={[styles.optionLetter, selected && styles.optionLetterSelected, { borderRadius: 6 }]}>
                              <Text style={[styles.optionLetterText, selected && styles.optionLetterTextSelected]}>{selected ? "✓" : String.fromCharCode(65 + optionIndex)}</Text>
                            </View>
                            <Text style={[styles.optionText, { flex: 1 }, selected && styles.optionTextSelected, darkMode && !selected && { color: "#e2e8f0" }]}>{option}</Text>
                            {selected && <MaterialCommunityIcons name="check-circle" size={20} color="#2563eb" />}
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                ) : test.questions[currentQuestionIndex].options.map((option, optionIndex) => {
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
                        <Text style={[styles.optionText, { flex: 1 }, selected && styles.optionTextSelected, darkMode && !selected && { color: "#e2e8f0" }]}>{option}</Text>
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
                <TouchableOpacity disabled={busy} onPress={() => { if (lessonSession) { if (answers[test.questions[currentQuestionIndex]?.id] === undefined) { setError("Choose an answer before checking it."); return; } void submit(); } else confirmSubmit(); }} style={styles.examNext}>
                  <Text style={styles.primaryText}>{busy ? (lessonSession ? "Checking…" : "Submitting…") : (lessonSession ? "Check answer" : speedRoundSession ? "Finish speed round" : "Submit practice")}</Text>
                  <MaterialCommunityIcons name="check" size={19} color="#ffffff" />
                </TouchableOpacity>
              )}
            </View>
            {!lessonSession && currentQuestionIndex < test.questions.length - 1 && (
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
             {hasSavedPracticeAttempt && pendingSubmitRequested ? <View style={[styles.announcementCard, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}><Text style={[styles.announcementTitle, darkMode && { color: "#f1f5f9" }]}>Submission waiting to sync</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Your confirmed submit is saved on this device. Reconnect to send it; it has not been graded yet.</Text></View> : hasSavedPracticeAttempt ? <TouchableOpacity disabled={busy || checkingPracticeRecovery} onPress={() => void resumePractice()} style={styles.primary}><Text style={styles.primaryText}>{busy ? "Restoring…" : "Resume saved practice"}</Text></TouchableOpacity> : null}
             {bank ? <StudentPracticeBuilder key={practicePresetSubject ?? "practice"} subjects={bank.subjects} total={bank.total} darkMode={darkMode} disabled={busy || checkingPracticeRecovery || hasSavedPracticeAttempt} initialSubject={practicePresetSubject} onRefresh={() => void refreshQuestionBank()} onStart={(config) => void startPractice(config)} /> : <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Loading subject and topic catalogue…</Text>}
              {offlineLearningPackage ? <OfflinePracticeLibrary questions={offlineLearningPackage.questions} darkMode={darkMode} /> : null}
           </Animated.View>
) : activeTab === "exams" ? (
            <StudentExamCenter api={api} darkMode={darkMode} disabled={busy || checkingPracticeRecovery || hasSavedPracticeAttempt} />
 ) : activeTab === "learn" ? (
          <Animated.View style={animatedEntrance(entrance)}><StudentConceptLibrary api={api} darkMode={darkMode} /></Animated.View>
 ) : activeTab === "settings" ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>Settings</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>App preferences and account controls</Text>
            <TouchableOpacity accessibilityRole="button" onPress={() => setActiveTab("security")} style={styles.secondary}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Review account security & sessions</Text></TouchableOpacity>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>DAILY GOAL & STREAK REWARDS</Text>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{gamification ? gamification.xpBalance + " spendable XP · " + gamification.streakFreezeInventory + "/2 streak freezes" : "Loading your rewards…"}</Text>
              <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 }}>
                <TextInput accessibilityLabel="Daily XP goal, 20 to 200" keyboardType="number-pad" value={dailyGoalDraft} onChangeText={setDailyGoalDraft} maxLength={3} style={[styles.input, { flex: 1, marginBottom: 0 }, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                <TouchableOpacity disabled={rewardBusy} onPress={() => void saveDailyGoal()} style={styles.primary}><Text style={styles.primaryText}>{rewardBusy ? "Saving…" : "Save goal"}</Text></TouchableOpacity>
              </View>
              <TouchableOpacity disabled={rewardBusy || !gamification || gamification.xpBalance < 100 || gamification.streakFreezeInventory >= 2} onPress={() => void buyStreakFreeze()} style={[styles.secondary, { marginTop: 10 }, (!gamification || gamification.xpBalance < 100 || gamification.streakFreezeInventory >= 2 || rewardBusy) && { opacity: 0.5 }]}>
                <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>{gamification?.streakFreezeInventory === 2 ? "Streak freeze inventory full" : "Buy streak freeze · 100 XP"}</Text>
              </TouchableOpacity>
              <Text style={[styles.muted, darkMode && { color: "#94a3b8" }]}>Daily goal: 20–200 XP. A streak freeze protects one missed day; inventory limit is two.</Text>
            </View>
            <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>APPEARANCE</Text><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}><View style={{ flex: 1 }}><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>Dark mode</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Use a darker interface in low light</Text></View><Switch value={darkMode} onValueChange={(value) => void toggleDarkMode(value)} accessibilityLabel="Enable dark mode" /></View></View>
            <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>QUESTION DISPLAY</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Question text size</Text><View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>{([14, 16, 18] as const).map((size) => <TouchableOpacity key={size} onPress={() => { setQuestionTextSize(size); void setLocalValue("arctester-question-text-size", String(size)).catch(() => undefined); }} style={{ paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: questionTextSize === size ? "#dbeafe" : (darkMode ? "#26364d" : "#f1f5f9") }}><Text style={{ color: questionTextSize === size ? "#1d4ed8" : (darkMode ? "#cbd5e1" : "#526078"), fontWeight: "700" }}>{size === 14 ? "Small" : size === 16 ? "Medium" : "Large"}</Text></TouchableOpacity>)}</View></View>
            <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>OFFLINE PRACTICE & SYNC</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{networkConnected === false ? "Offline · " : networkConnected === true ? "Online · " : "Checking connection · "}{pendingSyncCount ? pendingSyncCount + " pending practice attempt(s)" : "No pending progress"}</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{offlineLearningPackage ? offlineLearningPackage.total + " practice questions · " + offlineLearningPackage.subjects.length + " subjects downloaded" : "No practice question bank is saved on this device."}</Text>{pendingSyncCount > 0 ? <TouchableOpacity disabled={networkConnected !== true} onPress={() => void syncPendingPracticeProgress()} style={[styles.secondary, { marginTop: 10 }]}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>{networkConnected === true ? "Sync pending progress now" : "Reconnect to sync progress"}</Text></TouchableOpacity> : null}{offlineLearningPackage ? <Text style={[styles.muted, darkMode && { color: "#94a3b8" }]}>Downloaded {new Date(offlineLearningPackage.exportedAt).toLocaleString()}</Text> : null}<TouchableOpacity onPress={() => void downloadOfflinePracticeBank()} disabled={offlineBankBusy || busy} style={[styles.secondary, { marginTop: 10 }]}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>{offlineBankBusy ? "Downloading…" : offlineLearningPackage ? "Update offline question bank" : "Download practice bank"}</Text></TouchableOpacity>{offlineLearningPackage ? <TouchableOpacity onPress={removeOfflinePracticeBank} disabled={offlineBankBusy} style={styles.secondary}><Text style={[styles.secondaryText, { color: "#b42318" }]}>Remove offline download</Text></TouchableOpacity> : null}</View>
             <View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACCESSIBILITY</Text><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}><View style={{ flex: 1 }}><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>Reduce motion</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Reduce animated transitions</Text></View><Switch value={reduceMotion} onValueChange={(value) => { setReduceMotion(value); void setLocalValue("arctester-reduce-motion", String(value)).catch(() => undefined); }} /></View></View><View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>FEEDBACK</Text><View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}><View style={{ flex: 1 }}><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>Haptic feedback</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Optional vibration on practice completion</Text></View><Switch value={hapticsEnabled} onValueChange={(value) => { setHapticsEnabled(value); void setLocalValue("arctester-haptics-enabled", String(value)).catch(() => undefined); }} accessibilityLabel="Enable haptic feedback" /></View></View><View style={styles.profileInfo}><Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACCOUNT</Text><Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{user.email}</Text></View>
            <TouchableOpacity onPress={refreshQuestionBank} disabled={busy} style={styles.secondary}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>{busy ? "Refreshing…" : "Refresh question bank"}</Text></TouchableOpacity>
            <TouchableOpacity onPress={() => void signOut()} style={styles.dangerButton}><MaterialCommunityIcons name="logout" size={18} color="#b42318" /><Text style={styles.dangerText}>Sign out</Text></TouchableOpacity>
          </Animated.View>
        ) : activeTab === "security" ? (
          <Animated.View style={animatedEntrance(entrance)}><StudentSecurityCenter api={api} darkMode={darkMode} onBack={() => setActiveTab("settings")} onSignOut={() => void signOut()} /></Animated.View>
        ) : activeTab === "profile" ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
            <View style={styles.profileAvatar}>
              <MaterialCommunityIcons name="account" size={34} color="#ffffff" />
            </View>
            <Text style={[styles.heading, { textAlign: "center" }, darkMode && { color: "#f1f5f9" }]}>Your account</Text>
            <Text style={[styles.muted, { textAlign: "center" }, darkMode && { color: "#a7b4c8" }]}>{user.email}</Text>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACADEMIC IDENTITY</Text>
              <Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{user.fullName || "Student"}</Text>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{user.registrationNumber || "Registration number not set"}</Text>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{user.collegeName || "College not set"} · {user.branchName || "Branch not set"}</Text>
              {!profileEditing ? (
                <TouchableOpacity onPress={() => {
                  setProfileDraft({ fullName: user.fullName ?? "", collegeName: user.collegeName ?? "", collegeCode: user.collegeCode ?? "", postalPin: user.postalPin ?? "", branchName: user.branchName ?? "", branchCode: user.branchCode ?? "" });
                  setProfileRegistrationNumber(user.registrationNumber ?? "");
                  setProfileEditing(true);
                  setError("");
                }} style={styles.secondary}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Edit academic profile</Text></TouchableOpacity>
              ) : (
                <View>
                  <TextInput accessibilityLabel="Profile full name" placeholder="Full name" value={profileDraft.fullName} onChangeText={(value) => setProfileDraft((current) => ({ ...current, fullName: value }))} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TextInput accessibilityLabel="Profile diploma registration number" placeholder="Diploma registration number" autoCapitalize="characters" value={profileRegistrationNumber} onChangeText={setProfileRegistrationNumber} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TextInput accessibilityLabel="Profile college" placeholder="College / Polytechnic" value={profileDraft.collegeName} onChangeText={(value) => setProfileDraft((current) => ({ ...current, collegeName: value, collegeCode: getCollegeCode(value) || current.collegeCode }))} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TextInput accessibilityLabel="Profile college code" placeholder="College PIN / institute code" value={profileDraft.collegeCode} onChangeText={(value) => setProfileDraft((current) => ({ ...current, collegeCode: value }))} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TextInput accessibilityLabel="Profile postal PIN" placeholder="Postal PIN (optional)" keyboardType="number-pad" maxLength={6} value={profileDraft.postalPin} onChangeText={(value) => setProfileDraft((current) => ({ ...current, postalPin: value.replace(/[^0-9]/g, "").slice(0, 6) }))} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TextInput accessibilityLabel="Profile diploma branch" placeholder="Diploma branch" value={profileDraft.branchName} onChangeText={(value) => setProfileDraft((current) => ({ ...current, branchName: value, branchCode: getBranchCode(value) || current.branchCode }))} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TextInput accessibilityLabel="Profile branch code" placeholder="Branch code" value={profileDraft.branchCode} onChangeText={(value) => setProfileDraft((current) => ({ ...current, branchCode: value }))} style={[styles.input, darkMode && { backgroundColor: "#1e293b", borderColor: "#334155", color: "#f1f5f9" }]} />
                  <TouchableOpacity disabled={profileBusy} onPress={() => void saveAcademicProfile()} style={styles.primary}><Text style={styles.primaryText}>{profileBusy ? "Saving…" : "Save academic profile"}</Text></TouchableOpacity>
                  <TouchableOpacity disabled={profileBusy} onPress={() => setProfileEditing(false)} style={styles.secondary}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Cancel</Text></TouchableOpacity>
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>LEVEL & REWARDS</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ flex: 1 }}><Text style={[styles.statValue, darkMode && { color: "#f1f5f9" }]}>{gamification ? "Lv " + gamification.level : "—"}</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Level</Text></View>
                <View style={{ flex: 1 }}><Text style={[styles.statValue, darkMode && { color: "#f1f5f9" }]}>{gamification?.totalXp ?? "—"}</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Total XP</Text></View>
                <View style={{ flex: 1 }}><Text style={[styles.statValue, darkMode && { color: "#f1f5f9" }]}>{gamification?.currentStreak ?? "—"} 🔥</Text><Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Streak</Text></View>
              </View>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{gamification ? "Today " + (gamification.today?.xpEarned ?? 0) + "/" + gamification.dailyGoalXp + " XP · longest streak " + gamification.longestStreak + " days" : "Loading reward summary…"}</Text>
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 6, height: 54, marginTop: 8 }}>
                {(gamification?.week ?? []).map((day) => {
                  const maxXp = Math.max(1, ...(gamification?.week ?? []).map((entry) => entry.xpEarned));
                  const height = Math.max(4, Math.round((day.xpEarned / maxXp) * 38));
                  return <View key={day.date} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 3 }}>
                    <View accessibilityLabel={day.date + ": " + day.xpEarned + " XP"} style={{ width: "100%", height, borderRadius: 4, backgroundColor: day.goalReached ? "#16a34a" : "#3b82f6" }} />
                    <Text style={[styles.muted, { fontSize: 10 }, darkMode && { color: "#94a3b8" }]}>{new Date(day.date + "T00:00:00Z").toLocaleDateString(undefined, { weekday: "short" })}</Text>
                  </View>;
                })}
              </View>
              <TouchableOpacity onPress={() => setActiveTab("settings")} style={styles.secondary}><Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Manage daily goal & streak freezes</Text></TouchableOpacity>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>ACCOUNT ID</Text>
              <Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{user.id}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileLabel, darkMode && { color: "#94a3b8" }]}>QUESTION BANK</Text>
              <Text style={[styles.profileValue, darkMode && { color: "#f1f5f9" }]}>{bank?.total ?? "Loading…"} questions</Text>
            </View>
            <TouchableOpacity onPress={() => void signOut()} style={styles.dangerButton}>
              <MaterialCommunityIcons name="logout" size={18} color="#b42318" />
              <Text style={styles.dangerText}>Sign out</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            <Animated.View style={[styles.hero, animatedEntrance(entrance), darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>SIGNED IN AS</Text>
                  <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>{user.email}</Text>
                  <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Your next focused session starts here.</Text>
                </View>
                <ArcTesterMascot size={84} />
              </View>
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
            <View style={[styles.card, { marginTop: 14, padding: 16 }, darkMode && { backgroundColor: "#172235", borderColor: "#26364d" }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { marginTop: 0 }, darkMode && { color: "#f1f5f9" }]}>Your rewards</Text>
                  <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{gamification ? "Level " + gamification.level + " · " + gamification.totalXp + " total XP" : "Loading XP and streak…"}</Text>
                  <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>{gamification ? "🔥 " + gamification.currentStreak + " day streak · " + (gamification.today?.xpEarned ?? 0) + "/" + gamification.dailyGoalXp + " XP today" : "Keep learning to build your streak."}</Text>
                </View>
                <TouchableOpacity accessibilityRole="button" onPress={() => setActiveTab("settings")} style={styles.secondary}><Text style={styles.secondaryText}>Goals</Text></TouchableOpacity>
              </View>
              <View style={{ height: 8, borderRadius: 8, backgroundColor: darkMode ? "#26364d" : "#e2e8f0", overflow: "hidden", marginTop: 10 }}>
                <View style={{ height: 8, width: `${gamification?.xpIntoLevel ?? 0}%`, backgroundColor: "#2563eb" }} />
              </View>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start mistakes practice from questions previously answered incorrectly" disabled={busy || checkingPracticeRecovery || hasSavedPracticeAttempt || !bank?.total} onPress={() => void startPractice({ subjects: [], topicFilters: [], difficulty: "any", count: 20, durationMinutes: 20, questionTypes: [] }, false, false, true)} style={[styles.secondary, { flex: 1 }, (busy || checkingPracticeRecovery || hasSavedPracticeAttempt) && { opacity: 0.5 }]}>
                  <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Review mistakes</Text>
                </TouchableOpacity>
                <TouchableOpacity accessibilityRole="button" accessibilityLabel="Start today's ten-question daily challenge" disabled={busy || checkingPracticeRecovery || hasSavedPracticeAttempt || !bank?.total} onPress={() => void startPractice({ subjects: [], topicFilters: [], difficulty: "any", count: 10, durationMinutes: 20, questionTypes: [] }, false, false, false, true)} style={[styles.primary, { flex: 1, backgroundColor: "#7c3aed" }, (busy || checkingPracticeRecovery || hasSavedPracticeAttempt) && { opacity: 0.5 }]}>
                  <Text style={[styles.primaryText, { color: "#ffffff" }]}>{gamification?.dailyChallengeCompleted ? "Challenge completed · replay" : "Daily challenge"}</Text>
                </TouchableOpacity>
              </View>
              <Text style={[styles.muted, { marginTop: 8 }, darkMode && { color: "#a7b4c8" }]}>{gamification?.dailyChallengeCompleted ? "Completed today · replaying will not duplicate the daily XP reward" : "10 approved questions · rotates daily (UTC) · daily XP reward"}</Text>
            </View>
            
            <TouchableOpacity
              accessibilityRole="button"
              onPress={() => setActiveTab("learn")}
              style={[styles.card, { marginTop: 14, padding: 16, borderColor: "#8b5cf6", backgroundColor: darkMode ? "#172235" : "#f5f3ff" }]}
            >
              <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 4 }, darkMode && { color: "#f1f5f9" }]}>Concept library for your branch</Text>
              <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Explore explanations, examples and common mistakes curated for your diploma branch.</Text>
              <Text style={{ color: "#7c3aed", fontWeight: "800", marginTop: 10 }}>Open learning hub →</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Start 10-question speed round, five minutes"
              disabled={busy || checkingPracticeRecovery || hasSavedPracticeAttempt || !bank?.subjects.some((subject) => (subject.practiceCount ?? subject.count) > 0)}
              onPress={() => {
                const subjects = (bank?.subjects ?? []).filter((subject) => (subject.practiceCount ?? subject.count) > 0).map((subject) => subject.subject);
                void startPractice({ subjects, topicFilters: [], difficulty: "any", count: 10, durationMinutes: 20, questionTypes: [] }, false, true);
              }}
              style={[styles.card, { marginTop: 14, padding: 18, borderColor: "#f59e0b", backgroundColor: darkMode ? "#172235" : "#fffbeb" }, (busy || checkingPracticeRecovery || hasSavedPracticeAttempt) && { opacity: 0.5 }]}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: "#fef3c7", alignItems: "center", justifyContent: "center" }}>
                  <MaterialCommunityIcons name="timer-sand" size={28} color="#b45309" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sectionTitle, { marginTop: 0, marginBottom: 4 }, darkMode && { color: "#f1f5f9" }]}>Speed round</Text>
                  <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>10 questions · 5 minutes · mixed subjects</Text>
                  <Text style={{ color: "#b45309", fontWeight: "800", marginTop: 8 }}>Start challenge  →</Text>
                </View>
              </View>
            </TouchableOpacity>
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

<TouchableOpacity onPress={() => void signOut()} style={styles.secondary}>
              <Text style={[styles.secondaryText, darkMode && { color: "#cbd5e1" }]}>Sign out</Text>
            </TouchableOpacity>
          </>
        )}

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

          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "exams" }} accessibilityLabel="Exams tab" style={styles.navItem} onPress={() => setActiveTab("exams")}><MaterialCommunityIcons name="clipboard-text-outline" size={23} color={activeTab === "exams" ? "#2563eb" : "#8993a5"} /><Text style={[styles.navLabel, activeTab === "exams" && styles.navLabelActive]}>Exams</Text></TouchableOpacity>

          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "learn" }} accessibilityLabel="Learn tab" style={styles.navItem} onPress={() => setActiveTab("learn")}><MaterialCommunityIcons name="book-open-page-variant" size={23} color={activeTab === "learn" ? "#2563eb" : "#8993a5"} /><Text style={[styles.navLabel, activeTab === "learn" && styles.navLabelActive]}>Learn</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "settings" }} accessibilityLabel="Settings tab" style={styles.navItem} onPress={() => setActiveTab("settings")}><MaterialCommunityIcons name="cog" size={23} color={activeTab === "settings" ? "#2563eb" : "#8993a5"} /><Text style={[styles.navLabel, activeTab === "settings" && styles.navLabelActive]}>Settings</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="tab" accessibilityState={{ selected: activeTab === "profile" }} accessibilityLabel="Account tab" style={styles.navItem} onPress={() => setActiveTab("profile")}>
            <MaterialCommunityIcons name="account-circle" size={23} color={activeTab === "profile" ? "#2563eb" : "#8993a5"} />
            <Text style={[styles.navLabel, activeTab === "profile" && styles.navLabelActive]}>Account</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      {profileSuccessVisible ? (
        <View style={styles.profileChangeOverlay}>
          <View style={[styles.card, { width: "100%", maxWidth: 360 }, darkMode && { backgroundColor: "#172235", borderColor: "#334155" }]}>
            <Text style={[styles.heading, darkMode && { color: "#f1f5f9" }]}>Settings changed successfully. Please log in again.</Text>
            <Text style={[styles.muted, darkMode && { color: "#a7b4c8" }]}>Your academic identity was updated and existing sessions were revoked.</Text>
            <TouchableOpacity onPress={continueAfterProfileChange} style={styles.primary}><Text style={styles.primaryText}>Continue to login</Text></TouchableOpacity>
          </View>
        </View>
      ) : null}
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
              <ArcTesterMascot variant="mascot" size={104} />
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
  profileChangeOverlay: { ...StyleSheet.absoluteFillObject, zIndex: 200, elevation: 200, backgroundColor: "rgba(3, 7, 18, 0.72)", alignItems: "center", justifyContent: "center", padding: 24 },
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
  startupProgressTrack: { width: "78%", height: 3, borderRadius: 4, overflow: "hidden", backgroundColor: mobilePalette.dark.surfaceRaised, marginTop: 30 },
  startupProgressFill: { height: 3, backgroundColor: "#22d3ee", shadowColor: "#22d3ee", shadowOpacity: 1, shadowRadius: 8 },
  startupLinkText: { color: "#a5f3fc", fontSize: 13, fontWeight: "900", letterSpacing: 6, marginTop: 22 },
  startupStatus: { color: "#64748b", fontSize: 8, fontWeight: "700", letterSpacing: 1.5, marginTop: 10 },
  startupFooter: { position: "absolute", bottom: 28, color: "#475569", fontSize: 8, letterSpacing: 2 },
  authContainer: { flexGrow: 1, justifyContent: "center" },
  safe: { flex: 1, backgroundColor: mobilePalette.light.background },
  dashboardScroll: { flex: 1 },
  container: {
    padding: spacing["5"],
    paddingBottom: spacing["7"],
    maxWidth: 680,
    width: "100%",
    alignSelf: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 28 },
  logo: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: mobilePalette.light.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  logoText: { color: "#fff", fontWeight: "800", fontSize: 22 },
  brand: { color: mobilePalette.light.text, fontSize: 19, fontWeight: "800" },
  muted: { color: mobilePalette.light.muted, fontSize: 13, marginTop: 3 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radius.xl,
    padding: spacing["5"],
    borderWidth: 1,
    borderColor: mobilePalette.light.border,
  },
  hero: {
    backgroundColor: mobilePalette.light.surface,
    padding: spacing["6"],
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: mobilePalette.light.border,
  },
  heading: { color: mobilePalette.light.text, fontSize: typeScale.size["2xl"], fontWeight: "800", marginTop: 6, marginBottom: 5 },
  fieldHint: { color: "#8993a5", fontSize: 11, lineHeight: 16, marginTop: 7 },
  suggestionList: { marginTop: 6, borderWidth: 1, borderColor: "#dce2eb", borderRadius: 12, overflow: "hidden", backgroundColor: "#fff" },
  suggestionItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e6ebf2" },
  suggestionName: { color: "#293449", fontSize: 12, fontWeight: "700", lineHeight: 17 },
  suggestionCode: { color: "#8993a5", fontSize: 10, marginTop: 3 },
  input: {
    borderWidth: 1,
    borderColor: "#dce2eb",
    borderRadius: radius.md,
    padding: spacing["3"],
    marginTop: spacing["3"],
    color: mobilePalette.light.text,
    backgroundColor: "#fff",
  },
  primary: {
    backgroundColor: mobilePalette.light.primary,
    borderRadius: radius.md,
    padding: spacing["4"],
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
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: mobilePalette.light.border,
  },
  statValue: { color: mobilePalette.light.text, fontSize: 25, fontWeight: "800" },
  announcementHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  refreshText: { color: mobilePalette.light.primary, fontWeight: "700", fontSize: 13 },
  announcementCard: {
    backgroundColor: mobilePalette.light.surface,
    borderWidth: 1,
    borderColor: mobilePalette.light.border,
    borderRadius: radius.md,
    padding: spacing["4"],
    marginBottom: 9,
  },
  announcementTitle: { color: mobilePalette.light.text, fontWeight: "800", fontSize: 15 },
  announcementMessage: {
    color: "#526078",
    fontSize: 14,
    lineHeight: 21,
    marginTop: 7,
  },
  notificationUnread: { borderColor: "#93c5fd", borderWidth: 1.5 },
  notificationBadge: { color: mobilePalette.light.primary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  announcementDate: { color: "#9aa3b2", fontSize: 11, marginTop: 10 },
  dashboardMetricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginVertical: 10 },
  dashboardMetric: { width: "47%", padding: 10, borderRadius: 12, backgroundColor: "#f7f9fc" },
  dashboardMetricValue: { color: mobilePalette.light.text, fontSize: 22, fontWeight: "800" },
  sectionTitle: {
    color: mobilePalette.light.text,
    fontSize: 17,
    fontWeight: "800",
    marginTop: 26,
    marginBottom: 10,
  },
  subject: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: mobilePalette.light.border,
    borderRadius: 14,
    padding: 16,
    marginBottom: 9,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  subjectName: { color: mobilePalette.light.text, fontWeight: "700", fontSize: 15 },
  arrow: { color: mobilePalette.light.primary, fontSize: 25 },
  examHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  timerPill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#eff6ff", borderRadius: 20, paddingHorizontal: 11, paddingVertical: 8 },
  timerText: { color: mobilePalette.light.primary, fontWeight: "800", fontVariant: ["tabular-nums"] },
  timerExpired: { backgroundColor: "#fff1f0" },
  timerExpiredText: { color: "#b42318" },
  progressTrack: { height: 7, backgroundColor: "#e9edf5", borderRadius: 8, overflow: "hidden", marginTop: 18 },
  progressFill: { height: "100%", backgroundColor: mobilePalette.light.primary, borderRadius: 8 },
  examHint: { color: "#8993a5", fontSize: 11, marginTop: 8 },
  navigator: { marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: "#f7f9fc", borderWidth: 1, borderColor: "#e8edf5" },
  navigatorTitle: { color: mobilePalette.light.muted, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  navigatorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  navigatorItem: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, borderColor: "#dce2eb", backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  navigatorAnswered: { backgroundColor: "#eaf7f0", borderColor: "#9bd4b5" },
  navigatorCurrent: { borderColor: mobilePalette.light.primary, borderWidth: 2, backgroundColor: "#eff6ff" },
  navigatorNumber: { color: "#526078", fontSize: 12, fontWeight: "700" },
  navigatorNumberAnswered: { color: "#167647" },
  navigatorNumberCurrent: { color: mobilePalette.light.primary },
  navigatorLegend: { flexDirection: "row", gap: 14, marginTop: 10 },
  navigatorLegendText: { color: mobilePalette.light.muted, fontSize: 10 },
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
  examNext: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, backgroundColor: mobilePalette.light.primary, borderRadius: 12, minHeight: 48, paddingHorizontal: 10 },
  submitLink: { alignItems: "center", marginTop: 8, padding: 6 },

  swipeHint: { color: "#8993a5", fontSize: 10, fontWeight: "600", marginBottom: 10 },
  questionTitle: {
    color: mobilePalette.light.text,
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
  optionSelected: { borderColor: mobilePalette.light.primary, backgroundColor: "#eff6ff" },
  optionText: { color: "#293449", lineHeight: 21 },
  optionTextSelected: { color: "#1e3a8a", fontWeight: "700" },
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
    borderColor: mobilePalette.light.border,
    borderRadius: 18,
    paddingHorizontal: 8,
    paddingVertical: 8,
    marginHorizontal: 12,
    marginBottom: 8,
    minHeight: 64,
    shadowColor: mobilePalette.light.text,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  navItem: { flex: 1, alignItems: "center", justifyContent: "center", minWidth: 0, minHeight: 48, gap: 4 },
  navLabel: { color: "#8993a5", fontSize: 11, fontWeight: "600" },
  navLabelActive: { color: mobilePalette.light.primary },
  profileAvatar: {
    width: 76,
    height: 76,
    borderRadius: 25,
    backgroundColor: mobilePalette.light.primary,
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
  profileValue: { color: mobilePalette.light.text, fontSize: 15, fontWeight: "700", marginTop: 5 },
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
