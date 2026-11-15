import { useEffect, useRef, useState } from "react";
import { useMotionPreference } from "../hooks/useMotionPreference";

/** Simple determinate progress ring shown as a percentage. Animates the stroke
   dash on mount; respects reduced motion. */
interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  className?: string;
  label?: string;
}

export default function ProgressRing({ value, size = 100, className, label }: ProgressRingProps) {
  const [animated, setAnimated] = useState(0);
  const reduced = useMotionPreference() !== "full";
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (reduced) {
      setAnimated(value);
      return;
    }
    const start = performance.now();
    const duration = 700;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setAnimated(Math.round((value - 0) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, reduced]);

  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (animated / 100) * circumference;

  return (
    <div className={`progress-ring-wrap ${className ?? ""}`} style={{ width: size, height: size }} aria-label={label ?? `${animated}%`}>
      <svg width={size} height={size} viewBox="0 0 100 100">
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke="var(--border)"
          strokeWidth="8"
        />
        <circle
          cx="50"
          cy="50"
          r="36"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="8"
          strokeLinecap="round"
          style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%", strokeDasharray: circumference, strokeDashoffset: offset, transition: reduced ? "none" : "stroke-dashoffset 700ms ease-out" }}
        />
      </svg>
      <div className="progress-label" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: Math.round(size * 0.28), fontWeight: 800 }}>
        {animated}%
      </div>
    </div>
  );
}
