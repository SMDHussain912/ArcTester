import React from "react";
import { StyleSheet, View } from "react-native";

interface ArcTesterMascotProps { size?: number; variant?: "mascot" | "mark"; }

export default function ArcTesterMascot({ size = 88, variant = "mascot" }: ArcTesterMascotProps) {
  const mark = variant === "mark";
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Aster, the ArcTester study owl" style={[styles.canvas, { width: size, height: size }]}>
      {mark ? (
        <View style={[styles.mark, { borderRadius: size * 0.25 }]}>
          <View style={[styles.markEyes, { top: size * 0.29 }]}>
            <View style={[styles.markEye, { width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11 }]} />
            <View style={[styles.markEye, { width: size * 0.22, height: size * 0.22, borderRadius: size * 0.11 }]} />
          </View>
          <View style={[styles.markBeak, { top: size * 0.54, borderLeftWidth: size * 0.08, borderRightWidth: size * 0.08, borderTopWidth: size * 0.12 }]} />
        </View>
      ) : (
        <>
          <View style={[styles.tuft, { left: size * 0.17, top: size * 0.03, borderLeftWidth: size * 0.12, borderRightWidth: size * 0.12, borderBottomWidth: size * 0.24 }]} />
          <View style={[styles.tuft, { right: size * 0.17, top: size * 0.03, borderLeftWidth: size * 0.12, borderRightWidth: size * 0.12, borderBottomWidth: size * 0.24 }]} />
          <View style={[styles.body, { width: size * 0.78, height: size * 0.78, borderRadius: size * 0.31, bottom: size * 0.03 }]}>
            <View style={[styles.eyes, { top: size * 0.23 }]}>
              <View style={[styles.eye, { width: size * 0.25, height: size * 0.25, borderRadius: size * 0.13 }]}><View style={[styles.pupil, { width: size * 0.11, height: size * 0.14, borderRadius: size * 0.07 }]} /></View>
              <View style={[styles.eye, { width: size * 0.25, height: size * 0.25, borderRadius: size * 0.13 }]}><View style={[styles.pupil, { width: size * 0.11, height: size * 0.14, borderRadius: size * 0.07 }]} /></View>
            </View>
            <View style={[styles.beak, { top: size * 0.43, borderLeftWidth: size * 0.07, borderRightWidth: size * 0.07, borderTopWidth: size * 0.12 }]} />
            <View style={[styles.belly, { width: size * 0.45, height: size * 0.32, bottom: size * 0.19, borderRadius: size * 0.22 }]} />
            <View style={[styles.book, { width: size * 0.48, height: size * 0.18, bottom: size * 0.02, borderRadius: size * 0.05 }]}>
              <View style={styles.bookPage} /><View style={styles.bookPage} />
            </View>
          </View>
          <View style={[styles.sparkle, { top: size * 0.14, right: size * 0.02, width: size * 0.1, height: size * 0.1, borderRadius: size * 0.05 }]} />
          <View style={[styles.sparkle, { top: size * 0.48, left: size * 0.02, width: size * 0.07, height: size * 0.07, borderRadius: size * 0.04 }]} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: { position: "relative", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  mark: { width: "100%", height: "100%", backgroundColor: "#3159D8", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  markEyes: { position: "absolute", width: "62%", flexDirection: "row", justifyContent: "space-between" },
  markEye: { backgroundColor: "#FFFFFF" },
  markBeak: { position: "absolute", alignSelf: "center", borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FBBF24" },
  tuft: { position: "absolute", borderLeftColor: "transparent", borderRightColor: "transparent", borderBottomColor: "#3159D8", zIndex: 1 },
  body: { position: "absolute", alignSelf: "center", backgroundColor: "#3159D8", borderWidth: 2, borderColor: "#2447B8", overflow: "visible" },
  eyes: { position: "absolute", alignSelf: "center", width: "74%", flexDirection: "row", justifyContent: "space-between", zIndex: 2 },
  eye: { backgroundColor: "#FFFDF6", alignItems: "center", justifyContent: "center" },
  pupil: { backgroundColor: "#172033" },
  beak: { position: "absolute", alignSelf: "center", borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#FBBF24", zIndex: 3 },
  belly: { position: "absolute", alignSelf: "center", backgroundColor: "#F8F5E9" },
  book: { position: "absolute", alignSelf: "center", flexDirection: "row", backgroundColor: "#DCE8FF", borderWidth: 2, borderColor: "#2447B8", zIndex: 4, overflow: "hidden" },
  bookPage: { flex: 1, borderRightWidth: 1, borderRightColor: "#93B2F8" },
  sparkle: { position: "absolute", backgroundColor: "#FBBF24" },
});
