import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
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
  const [test, setTest] = useState<Test | null>(null);
  const [showExams, setShowExams] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const entrance = useRef(new Animated.Value(0)).current;
  const statsEntrance = useRef(new Animated.Value(0)).current;

  useEffect(() => {
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
  }, [entrance, statsEntrance, user, test, showExams]);

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
    registerDevice().catch((cause) => setError((cause as Error).message));
    api<Bank>("/bank")
      .then(setBank)
      .catch((cause) => setError((cause as Error).message));
    api<{ announcements: Announcement[] }>("/announcements")
      .then((result) => setAnnouncements(result.announcements))
      .catch(() => undefined);
  }, [token, user]);

  async function refreshAnnouncements() {
    setRefreshingAnnouncements(true);
    try {
      const result = await api<{ announcements: Announcement[] }>("/announcements");
      setAnnouncements(result.announcements);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setRefreshingAnnouncements(false);
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
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
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
    await SecureStore.deleteItemAsync("arctester-token");
    setToken(null);
    setUser(null);
    setBank(null);
    setAnnouncements([]);
    setTest(null);
    setShowExams(false);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="auto" />
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
          </View>
        ) : showExams ? (
          <OfflineExams api={api} apiUrl={API_URL} token={token ?? ""} userId={String(user.id)} onExit={() => setShowExams(false)} />
        ) : test ? (
          <View style={styles.card}>
            <Text style={styles.heading}>Practice session</Text>
            <Text style={styles.muted}>
              {test.questions.length} questions · Select one answer per question
            </Text>
            {test.questions.map((question, index) => (
              <View key={question.id} style={styles.question}>
                <Text style={styles.questionTitle}>
                  {index + 1}. {question.text}
                </Text>
                {question.options.map((option, optionIndex) => (
                  <TouchableOpacity
                    key={optionIndex}
                    onPress={() =>
                      setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                    }
                    style={[
                      styles.option,
                      answers[question.id] === optionIndex && styles.optionSelected,
                    ]}
                  >
                    <Text style={styles.optionText}>
                      {String.fromCharCode(65 + optionIndex)}. {option}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            ))}
            <TouchableOpacity disabled={busy} onPress={submit} style={styles.primary}>
              <Text style={styles.primaryText}>{busy ? "Submitting…" : "Submit practice"}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTest(null)} style={styles.secondary}>
              <Text style={styles.secondaryText}>Exit practice</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Animated.View style={[styles.hero, animatedEntrance(entrance)]}>
              <Text style={styles.muted}>SIGNED IN AS</Text>
              <Text style={styles.heading}>{user.email}</Text>
              <Text style={styles.muted}>Your next focused session starts here.</Text>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bank?.total ?? "—"}</Text>
                <Text style={styles.muted}>Questions</Text>
              </View>
              <View style={styles.stat}>
                <Text style={styles.statValue}>{bank?.subjects.length ?? "—"}</Text>
                <Text style={styles.muted}>Subjects</Text>
              </View>
            </View>
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
                </View>
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
        {!!error && <Text style={styles.error}>{error}</Text>}
        {busy && <ActivityIndicator style={{ marginTop: 16 }} />}
        <Text style={styles.footer}>ArcTester · Your progress, across devices</Text>
      </ScrollView>
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
  question: { borderTopWidth: 1, borderTopColor: "#edf0f5", paddingTop: 18, marginTop: 18 },
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
});
