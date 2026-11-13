import { useEffect, useRef, useState } from "react";

export interface ExamWatermarkProps {
  studentName?: string | null;
  studentId?: string | null;
  enabled: boolean;
}

export default function ExamWatermark({ studentName, studentId, enabled }: ExamWatermarkProps) {
  const [position, setPosition] = useState({ x: 10, y: 10 });
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const label = studentName || studentId ? `${studentName ?? ""}${studentId ? ` (${studentId})` : ""}` : "ARCTESTER";

  useEffect(() => {
    if (!enabled) return;
    const move = () => {
      setPosition({
        x: 5 + Math.floor(Math.random() * 85),
        y: 5 + Math.floor(Math.random() * 85),
      });
    };
    move();
    timerRef.current = setInterval(move, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div
      className="exam-watermark"
      style={{
        position: "fixed",
        top: `${position.y}vh`,
        left: `${position.x}vw`,
        opacity: 0.08,
        pointerEvents: "none",
        zIndex: 9999,
        userSelect: "none",
        whiteSpace: "nowrap",
        fontSize: "clamp(1rem, 4vw, 2.5rem)",
        fontWeight: "900",
        letterSpacing: "0.5rem",
        transform: "rotate(-15deg)",
      }}
    >
      {label}
    </div>
  );
}
