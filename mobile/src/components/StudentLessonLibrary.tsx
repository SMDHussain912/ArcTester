import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { getLocalValue, setLocalValue } from "../localSettings";
import { clampSceneIndex, formatLessonTime, getElapsedBeforeScene, getLessonDurationMs, type PublishedLesson } from "../lessonPlayer";
import { mobilePalette, radius, spacing, typeScale } from "../design/tokens";

type Props = {
  darkMode: boolean;
  reduceMotion: boolean;
  userId: number;
  apiBaseUrl: string;
  authToken: string | null;
  loadLessons: () => Promise<PublishedLesson[]>;
};

const progressKey = (userId: number, lessonId: string) => `arctester-generated-lesson-progress:${userId}:${lessonId}`;

export default function StudentLessonLibrary({ darkMode, reduceMotion, userId, apiBaseUrl, authToken, loadLessons }: Props) {
  const [lessons, setLessons] = useState<PublishedLesson[]>([]);
  const [activeLesson, setActiveLesson] = useState<PublishedLesson | null>(null);
  const [sceneIndex, setSceneIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const [completed, setCompleted] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSceneKey, setVoiceSceneKey] = useState("");
  const [voiceError, setVoiceError] = useState("");
  const audioPlayer = useAudioPlayer(null, { downloadFirst: true });
  const audioStatus = useAudioPlayerStatus(audioPlayer);
  const loadLessonsRef = useRef(loadLessons);
  loadLessonsRef.current = loadLessons;
  const palette = darkMode ? mobilePalette.dark : mobilePalette.light;
  const sceneProgress = useRef(new Animated.Value(0)).current;
  const diagramMotion = useRef(new Animated.Value(0)).current;
  const sceneCount = activeLesson?.storyboard.scenes.length ?? 0;
  const safeIndex = clampSceneIndex(sceneIndex, sceneCount);
  const scene = activeLesson?.storyboard.scenes[safeIndex] ?? null;
  const totalDuration = activeLesson ? getLessonDurationMs(activeLesson.storyboard) : 0;
  const elapsed = activeLesson ? getElapsedBeforeScene(activeLesson.storyboard, safeIndex) : 0;
  const progressStart = totalDuration > 0 ? Math.min(1, elapsed / totalDuration) : 0;
  const progressEnd = totalDuration > 0 ? Math.min(1, (elapsed + (scene?.durationMs ?? 0)) / totalDuration) : 0;
  const progressWidth = sceneProgress.interpolate({ inputRange: [0, 1], outputRange: [`${progressStart * 100}%`, `${progressEnd * 100}%`] });

  const refresh = async () => {
    setLoading(true);
    setError("");
    try { setLessons(await loadLessonsRef.current()); }
    catch (cause) { setError((cause as Error).message || "Could not load published lessons."); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    loadLessonsRef.current().then((items) => { if (active) setLessons(items); }).catch((cause) => { if (active) setError((cause as Error).message || "Could not load published lessons."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (audioStatus.error) setVoiceError(audioStatus.error);
  }, [audioStatus.error]);

  useEffect(() => {
    audioPlayer.pause();
    setVoiceSceneKey("");
    setVoiceError("");
  }, [activeLesson?.id, safeIndex, audioPlayer]);

  useEffect(() => {
    sceneProgress.setValue(0);
    if (reduceMotion) {
      sceneProgress.setValue(1);
      return;
    }
    const duration = playing && scene ? Math.max(2500, scene.durationMs) : 520;
    Animated.timing(sceneProgress, { toValue: 1, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [activeLesson?.id, safeIndex, reduceMotion, sceneProgress, playing, scene?.durationMs]);

  useEffect(() => {
    diagramMotion.setValue(0);
    if (reduceMotion || !activeLesson || scene?.sceneType !== "diagram") return;
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(diagramMotion, { toValue: 1, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(diagramMotion, { toValue: 0, duration: 1700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [activeLesson?.id, safeIndex, reduceMotion, scene?.sceneType, diagramMotion]);

  useEffect(() => {
    if (!playing || !activeLesson || !scene) return;
    const timer = setTimeout(() => {
      if (safeIndex >= sceneCount - 1) {
        setPlaying(false);
        setCompleted(true);
      } else {
        setSceneIndex((current) => clampSceneIndex(current + 1, sceneCount));
      }
    }, Math.max(2500, scene.durationMs));
    return () => clearTimeout(timer);
  }, [playing, activeLesson?.id, safeIndex, scene?.durationMs, sceneCount]);

  useEffect(() => {
    if (!activeLesson) return;
    void setLocalValue(progressKey(userId, activeLesson.id), JSON.stringify({ sceneIndex: safeIndex, completed }));
  }, [activeLesson?.id, safeIndex, completed, userId]);

  const openLesson = async (lesson: PublishedLesson) => {
    setError("");
    setCompleted(false);
    let savedIndex = 0;
    try {
      const raw = await getLocalValue(progressKey(userId, lesson.id));
      if (raw) {
        const saved = JSON.parse(raw) as { sceneIndex?: unknown; completed?: unknown };
        if (typeof saved.sceneIndex === "number") savedIndex = clampSceneIndex(saved.sceneIndex, lesson.storyboard.scenes.length);
        setCompleted(saved.completed === true);
      }
    } catch { /* A bad local progress record should not block the lesson. */ }
    setActiveLesson(lesson);
    setSceneIndex(savedIndex);
    setPlaying(false);
  };

  const closeLesson = () => {
    setPlaying(false);
    setActiveLesson(null);
    setCompleted(false);
  };

  const listenToScene = async () => {
    if (!activeLesson || !scene || !authToken) {
      setVoiceError("Sign in again to play lesson narration.");
      return;
    }
    const key = `${activeLesson.id}:${safeIndex}`;
    setVoiceError("");
    if (voiceSceneKey === key && audioStatus.isLoaded) {
      if (audioStatus.playing) audioPlayer.pause();
      else {
        if (audioStatus.didJustFinish) audioPlayer.seekTo(0);
        audioPlayer.play();
      }
      return;
    }
    setVoiceLoading(true);
    try {
      const audioUrl = `${apiBaseUrl}/lessons/${encodeURIComponent(activeLesson.id)}/scenes/${safeIndex}/audio`;
      audioPlayer.replace({ uri: audioUrl, headers: { authorization: `Bearer ${authToken}` } });
      setVoiceSceneKey(key);
      audioPlayer.play();
    } catch (cause) {
      setVoiceError((cause as Error).message || "Could not play lesson narration.");
    } finally {
      setVoiceLoading(false);
    }
  };

  const nextScene = () => {
    if (safeIndex >= sceneCount - 1) {
      setPlaying(false);
      setCompleted(true);
      return;
    }
    setSceneIndex((current) => clampSceneIndex(current + 1, sceneCount));
  };
  const previousScene = () => {
    setCompleted(false);
    setSceneIndex((current) => clampSceneIndex(current - 1, sceneCount));
  };

  const sceneOpacity = sceneProgress.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] });
  const sceneTranslate = sceneProgress.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  const diagramTranslate = diagramMotion.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });

  if (activeLesson && scene) {
    return (
      <View style={[styles.player, { backgroundColor: palette.background, borderColor: palette.border }]}>
        <View style={styles.playerTop}>
          <TouchableOpacity onPress={closeLesson} accessibilityRole="button" accessibilityLabel="Back to lesson library" style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={22} color={palette.text} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: palette.primary }]}>{activeLesson.subject} · {activeLesson.topic}</Text>
            <Text style={[styles.playerTitle, { color: palette.text }]}>{activeLesson.title}</Text>
          </View>
        </View>
        <View style={[styles.progressTrack, { backgroundColor: palette.border }]}>
          <Animated.View style={[styles.progressFill, { width: progressWidth, backgroundColor: palette.primary }]} />
        </View>
        <Text style={[styles.progressLabel, { color: palette.muted }]}>Scene {safeIndex + 1} of {sceneCount} · {formatLessonTime(elapsed)} / {formatLessonTime(totalDuration)}</Text>
        <Animated.View style={[styles.sceneCard, { backgroundColor: palette.surface, borderColor: palette.border, opacity: sceneOpacity, transform: [{ translateY: sceneTranslate }] }]}>
          <Text style={[styles.sceneType, { color: palette.primary }]}>{scene.sceneType.replace(/_/g, " ").toUpperCase()}</Text>
          <Text style={[styles.sceneTitle, { color: palette.text }]}>{scene.title}</Text>
          {scene.onScreenText ? <Text style={[styles.screenText, { color: palette.text }]}>{scene.onScreenText}</Text> : null}
          {scene.sceneType === "diagram" ? (
            <View style={[styles.visualPanel, { backgroundColor: palette.primarySoft }]}>
              {scene.visual.label ? <Text style={[styles.visualLabel, { color: palette.text }]}>{scene.visual.label}</Text> : null}
              <View style={styles.diagramNodes}>
                {scene.visual.items.map((item, index) => (
                  <Animated.View key={`${item}-${index}`} style={[styles.diagramNode, { backgroundColor: palette.surface, borderColor: palette.primary, transform: [{ translateY: reduceMotion ? 0 : diagramTranslate }] }]}>
                    <Text style={[styles.diagramNodeText, { color: palette.text }]}>{item}</Text>
                  </Animated.View>
                ))}
              </View>
              {scene.visual.connections.map((connection, index) => <Text key={`${connection.from}-${connection.to}-${index}`} style={[styles.connectionText, { color: palette.primary }]}>{connection.from}  →  {connection.to}{connection.label ? ` · ${connection.label}` : ""}</Text>)}
            </View>
          ) : null}
          {scene.sceneType === "equation" && scene.visual.equation ? <View style={[styles.equationPanel, { backgroundColor: palette.primarySoft }]}><Text style={[styles.equationText, { color: palette.text }]}>{scene.visual.equation}</Text></View> : null}
          {scene.sceneType === "step_sequence" ? (
            <View style={[styles.visualPanel, { backgroundColor: palette.primarySoft }]}>
              {scene.visual.steps.map((step, index) => <Animated.View key={`${step}-${index}`} style={[styles.stepRow, { backgroundColor: palette.surface, opacity: reduceMotion ? 1 : sceneProgress.interpolate({ inputRange: [0, 1], outputRange: [0.45, 1] }) }]}><Text style={[styles.stepNumber, { color: palette.primary }]}>{index + 1}</Text><Text style={[styles.stepText, { color: palette.text }]}>{step}</Text></Animated.View>)}
            </View>
          ) : null}
          <Text style={[styles.narration, { color: palette.text }]}>{scene.narration}</Text>
          <TouchableOpacity onPress={() => void listenToScene()} disabled={voiceLoading} accessibilityRole="button" accessibilityLabel={audioStatus.playing && voiceSceneKey === `${activeLesson.id}:${safeIndex}` ? "Pause narration" : "Listen to scene narration"} style={[styles.voiceButton, { borderColor: palette.border, backgroundColor: palette.surface }]}>
            <MaterialCommunityIcons name={voiceLoading || audioStatus.isBuffering ? "loading" : audioStatus.playing && voiceSceneKey === `${activeLesson.id}:${safeIndex}` ? "pause-circle" : "volume-high"} size={22} color={palette.primary} />
            <Text style={[styles.voiceButtonText, { color: palette.text }]}>{voiceLoading || audioStatus.isBuffering ? "Generating voice…" : audioStatus.playing && voiceSceneKey === `${activeLesson.id}:${safeIndex}` ? "Pause narration" : voiceSceneKey === `${activeLesson.id}:${safeIndex}` && audioStatus.didJustFinish ? "Replay narration" : "Listen to narration"}</Text>
          </TouchableOpacity>
          {voiceError ? <Text style={[styles.voiceError, { color: palette.danger }]}>{voiceError}</Text> : null}
          {scene.sceneType === "checkpoint" ? <View style={[styles.checkpoint, { backgroundColor: palette.successSoft }]}><MaterialCommunityIcons name="check-circle" size={20} color={palette.success} /><Text style={[styles.checkpointText, { color: palette.text }]}>{completed ? "Lesson completed. You can replay or return to the library." : "Pause and recall the key idea before finishing."}</Text></View> : null}
        </Animated.View>
        <TouchableOpacity onPress={() => setShowNotes((value) => !value)} accessibilityRole="button" accessibilityState={{ expanded: showNotes }} style={[styles.notesToggle, { borderColor: palette.border }]}>
          <Text style={[styles.controlText, { color: palette.text }]}>{showNotes ? "Hide lesson notes" : "Read lesson notes"}</Text>
          <MaterialCommunityIcons name={showNotes ? "chevron-up" : "chevron-down"} size={20} color={palette.text} />
        </TouchableOpacity>
        {showNotes ? <View style={[styles.notesCard, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          {activeLesson.script.sections.map((section, index) => <View key={`${section.heading}-${index}`} style={styles.notesSection}>
            <Text style={[styles.notesHeading, { color: palette.text }]}>{section.heading}</Text>
            <Text style={[styles.notesBody, { color: palette.text }]}>{section.explanation}</Text>
            {section.example ? <Text style={[styles.notesExample, { color: palette.muted }]}>Example: {section.example}</Text> : null}
          </View>)}
          <Text style={[styles.notesHeading, { color: palette.text }]}>Key takeaways</Text>
          {activeLesson.script.keyTakeaways.map((item, index) => <Text key={`${item}-${index}`} style={[styles.notesBody, { color: palette.text }]}>• {item}</Text>)}
        </View> : null}
        <View style={styles.playerControls}>
          <TouchableOpacity onPress={previousScene} disabled={safeIndex === 0} accessibilityRole="button" accessibilityLabel="Previous scene" style={[styles.controlButton, { borderColor: palette.border, opacity: safeIndex === 0 ? 0.35 : 1 }]}><MaterialCommunityIcons name="chevron-left" size={25} color={palette.text} /><Text style={[styles.controlText, { color: palette.text }]}>Back</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => { if (completed && safeIndex === sceneCount - 1) { setCompleted(false); setSceneIndex(0); } setPlaying((value) => !value); }} accessibilityRole="button" accessibilityLabel={playing ? "Pause lesson" : "Play lesson"} style={[styles.playButton, { backgroundColor: palette.primary }]}><MaterialCommunityIcons name={playing ? "pause" : "play"} size={22} color={palette.onPrimary} /><Text style={[styles.playText, { color: palette.onPrimary }]}>{playing ? "Pause" : completed ? "Replay" : "Play"}</Text></TouchableOpacity>
          <TouchableOpacity onPress={nextScene} accessibilityRole="button" accessibilityLabel={safeIndex === sceneCount - 1 ? "Finish lesson" : "Next scene"} style={[styles.controlButton, { borderColor: palette.border }]}><Text style={[styles.controlText, { color: palette.text }]}>{safeIndex === sceneCount - 1 ? "Finish" : "Next"}</Text><MaterialCommunityIcons name="chevron-right" size={25} color={palette.text} /></TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.library, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <View style={styles.libraryHeader}>
        <View style={[styles.libraryIcon, { backgroundColor: palette.primarySoft }]}><MaterialCommunityIcons name="movie-open-play" size={23} color={palette.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.libraryTitle, { color: palette.text }]}>Animated lessons</Text>
          <Text style={[styles.librarySubtitle, { color: palette.muted }]}>Short visual explanations, scene by scene</Text>
        </View>
        <TouchableOpacity onPress={() => void refresh()} disabled={loading} accessibilityRole="button" accessibilityLabel="Refresh published lessons"><MaterialCommunityIcons name="refresh" size={21} color={palette.primary} /></TouchableOpacity>
      </View>
      {loading ? <ActivityIndicator color={palette.primary} style={{ marginVertical: 16 }} /> : error ? <Text style={[styles.emptyText, { color: palette.danger }]}>{error}</Text> : lessons.length === 0 ? <Text style={[styles.emptyText, { color: palette.muted }]}>No published animated lessons yet. New lessons appear here after an admin publishes them.</Text> : lessons.map((lesson) => <TouchableOpacity key={lesson.id} onPress={() => void openLesson(lesson)} accessibilityRole="button" style={[styles.lessonRow, { borderColor: palette.border }]}><View style={{ flex: 1 }}><Text style={[styles.lessonTitle, { color: palette.text }]}>{lesson.title}</Text><Text style={[styles.lessonMeta, { color: palette.muted }]}>{lesson.subject} · {lesson.topic} · {lesson.storyboard.scenes.length} scenes</Text></View><MaterialCommunityIcons name="play-circle" size={28} color={palette.primary} /></TouchableOpacity>)}
    </View>
  );
}

const styles = StyleSheet.create({
  library: { marginTop: spacing["4"], borderWidth: 1, borderRadius: radius.xl, padding: spacing["4"], gap: spacing["3"] },
  libraryHeader: { flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  libraryIcon: { width: 44, height: 44, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  libraryTitle: { fontSize: typeScale.size.lg, fontWeight: "800" },
  librarySubtitle: { fontSize: typeScale.size.sm, marginTop: 3 },
  emptyText: { fontSize: typeScale.size.sm, lineHeight: 20 },
  lessonRow: { flexDirection: "row", alignItems: "center", gap: spacing["3"], paddingVertical: spacing["3"], borderTopWidth: 1 },
  lessonTitle: { fontSize: typeScale.size.md, fontWeight: "800" },
  lessonMeta: { fontSize: typeScale.size.xs, marginTop: 4 },
  player: { marginTop: spacing["4"], borderWidth: 1, borderRadius: radius.xl, padding: spacing["4"], gap: spacing["3"] },
  playerTop: { flexDirection: "row", alignItems: "center", gap: spacing["3"] },
  backButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, fontWeight: "900", letterSpacing: 1, textTransform: "uppercase" },
  playerTitle: { fontSize: typeScale.size.lg, fontWeight: "900", marginTop: 3 },
  progressTrack: { height: 6, borderRadius: 8, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 8 },
  progressLabel: { fontSize: typeScale.size.xs },
  sceneCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing["4"], gap: spacing["3"], minHeight: 260 },
  sceneType: { fontSize: 10, fontWeight: "900", letterSpacing: 1.3 },
  sceneTitle: { fontSize: typeScale.size.xl, fontWeight: "900" },
  screenText: { fontSize: typeScale.size.lg, fontWeight: "800", textAlign: "center", paddingVertical: spacing["2"] },
  visualPanel: { borderRadius: radius.lg, padding: spacing["3"], gap: spacing["2"] },
  visualLabel: { fontSize: typeScale.size.sm, fontWeight: "800", textAlign: "center" },
  diagramNodes: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing["2"] },
  diagramNode: { borderWidth: 1.5, borderRadius: radius.md, paddingHorizontal: spacing["3"], paddingVertical: spacing["2"], maxWidth: "100%" },
  diagramNodeText: { fontSize: typeScale.size.sm, fontWeight: "800", textAlign: "center" },
  connectionText: { fontSize: typeScale.size.xs, fontWeight: "700", textAlign: "center" },
  equationPanel: { borderRadius: radius.lg, padding: spacing["4"], alignItems: "center" },
  equationText: { fontSize: typeScale.size.xl, fontWeight: "900", textAlign: "center" },
  stepRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing["2"], padding: spacing["3"], borderRadius: radius.md },
  stepNumber: { fontWeight: "900", fontSize: typeScale.size.md },
  stepText: { flex: 1, fontSize: typeScale.size.sm, lineHeight: 20, fontWeight: "600" },
  narration: { fontSize: typeScale.size.md, lineHeight: 24 },
  checkpoint: { flexDirection: "row", alignItems: "center", gap: spacing["2"], padding: spacing["3"], borderRadius: radius.md },
  checkpointText: { flex: 1, fontSize: typeScale.size.sm, fontWeight: "700", lineHeight: 19 },
  voiceButton: { minHeight: 44, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing["3"], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing["2"] },
  voiceButtonText: { fontSize: typeScale.size.sm, fontWeight: "800" },
  voiceError: { fontSize: typeScale.size.xs, lineHeight: 18 },
  notesToggle: { minHeight: 42, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing["3"], flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  notesCard: { borderWidth: 1, borderRadius: radius.lg, padding: spacing["3"], gap: spacing["3"] },
  notesSection: { gap: spacing["2"] },
  notesHeading: { fontSize: typeScale.size.md, fontWeight: "900" },
  notesBody: { fontSize: typeScale.size.sm, lineHeight: 21 },
  notesExample: { fontSize: typeScale.size.sm, lineHeight: 20, fontStyle: "italic" },
  playerControls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing["2"] },
  controlButton: { minHeight: 44, borderWidth: 1, borderRadius: radius.lg, paddingHorizontal: spacing["2"], flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 2 },
  controlText: { fontSize: typeScale.size.sm, fontWeight: "800" },
  playButton: { minHeight: 46, flex: 1, borderRadius: radius.lg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing["2"] },
  playText: { fontWeight: "900", fontSize: typeScale.size.md },
});
