/** Session restoration splash. It stays visible until the auth check finishes. */
export default function AppSplash({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="app-splash" role="status" aria-live="polite" aria-label="Restoring your session">
      <div className="app-splash-mark" aria-hidden="true">A</div>
      <strong>ArcTester</strong>
      <span>Restoring your workspace…</span>
      <div className="app-splash-track" aria-hidden="true"><i /></div>
    </div>
  );
}
