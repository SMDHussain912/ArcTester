/** Session restoration splash. It stays visible until the auth check finishes. */
import ArcTesterMascot from "./ArcTesterMascot";

export default function AppSplash({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="app-splash" role="status" aria-live="polite" aria-label="Restoring your session">
      <ArcTesterMascot variant="mark" size={68} decorative className="app-splash-mark-image" />
      <strong>ArcTester</strong>
      <span>Restoring your workspace…</span>
      <div className="app-splash-track" aria-hidden="true"><i /></div>
    </div>
  );
}
