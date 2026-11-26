import { useEffect, useState } from "react";
type Props = { theme: "light" | "dark"; onThemeChange: (theme: "light" | "dark") => void };

export default function AdminSettings({ theme, onThemeChange, email, onSignOut }: Props) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [compactNavigation, setCompactNavigation] = useState(() => {
    try { return window.localStorage.getItem("arctester-admin-compact-nav") === "true"; } catch { return false; }
  });
  const [density, setDensity] = useState<"comfortable" | "compact">(() => {
    try { return window.localStorage.getItem("arctester-admin-density") === "compact" ? "compact" : "comfortable"; } catch { return "comfortable"; }
  });

  useEffect(() => {
    document.documentElement.dataset.adminCompactNav = String(compactNavigation);
    document.documentElement.dataset.adminDensity = density;
    return () => {
      delete document.documentElement.dataset.adminCompactNav;
      delete document.documentElement.dataset.adminDensity;
    };
  }, [compactNavigation, density]);

  function updateCompact(value: boolean) {
    setCompactNavigation(value);
    try { window.localStorage.setItem("arctester-admin-compact-nav", String(value)); } catch { /* Session preference still applies. */ }
  }
  function updateDensity(value: "comfortable" | "compact") {
    setDensity(value);
    try { window.localStorage.setItem("arctester-admin-density", value); } catch { /* Session preference still applies. */ }
  }

  return <section className="admin-settings">
    <div className="admin-page-title">
      <div><p className="eyebrow">WORKSPACE PREFERENCES</p><h1>Admin settings</h1><p>Personal display preferences for this administrator on this device.</p></div>
    </div>
    <div className="admin-settings-grid">
      <article className="admin-panel">
        <p className="eyebrow">APPEARANCE</p><h2>Theme</h2>
        <p className="muted">Choose a comfortable workspace appearance.</p>
        <div className="admin-settings-actions">
          <button type="button" className={theme === "light" ? "primary" : "ghost"} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>Light</button>
          <button type="button" className={theme === "dark" ? "primary" : "ghost"} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>Dark</button>
        </div>
      </article>
      <article className="admin-panel">
        <p className="eyebrow">NAVIGATION</p><h2>Compact sidebar</h2>
        <p className="muted">Use an icon rail on larger screens to leave more room for admin tools.</p>
        <label className="admin-setting-toggle"><span><b>Compact navigation</b><small>Keep labels available as tooltips.</small></span>
          <input type="checkbox" checked={compactNavigation} onChange={(event) => updateCompact(event.target.checked)} />
        </label>
      </article>
      <article className="admin-panel">
        <p className="eyebrow">CONTENT DENSITY</p><h2>Workspace spacing</h2>
        <p className="muted">Choose how much space appears between cards and rows.</p>
        <div className="admin-settings-actions">
          <button type="button" className={density === "comfortable" ? "primary" : "ghost"} aria-pressed={density === "comfortable"} onClick={() => updateDensity("comfortable")}>Comfortable</button>
          <button type="button" className={density === "compact" ? "primary" : "ghost"} aria-pressed={density === "compact"} onClick={() => updateDensity("compact")}>Compact</button>
        </div>
      </article>
      <article className="admin-panel">
        <p className="eyebrow">LOCAL DATA</p><h2>Workspace preferences</h2>
        <p className="muted">These preferences are stored only in this browser. This does not delete exams, students, or server data.</p>
        {!confirmClear ? <button type="button" className="ghost" onClick={() => setConfirmClear(true)}>Reset local preferences</button> :
          <div className="admin-settings-actions"><button type="button" className="danger-button" onClick={() => {
            try { ["arctester-admin-compact-nav", "arctester-admin-density"].forEach((key) => window.localStorage.removeItem(key)); } catch { /* Ignore unavailable storage. */ }
            setCompactNavigation(false); setDensity("comfortable"); setConfirmClear(false);
          }}>Confirm reset</button><button type="button" className="ghost" onClick={() => setConfirmClear(false)}>Cancel</button></div>}
      </article>
    </div>
    
  </section>;
}
