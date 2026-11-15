import { useEffect, useState } from "react";

/** Cold-start splash shown only while the session is restored.
   Minimum 400 ms to avoid flicker, maximum 2 s. No looping animation. */
export default function AppSplash({ visible }: { visible: boolean }) {
  const [show, setShow] = useState(visible);

  useEffect(() => {
    if (!visible) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(false), 2000);
    return () => clearTimeout(t);
  }, [visible]);

  if (!show) return null;

  return (
    <div className="page-enter" style={{ position: "fixed", inset: 0, zIndex: 10000, display: "grid", placeItems: "center", background: "var(--accent)", color: "#fff" }}>
      <div className="student-home-mark" style={{ width: "112px", height: "112px", fontSize: "72px", boxShadow: "0 0 0 40px rgba(255,255,255,.12)", animation: "ar-orbit 1800ms linear infinite" }}>
        A
      </div>
    </div>
  );
}
