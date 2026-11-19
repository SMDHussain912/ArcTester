import { useEffect, useState } from "react";

export interface IntegrityOverlayProps {
  visible: boolean;
  onReturnToFullscreen: () => void;
  violationCount: number;
  maxViolations: number;
  warn: boolean;
  flagged: boolean;
}

export default function IntegrityOverlay({
  visible,
  onReturnToFullscreen,
  violationCount,
  maxViolations,
  warn,
  flagged,
}: IntegrityOverlayProps) {
  const [returnRequested, setReturnRequested] = useState(false);

  useEffect(() => {
    if (!visible) setReturnRequested(false);
  }, [visible]);

  if (!visible) return null;

  return (
    <div className="integrity-overlay">
      <div className="integrity-card">
        <div className="integrity-header">
          <span className="integrity-status">{flagged ? "FLAGGED" : warn ? "WARNING" : "MONITORING"}</span>
          <span className="integrity-violations">{violationCount} / {maxViolations}</span>
        </div>
        <h2>Exam Integrity</h2>
        {flagged ? (
          <p className="integrity-message">Your session has been flagged for review. An invigilator has been notified.</p>
        ) : warn ? (
          <p className="integrity-message">Integrity warning: please return to fullscreen and avoid switching tabs.</p>
        ) : (
          <p className="integrity-message">Please return to fullscreen mode to continue your exam.</p>
        )}
        <p className="integrity-honest-notice">
          Web mode cannot block screenshots, screen recording, or second devices. This page only logs signals for
          human review; it cannot prove cheating.
        </p>
        <button
          className="integrity-button"
          disabled={returnRequested}
          onClick={() => {
            setReturnRequested(true);
            void onReturnToFullscreen();
          }}
        >
          {returnRequested ? "Requesting fullscreen…" : "Return to fullscreen"}
        </button>
      </div>
    </div>
  );
}
