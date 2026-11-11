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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { OfflineExams } from "./src/OfflineExams";

const API_URL = (process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000").replace(/\/+$/, "");
type User = { id: number; email: string };
type Bank = { total: number; subjects: { subject: string; count: number }[] };
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
type Test = { attemptId: number; questions: Question[]; warnings: string[] };

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invitationToken, setInvitationToken] = useState("");
  const [register, setRegister] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [bank, setBank] = useState<Bank | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [refreshingAnnouncements, setRefreshingAnnouncements] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [refreshingNotifications, setRefreshingNotifications] = useState(false);
  const [test, setTest] = useState<Test | null>(null);
  const [showExams, setShowExams] = useState(false);
  const [activeTab, setActiveTab] = useState<"home" | "profile">("home");
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(20 * 60);
  const [busy, setBusy] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const sessionIdentity = token && user ? `${user.id}:${token}` : null;
  const sessionIdentityRef = useRef<string | null>(sessionIdentity);
  sessionIdentityRef.current = sessionIdentity;
  const questionTransition = useRef(new Animated.Value(1)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const [error, setError] = useState("");
  const [startupVisible, setStartupVisible] = useState(true);
  const startupFade = useRef(new Animated.Value(1)).current;
  const startupLogo = useRef(new Animated.Value(0)).current;
  const startupProgress = useRef(new Animated.Value(0)).current;
  const startupOrbit = useRef(new Animated.Value(0)).current;
  const startupPulse = useRef(new Animated.Value(0.85)).current;
  const entrance = useRef(new Animated.Value(0)).current;
  const statsEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
    return () => {
      mounted = false;
      subscription.remove();
    };
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
  }, [entrance, reduceMotion, statsEntrance, user, test, showExams]);

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
    if (!response.ok) throw new Error(body.error || "The server request failed.");
    return body as T;
  }

  useEffect(() => {
    SecureStore.getItemAsync("arctester-token").then((saved) => {
      if (saved) setToken(saved);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    api<{ user: User }>("/auth/me")
      .then((result) => setUser(result.user))
      .catch(async () => {
        await SecureStore.deleteItemAsync("arctester-token");
        setToken(null);
      });
  }, [token]);

  useEffect(() => {
    if (!token || !user) return;
    const requestIdentity = `${user.id}:${token}`;
    let cancelled = false;
    const isCurrentSession = () => !cancelled && sessionIdentityRef.current === requestIdentity;
    const registerDevice = async () => {
      let fingerprint = await SecureStore.getItemAsync("arctester-device-fingerprint");
      if (!fingerprint) {
        fingerprint = `mobile-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
        await SecureStore.setItemAsync("arctester-device-fingerprint", fingerprint);
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
    registerDevice().catch((cause) => { if (isCurrentSession()) setError((cause as Error).message); });
    api<Bank>("/bank")
      .then((result) => { if (isCurrentSession()) setBank(result); })
      .catch((cause) => { if (isCurrentSession()) setError((cause as Error).message); });
    api<{ announcements: Announcement[] }>("/announcements")
      .then((result) => { if (isCurrentSession()) setAnnouncements(result.announcements); })
      .catch(() => undefined);
    api<{ notifications: Notification[]; unreadCount?: number }>("/notifications")
      .then((result) => {
        if (!isCurrentSession()) return;
        const items = Array.isArray(result.notifications) ? result.notifications : [];
        setNotifications(items);
        setUnreadNotificationCount(
          typeof result.unreadCount === "number" && Number.isFinite(result.unreadCount)
            ? Math.max(0, Math.floor(result.unreadCount))
            : items.filter((item) => !item.readAt).length,
        );
      })
      .catch(() => undefined);
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
    setRefreshingNotifications(true);
    try {
      const result = await api<{ notifications: Notification[]; unreadCount?: number }>("/notifications");
      if (sessionIdentityRef.current !== requestIdentity) return;
      const items = Array.isArray(result.notifications) ? result.notifications : [];
      setNotifications(items);
      setUnreadNotificationCount(
        typeof result.unreadCount === "number" && Number.isFinite(result.unreadCount)
          ? Math.max(0, Math.floor(result.unreadCount))
          : items.filter((item) => !item.readAt).length,
      );
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) setError((cause as Error).message);
    } finally {
      if (sessionIdentityRef.current === requestIdentity) setRefreshingNotifications(false);
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
    try {
      const result = await api<{ readAt: string; alreadyRead?: boolean }>(
        `/notifications/${encodeURIComponent(id)}/read`,
        { method: "POST", body: JSON.stringify({}) },
      );
      if (sessionIdentityRef.current !== requestIdentity) return;
      const current = notifications.find((item) => item.id === id);
      if (current && !current.readAt && result.alreadyRead !== true) {
        setUnreadNotificationCount((count) => Math.max(0, count - 1));
      }
      setNotifications((items) => items.map((item) => item.id === id ? { ...item, readAt: result.readAt } : item));
    } catch (cause) {
      if (sessionIdentityRef.current === requestIdentity) setError((cause as Error).message);
    }
  }

  function openNotification(notification: Notification) {
    void markNotificationRead(notification.id);
    if (notification.href === "/assignments" || /^\/assignments\/[^/]+\/result$/.test(notification.href)) {
      setShowExams(true);
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
        await SecureStore.setItemAsync("arctester-token", result.token);
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

  async function startPractice(subject?: string) {
    if (!subject && !bank?.subjects.length) {
      setError("No subjects are available for mixed practice yet.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await api<Test>("/tests", {
        method: "POST",
        body: JSON.stringify({ mode: "practice", ...(subject ? { subject } : { subjects: (bank?.subjects ?? []).map((item) => item.subject) }), count: 10 }),
      });
      setTest(result);
      setAnswers({});
      setCurrentQuestionIndex(0);
      setSecondsLeft(20 * 60);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!test) return;
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
        ? `Your ${answered} answered question(s) will be lost if you exit now.`
        : "Your current practice session will be discarded.",
      [
        { text: "Stay", style: "cancel" },
        { text: "Exit", style: "destructive", onPress: () => { setTest(null); setCurrentQuestionIndex(0); } },
      ],
    );
  }

  async function submit() {
    if (!test) return;
    setBusy(true);
    try {
      await api(`/tests/${test.attemptId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: test.questions.map((question) => ({
            questionId: question.id,
            selectedIndex: answers[question.id] ?? null,
          })),
        }),
      });
      setTest(null);
      setCurrentQuestionIndex(0);
      setError("Practice submitted. Open the web app to review the full result.");
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
    await SecureStore.deleteItemAsync("arctester-token");
    setToken(null);
    setUser(null);
    setBank(null);
    setAnnouncements([]);
    setNotifications([]);
    setUnreadNotificationCount(0);
    setRefreshingAnnouncements(false);
    setRefreshingNotifications(false);
    setTest(null);
    setCurrentQuestionIndex(0);
    setShowExams(false);
    setActiveTab("home");
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style={startupVisible ? "light" : "auto"} />
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>A</Text>
          </View>
          <View>
            <Text style={styles.brand}>ArcTester</Text>
            <Text style={styles.muted}>Practice with purpose</Text>
          </View>
        </View>

        {!user ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance)]}>
            <Text style={styles.heading}>{register ? "Create your account" : "Welcome back"}</Text>
            <Text style={styles.muted}>
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
              style={styles.input}
            />
            <TextInput
              secureTextEntry
              placeholder="Password"
              placeholderTextColor="#8b95a7"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
            />
            {register && (
              <TextInput
                autoCapitalize="none"
                placeholder="Invitation code"
                placeholderTextColor="#8b95a7"
                value={invitationToken}
                onChangeText={setInvitationToken}
                style={styles.input}
              />
            )}
            <TouchableOpacity disabled={busy} onPress={authenticate} style={styles.primary}>
              <Text style={styles.primaryText}>
                {busy ? "Please wait…" : register ? "Create account" : "Sign in"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setRegister(!register)} style={styles.secondary}>
              <Text style={styles.secondaryText}>
                {register
                  ? "Already have an account? Sign in"
                  : "Have an invitation? Create account"}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        ) : showExams ? (
          <OfflineExams api={api} apiUrl={API_URL} token={token ?? ""} userId={String(user.id)} onExit={() => { setShowExams(false); setActiveTab("home"); }} />
        ) : test ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance)]}>
            <View style={styles.examHeader}>
              <View>
                <Text style={styles.heading}>Practice session</Text>
                <Text style={styles.muted}>Question {currentQuestionIndex + 1} of {test.questions.length}</Text>
              </View>
              <View style={[styles.timerPill, secondsLeft === 0 && styles.timerExpired]}>
                <MaterialCommunityIcons name="timer-outline" size={17} color={secondsLeft === 0 ? "#b42318" : "#2563eb"} />
                <Text style={[styles.timerText, secondsLeft === 0 && styles.timerExpiredText]}>{formatTime(secondsLeft)}</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, { width: progress.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] }) }]} />
            </View>
            <Text style={styles.examHint}>{Object.keys(answers).length} of {test.questions.length} answered · 20-minute practice</Text>
            <View style={styles.navigator}>
              <Text style={styles.navigatorTitle}>JUMP TO QUESTION</Text>
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
                      onPress={() => setCurrentQuestionIndex(index)}
                      style={[
                        styles.navigatorItem,
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
                <Text style={styles.navigatorLegendText}>● Answered</Text>
                <Text style={styles.navigatorLegendText}>○ Unanswered</Text>
              </View>
            </View>
            {secondsLeft === 0 && <Text style={styles.timerNotice}>Time is up. Submit your answers to finish.</Text>}
            {test.questions[currentQuestionIndex] && (
              <Animated.View
                key={test.questions[currentQuestionIndex].id}
                style={[
                  styles.question,
                  {
                    opacity: questionTransition,
                    transform: [{ translateX: questionTransition.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
                  },
                ]}
              >
                <Text style={styles.questionTitle}>{test.questions[currentQuestionIndex].text}</Text>
                {test.questions[currentQuestionIndex].options.map((option, optionIndex) => {
                  const selected = answers[test.questions[currentQuestionIndex].id] === optionIndex;
                  return (
                    <TouchableOpacity
                      key={optionIndex}
                      onPress={() => setAnswers((current) => ({ ...current, [test.questions[currentQuestionIndex].id]: optionIndex }))}
                      style={[styles.option, selected && styles.optionSelected]}
                      activeOpacity={0.78}
                    >
                      <View style={styles.optionRow}>
                        <View style={[styles.optionLetter, selected && styles.optionLetterSelected]}>
                          <Text style={[styles.optionLetterText, selected && styles.optionLetterTextSelected]}>{String.fromCharCode(65 + optionIndex)}</Text>
                        </View>
                        <Text style={[styles.optionText, { flex: 1 }]}>{option}</Text>
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
                onPress={() => setCurrentQuestionIndex((index) => Math.max(0, index - 1))}
                style={[styles.examSecondary, currentQuestionIndex === 0 && styles.examButtonDisabled]}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color={currentQuestionIndex === 0 ? "#aab2c0" : "#526078"} />
                <Text style={styles.examSecondaryText}>Previous</Text>
              </TouchableOpacity>
              {currentQuestionIndex < test.questions.length - 1 ? (
                <TouchableOpacity onPress={() => setCurrentQuestionIndex((index) => Math.min(test.questions.length - 1, index + 1))} style={styles.examNext}>
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
                <Text style={styles.secondaryText}>Submit practice now</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={confirmExitPractice} style={styles.secondary}>
              <Text style={styles.secondaryText}>Exit practice</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : activeTab === "profile" ? (
          <Animated.View style={[styles.card, animatedEntrance(entrance)]}>
            <View style={styles.profileAvatar}>
              <MaterialCommunityIcons name="account" size={34} color="#ffffff" />
            </View>
            <Text style={[styles.heading, { textAlign: "center" }]}>Your profile</Text>
            <Text style={[styles.muted, { textAlign: "center" }]}>{user.email}</Text>
            <View style={styles.profileInfo}>
              <Text style={styles.profileLabel}>ACCOUNT ID</Text>
              <Text style={styles.profileValue}>{user.id}</Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileLabel}>QUESTION BANK</Text>
              <Text style={styles.profileValue}>{bank?.total ?? "Loading…"} questions</Text>
            </View>
            <TouchableOpacity onPress={signOut} style={styles.dangerButton}>
              <MaterialCommunityIcons name="logout" size={18} color="#b42318" />
              <Text style={styles.dangerText}>Sign out</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            <Animated.View style={[styles.hero, animatedEntrance(entrance)]}>
              <Text style={styles.muted}>SIGNED IN AS</Text>
              <Text style={styles.heading}>{user.email}</Text>
              <Text style={styles.muted}>Your next focused session starts here.</Text>
            </Animated.View>
            <Animated.View style={[styles.stats, { opacity: statsEntrance, transform: [{ translateY: statsEntrance.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }, { scale: statsEntrance.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }] }]}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bank?.total ?? "—"}</Text>
                <Text style={styles.muted}>Questions</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bank?.subjects.length ?? "—"}</Text>
                <Text style={styles.muted}>Subjects</Text>
              </View>
            </Animated.View>
            <View style={styles.announcementHeader}>
              <Text style={styles.sectionTitle}>Announcements</Text>
              <TouchableOpacity onPress={refreshAnnouncements} disabled={refreshingAnnouncements}>
                <Text style={styles.refreshText}>
                  {refreshingAnnouncements ? "Refreshing…" : "Refresh"}
                </Text>
              </TouchableOpacity>
            </View>
            {announcements.length === 0 ? (
              <View style={styles.announcementCard}>
                <Text style={styles.muted}>No announcements right now.</Text>
              </View>
            ) : (
              announcements.map((announcement) => (
                <Animated.View key={announcement.id} style={[styles.announcementCard, animatedEntrance(entrance)]}>
                  <Text style={styles.announcementTitle}>{announcement.title}</Text>
                  <Text style={styles.announcementMessage}>{announcement.message}</Text>
                  <Text style={styles.announcementDate}>
                    {new Date(announcement.publishedAt).toLocaleString()}
                  </Text>
                  {announcement.seenAt ? (
                    <Text style={styles.announcementDate}>Seen</Text>
                  ) : (
                    <TouchableOpacity onPress={() => void acknowledgeAnnouncement(announcement.id)} style={styles.secondary}>
                      <Text style={styles.secondaryText}>Mark as seen</Text>
                    </TouchableOpacity>
                  )}
                </Animated.View>
              ))
            )}
            <View style={styles.announcementHeader}>
              <Text style={styles.sectionTitle}>
                Notifications{unreadNotificationCount > 0 ? ` · ${unreadNotificationCount} unread` : ""}
              </Text>
              <TouchableOpacity onPress={refreshNotifications} disabled={refreshingNotifications}>
                <Text style={styles.refreshText}>
                  {refreshingNotifications ? "Refreshing…" : "Refresh"}
                </Text>
              </TouchableOpacity>
            </View>
            {notifications.length === 0 ? (
              <View style={styles.announcementCard}>
                <Text style={styles.muted}>No notifications right now.</Text>
              </View>
            ) : (
              notifications.map((notification) => (
                <TouchableOpacity
                  key={notification.id}
                  onPress={() => openNotification(notification)}
                  style={[styles.announcementCard, !notification.readAt && styles.notificationUnread]}
                  accessibilityRole="button"
                  accessibilityLabel={`${notification.readAt ? "Read" : "Unread"} notification: ${notification.title}`}
                >
                  <View style={styles.announcementHeader}>
                    <Text style={styles.announcementTitle}>{notification.title}</Text>
                    {!notification.readAt ? <Text style={styles.notificationBadge}>NEW</Text> : null}
                  </View>
                  <Text style={styles.announcementMessage}>{notification.message}</Text>
                  <Text style={styles.announcementDate}>{new Date(notification.createdAt).toLocaleString()}</Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              onPress={() => setShowExams(true)}
              style={[styles.primary, { marginTop: 20 }]}
            >
              <Text style={styles.primaryText}>Assigned exams · Offline mode</Text>
            </TouchableOpacity>
            <Text style={styles.sectionTitle}>Practice by subject</Text>
            {bank?.subjects.map((item) => (
              <TouchableOpacity
                key={item.subject}
                onPress={() => startPractice(item.subject)}
                style={styles.subject}
              >
                <View>
                  <Text style={styles.subjectName}>{item.subject}</Text>
                  <Text style={styles.muted}>{item.count} questions</Text>
                </View>
                <Text style={styles.arrow}>›</Text>
              </TouchableOpacity>
            ))}
            <TouchableOpacity
              disabled={busy}
              onPress={() => startPractice()}
              style={styles.primary}
            >
              <Text style={styles.primaryText}>{busy ? "Loading…" : "Start mixed practice"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={signOut} style={styles.secondary}>
              <Text style={styles.secondaryText}>Sign out</Text>
            </TouchableOpacity>
          </>
        )}
        {user && !test && !showExams && (
          <Animated.View style={[styles.bottomNav, animatedEntrance(entrance)]}>
            <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("home")}>
              <MaterialCommunityIcons name="view-dashboard" size={23} color={activeTab === "home" ? "#2563eb" : "#8993a5"} />
              <Text style={[styles.navLabel, activeTab === "home" && styles.navLabelActive]}>Home</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => { setShowExams(true); setActiveTab("home"); }}>
              <MaterialCommunityIcons name="clipboard-text" size={23} color="#8993a5" />
              <Text style={styles.navLabel}>Exams</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.navItem} onPress={() => setActiveTab("profile")}>
              <MaterialCommunityIcons name="account-circle" size={23} color={activeTab === "profile" ? "#2563eb" : "#8993a5"} />
              <Text style={[styles.navLabel, activeTab === "profile" && styles.navLabelActive]}>Profile</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
        {!!error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator style={{ marginTop: 16 }} />}
        <Text style={styles.footer}>ArcTester · Your progress, across devices</Text>
      </ScrollView>
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
  container: {
    padding: 20,
    paddingBottom: 48,
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
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e4e8ef",
    borderRadius: 18,
    paddingVertical: 12,
    marginTop: 24,
    shadowColor: "#172033",
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  navItem: { alignItems: "center", justifyContent: "center", minWidth: 76, gap: 4 },
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
