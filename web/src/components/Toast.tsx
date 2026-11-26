import { useEffect, useRef, useState } from "react";
import { useMotionPreference } from "../hooks/useMotionPreference";

interface ToastProps {
  open: boolean;
  message: string;
  onClose: () => void;
  duration?: number;
  tone?: "error" | "success" | "info";
}

/** Non-blocking, dismissible toast for transient app feedback. */
export default function Toast({ open, message, onClose, duration = 5000, tone = "info" }: ToastProps) {
  const [mounted, setMounted] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCloseRef = useRef(onClose);
  const reduced = useMotionPreference() !== "full";
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    timerRef.current = setTimeout(() => onCloseRef.current(), duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [open, duration, message]);

  if (!open || !mounted) return null;

  const isError = tone === "error";
  return (
    <div
      className={`toast toast-${tone}`}
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      style={reduced ? { animation: "none" } : undefined}
    >
      <span>{message}</span>
      <button type="button" aria-label="Dismiss message" onClick={() => onCloseRef.current()} className="toast-close">
        ×
      </button>
    </div>
  );
}
