import type { ReactNode } from "react";

type ToggleRowProps = {
  title: string;
  description: string;
  checked: boolean;
  onChange: (value: boolean) => void;
};
function ToggleRow({ title, description, checked, onChange }: ToggleRowProps) {
  return (
    <label className="account-setting-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
function SettingSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="panel account-setting-section"><h2>{title}</h2>{children}</section>;
}

type Props = {
  page: "account" | "settings";
  email: string;
  userId: number;
  role: string;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  reduceMotion: boolean;
  onReduceMotionChange: (value: boolean) => void;
  showNotificationBanners: boolean;
  onShowNotificationBannersChange: (value: boolean) => void;
  showAnnouncementPopups: boolean;
  onShowAnnouncementPopupsChange: (value: boolean) => void;
  busy: boolean;
  onSignOut: () => void;
};

export default function StudentAccountSettings(props: Props) {
  const { page, email, userId, role, theme, onThemeChange, reduceMotion, onReduceMotionChange,
    showNotificationBanners, onShowNotificationBannersChange, showAnnouncementPopups,
    onShowAnnouncementPopupsChange, busy, onSignOut } = props;
  if (page === "account") {
    return (
      <section className="account-settings-page">
        <header className="page-heading">
          <div><p className="eyebrow">YOUR ACCOUNT</p><h1>Account</h1><p className="muted">Manage your ArcTester account and sign-in details.</p></div>
        </header>
        <SettingSection title="Profile">
          <div className="account-profile-summary"><span className="account-profile-avatar" aria-hidden="true">{email.slice(0, 1).toUpperCase()}</span><div><strong>Student account</strong><p>{email}</p></div></div>
          <div className="account-detail-row"><span>Account ID</span><strong>{userId}</strong></div>
          <div className="account-detail-row"><span>Account type</span><strong>{role === "ADMIN" ? "Administrator" : "Student"}</strong></div>
        </SettingSection>
        <SettingSection title="Security">
          <div className="account-security-note"><strong>Keep your account secure</strong><p>Use a unique password and sign out when using a shared device. Password changes and active-session management are not available in this release.</p></div>
          <button className="ghost account-signout" disabled={busy} onClick={onSignOut}>{busy ? "Signing out…" : "Sign out"}</button>
        </SettingSection>
      </section>
    );
  }
  return (
    <section className="account-settings-page">
      <header className="page-heading">
        <div><p className="eyebrow">PREFERENCES</p><h1>Settings</h1><p className="muted">Make ArcTester comfortable and accessible on your device.</p></div>
      </header>
      <SettingSection title="Appearance">
        <div className="account-theme-picker"><div><strong>Theme</strong><small>Choose how ArcTester looks.</small></div><div className="account-theme-options">
          <button type="button" className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>☼ Light</button>
          <button type="button" className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>☾ Dark</button>
        </div></div>
      </SettingSection>
      <SettingSection title="Notifications">
        <ToggleRow title="Notification banners" description="Show unread account and learning messages in the app." checked={showNotificationBanners} onChange={onShowNotificationBannersChange} />
        <ToggleRow title="Announcement pop-ups" description="Show new announcements when you open ArcTester." checked={showAnnouncementPopups} onChange={onShowAnnouncementPopupsChange} />
      </SettingSection>
      <SettingSection title="Accessibility">
        <ToggleRow title="Reduce motion" description="Reduce animated transitions and movement." checked={reduceMotion} onChange={onReduceMotionChange} />
      </SettingSection>
      <SettingSection title="Account preferences">
        <div className="account-detail-row"><span>Signed in as</span><strong>{email}</strong></div>
        <div className="account-detail-row"><span>Local preferences</span><strong>Saved in this browser</strong></div>
        <p className="muted account-settings-note">These preferences are stored on this device. Notification delivery and password/session management require server support and are not exposed as controls yet.</p>
      </SettingSection>
    </section>
  );
}
