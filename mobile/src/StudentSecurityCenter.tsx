import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getSessionActionLabel } from "./securitySessionActions";

export type SecuritySession = {
  id: string; deviceName: string; platform: string; loginMethod: string;
  ipAddress: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean;
};
type LoginEvent = { id: string; result: string; method: string; ipAddress: string; userAgent: string; createdAt: string };
type SecurityStatus = { authenticatorEnabled: boolean; recoveryCodesRemaining: number; passkeyCount: number };
type SecurityApi = <T>(path: string, init?: RequestInit) => Promise<T>;
type Props = { api: SecurityApi; darkMode: boolean; onBack: () => void; onSignOut: () => void };

export default function StudentSecurityCenter({ api, darkMode, onBack, onSignOut }: Props) {
  const [sessions, setSessions] = useState<SecuritySession[]>([]);
  const [events, setEvents] = useState<LoginEvent[]>([]);
  const [status, setStatus] = useState<SecurityStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function refresh() {
    setLoading(true);
    setError("");
    try {
      const [sessionResult, eventResult, statusResult] = await Promise.all([
        api<{ sessions: SecuritySession[] }>("/auth/sessions"),
        api<{ events: LoginEvent[] }>("/auth/login-history"),
        api<SecurityStatus>("/auth/2fa/status"),
      ]);
      setSessions(sessionResult.sessions ?? []);
      setEvents(eventResult.events ?? []);
      setStatus(statusResult);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load account security.");
    } finally { setLoading(false); }
  }

  useEffect(() => { void refresh(); }, []);

  async function revoke(session: SecuritySession) {
    setBusyId(session.id);
    setError("");
    try {
      await api("/auth/sessions/" + encodeURIComponent(session.id), { method: "DELETE" });
      if (session.current) {
        onSignOut();
        return;
      }
      setSessions(current => current.filter(item => item.id !== session.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not revoke this session.");
    } finally { setBusyId(null); }
  }

  function revokeAll() {
    Alert.alert("Sign out all devices?", "This revokes every active session, including this device.", [
      { text: "Cancel", style: "cancel" },
      { text: "Revoke all", style: "destructive", onPress: () => {
        setBusyId("all");
        setError("");
        void api("/auth/sessions/revoke-all", { method: "POST", body: JSON.stringify({}) })
          .then(() => onSignOut())
          .catch(cause => setError(cause instanceof Error ? cause.message : "Could not revoke sessions."))
          .finally(() => setBusyId(null));
      } },
    ]);
  }

  const card = [styles.card, darkMode && styles.cardDark];
  const text = [styles.text, darkMode && styles.textDark];
  const muted = [styles.muted, darkMode && styles.mutedDark];

  return <View>
    <View style={styles.header}>
      <View style={{ flex: 1 }}><Text style={[styles.eyebrow, darkMode && styles.eyebrowDark]}>ACCOUNT PROTECTION</Text><Text style={[styles.heading, darkMode && styles.textDark]}>Security & sessions</Text><Text style={muted}>Review signed-in devices and recent sign-ins.</Text></View>
      <TouchableOpacity accessibilityRole="button" onPress={onBack} style={styles.back}><Text style={text}>Back</Text></TouchableOpacity>
    </View>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    {loading ? <ActivityIndicator style={{ marginVertical: 24 }} /> : <>
      <View style={card}>
        <Text style={[styles.sectionTitle, darkMode && styles.textDark]}>Security status</Text>
        <Text style={text}>Authenticator: {status?.authenticatorEnabled ? "Enabled" : "Not enabled"}</Text>
        <Text style={text}>Passkeys: {status?.passkeyCount ?? 0}</Text>
        <Text style={text}>Recovery codes remaining: {status?.recoveryCodesRemaining ?? 0}</Text>
        <Text style={muted}>Authenticator and passkey enrollment are managed from ArcTester Web Settings.</Text>
      </View>
      <View style={card}>
        <View style={styles.sectionHeader}><Text style={[styles.sectionTitle, darkMode && styles.textDark]}>Active sessions</Text><TouchableOpacity accessibilityRole="button" disabled={busyId !== null} onPress={() => void refresh()}><Text style={styles.link}>Refresh</Text></TouchableOpacity></View>
        {sessions.length ? sessions.map(session => <View key={session.id} style={styles.session}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.text, darkMode && styles.textDark]}>{session.deviceName}{session.current ? " · This device" : ""}</Text>
            <Text style={muted}>{session.platform} · {session.loginMethod} · {session.ipAddress || "IP unavailable"}</Text>
            <Text style={muted}>Last active {new Date(session.lastSeenAt).toLocaleString()}</Text>
          </View>
          <TouchableOpacity accessibilityRole="button" disabled={busyId !== null} onPress={() => void revoke(session)} style={styles.revoke}><Text style={styles.revokeText}>{busyId === session.id ? "Revoking…" : getSessionActionLabel(session)}</Text></TouchableOpacity>
        </View>) : <Text style={muted}>No active sessions were returned.</Text>}
        {sessions.length > 1 ? <TouchableOpacity accessibilityRole="button" disabled={busyId !== null} onPress={revokeAll} style={styles.revokeAll}><Text style={styles.revokeText}>{busyId === "all" ? "Revoking…" : "Sign out all devices"}</Text></TouchableOpacity> : null}
      </View>
      <View style={card}>
        <Text style={[styles.sectionTitle, darkMode && styles.textDark]}>Recent sign-ins</Text>
        {events.length ? events.slice(0, 10).map(event => <View key={event.id} style={styles.event}>
          <Text style={[styles.text, darkMode && styles.textDark]}>{event.result.replaceAll("_", " ")} · {event.method}</Text>
          <Text style={muted}>{event.ipAddress || "IP unavailable"} · {new Date(event.createdAt).toLocaleString()}</Text>
        </View>) : <Text style={muted}>No recent sign-in events.</Text>}
      </View>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 16 },
  eyebrow: { color: "#2563eb", fontSize: 10, fontWeight: "800", letterSpacing: 1.5 },
  eyebrowDark: { color: "#7dd3fc" },
  heading: { color: "#142033", fontSize: 23, fontWeight: "800", marginTop: 5 },
  back: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, backgroundColor: "#e8eef7" },
  card: { backgroundColor: "#ffffff", borderColor: "#e2e8f0", borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12 },
  cardDark: { backgroundColor: "#172235", borderColor: "#334155" },
  sectionTitle: { color: "#142033", fontSize: 16, fontWeight: "800", marginBottom: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  text: { color: "#263449", fontSize: 13, fontWeight: "600", marginBottom: 5 },
  textDark: { color: "#f1f5f9" },
  muted: { color: "#66758b", fontSize: 11, lineHeight: 17, marginTop: 4 },
  mutedDark: { color: "#a7b4c8" },
  link: { color: "#2563eb", fontSize: 12, fontWeight: "800" },
  session: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#dbe2ec" },
  revoke: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: "#fff1f0", maxWidth: 120 },
  revokeText: { color: "#b42318", fontSize: 11, fontWeight: "800", textAlign: "center" },
  revokeAll: { alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: "#fff1f0", marginTop: 8 },
  event: { paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#dbe2ec" },
  error: { color: "#b42318", backgroundColor: "#fff1f0", borderRadius: 10, padding: 12, marginBottom: 12, fontSize: 12 },
});
