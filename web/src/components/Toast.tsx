import { useEffect, useRef, useState } from "react";
import { useMotionPreference } from "../hooks/useMotionPreference";

interface ToastProps {
  open: boolean;
  message: string;
  onClose: () => void;
  duration?: number;
}

/** Retry-safe toast: auto-dismisses, pops in, stacks. Never blocks input. */
export default function Toast({ open, message, onClose, duration = 3500 }: ToastProps) {
  const [mounted, setMounted] = useState(false);
  const rafRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reduced = useMotionPreference() !== "full";

  useEffect(() => {
    if (!open) return;
    setMounted(true);
    rafRef.current = setTimeout(() => onClose(), duration);
    return () => {
      if (rafRef.current) clearTimeout(rafRef.current);
    };
  }, [open, duration]);

  if (!open || !mounted) return null;

  return (
    <div
      className="toast"
      role="status"
      aria-live="polite"
      style={{
        opacity: reduced ? 1 : 0,
        transform: reduced ? undefined : "translateY(8px)",
        transition: reduced
          ? "none"
          : `opacity 220ms cubic-bezier(.65,0,.35,1), transform 220ms cubic-bezier(.65,0,.35,1)`,
      }}
    >
      {message}
      <button type="button" onClick={onClose} style={{ marginLeft: 8, padding: 4, background: "none", border: 0, color: "inherit", cursor: "pointer" }}>
        ✕
      </button>
    </div>
  );
}
