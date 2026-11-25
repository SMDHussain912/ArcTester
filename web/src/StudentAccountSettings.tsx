import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { request } from "./apiClient";

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
function SettingSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return <section className="panel account-setting-section"><div className="account-section-heading"><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{children}</section>;
}

type Device = { id: string; deviceName: string; platform: string; loginMethod: string; ipAddress: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean };
type LoginEvent = { id:string; email:string; result:string; method:string; ipAddress:string; userAgent:string; createdAt:string };
type Passkey = { id:string; name:string; createdAt:string; lastUsedAt:string|null; transports:string[] };
type SecurityStatus = { authenticatorEnabled:boolean; recoveryCodesRemaining:number; passkeyCount:number };
function fromBase64Url(value:string):Uint8Array{const base=value.replace(/-/g,"+").replace(/_/g,"/");const padded=base+"=".repeat((4-base.length%4)%4);return Uint8Array.from(atob(padded),c=>c.charCodeAt(0))}
function toBase64Url(value:ArrayBuffer):string{const bytes=new Uint8Array(value);let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/g,"")}
type Props = {
  page: "account" | "settings";
  email: string;
  userId: number;
  role: string;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  reduceMotion: boolean;
  onReduceMotionChange: (value: boolean) => void;
  showAnnouncementPopups: boolean;
  onShowAnnouncementPopupsChange: (value: boolean) => void;
  busy: boolean;
  onSignOut: () => void;
};

function SecurityStatus({ title, detail, status, action }: { title: string; detail: string; status: string; action?: string }) {
  return (
    <div className="security-feature-row">
      <div className="security-feature-icon" aria-hidden="true">◇</div>
      <div className="security-feature-copy"><strong>{title}</strong><p>{detail}</p></div>
      <div className="security-feature-state"><span className="security-status-pill">{status}</span>{action ? <button type="button" className="ghost" disabled>{action}</button> : null}</div>
    </div>
  );
}

export default function StudentAccountSettings(props: Props) {
  const { page, email, userId, role, theme, onThemeChange, reduceMotion, onReduceMotionChange,
    showAnnouncementPopups, onShowAnnouncementPopupsChange, busy, onSignOut } = props;
  const [isSettings, setIsSettings] = useState(page === "settings");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [devices, setDevices] = useState<Device[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [deviceError, setDeviceError] = useState("");
  const [revokingDevice, setRevokingDevice] = useState<string | null>(null);
  const [loginEvents,setLoginEvents]=useState<LoginEvent[]>([]);
  const [passkeys,setPasskeys]=useState<Passkey[]>([]);
  const [securityStatus,setSecurityStatus]=useState<SecurityStatus>({authenticatorEnabled:false,recoveryCodesRemaining:0,passkeyCount:0});
  const [securityBusy,setSecurityBusy]=useState(false);
  const [securityError,setSecurityError]=useState("");
  const [securityMessage,setSecurityMessage]=useState("");
  const [totpSecret,setTotpSecret]=useState("");
  const [totpUri,setTotpUri]=useState("");
  const [totpCode,setTotpCode]=useState("");
  const [recoveryCodes,setRecoveryCodes]=useState<string[]>([]);
  const [disablePassword,setDisablePassword]=useState("");
  const [disableCode,setDisableCode]=useState("");

  useEffect(() => {
    if (!isSettings) return;
    let cancelled = false;
    setDevicesLoading(true);
    setDeviceError("");
    Promise.all([
      request<{ sessions: Device[] }>("/auth/sessions"),
      request<{ events: LoginEvent[] }>("/auth/login-history"),
      request<{ passkeys: Passkey[] }>("/auth/passkeys"),
      request<SecurityStatus>("/auth/2fa/status"),
    ]).then(([sessionResult,historyResult,passkeyResult,statusResult]) => {
      if(cancelled)return;
      setDevices(sessionResult.sessions??[]);setLoginEvents(historyResult.events??[]);setPasskeys(passkeyResult.passkeys??[]);
      setSecurityStatus({authenticatorEnabled:statusResult.authenticatorEnabled,recoveryCodesRemaining:statusResult.recoveryCodesRemaining,passkeyCount:statusResult.passkeyCount});
    }).catch((error:unknown)=>{if(!cancelled)setDeviceError(error instanceof Error?error.message:"Could not load account security.");})
      .finally(()=>{if(!cancelled)setDevicesLoading(false);});
    return () => { cancelled = true; };
  }, [isSettings]);

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordMessage("");
    if (newPassword !== confirmPassword) {
      setPasswordError("The new password and confirmation do not match.");
      return;
    }
    if (newPassword.length < 12) {
      setPasswordError("Use at least 12 characters for your new password.");
      return;
    }
    setPasswordBusy(true);
    try {
      const result = await request<{ message?: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setPasswordMessage(result.message ?? "Password changed successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Password change failed.");
    } finally {
      setPasswordBusy(false);
    }
  }

  async function revokeDevice(deviceId: string) {
    setDeviceError("");
    setRevokingDevice(deviceId);
    try {
      await request("/auth/sessions/" + encodeURIComponent(deviceId), { method: "DELETE" });
      setDevices((current) => current.filter((device) => device.id !== deviceId));
    } catch (error) {
      setDeviceError(error instanceof Error ? error.message : "Could not revoke this device.");
    } finally {
      setRevokingDevice(null);
    }
  }


  async function reloadSecurity() {
    const [sessionResult,historyResult,passkeyResult,statusResult]=await Promise.all([
      request<{sessions:Device[]}>("/auth/sessions"),request<{events:LoginEvent[]}>("/auth/login-history"),
      request<{passkeys:Passkey[]}>("/auth/passkeys"),request<SecurityStatus>("/auth/2fa/status"),
    ]);
    setDevices(sessionResult.sessions??[]);setLoginEvents(historyResult.events??[]);setPasskeys(passkeyResult.passkeys??[]);
    setSecurityStatus({authenticatorEnabled:statusResult.authenticatorEnabled,recoveryCodesRemaining:statusResult.recoveryCodesRemaining,passkeyCount:statusResult.passkeyCount});
  }
  async function beginTotpSetup(){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");setRecoveryCodes([]);
    try{const result=await request<{secret:string;otpauthUri:string}>("/auth/2fa/totp/setup",{method:"POST",body:"{}"});setTotpSecret(result.secret);setTotpUri(result.otpauthUri);setTotpCode("");}
    catch(error){setSecurityError(error instanceof Error?error.message:"Could not start authenticator setup.");}finally{setSecurityBusy(false);}
  }
  async function verifyTotpSetup(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{const result=await request<{recoveryCodes:string[];message:string}>("/auth/2fa/totp/verify-setup",{method:"POST",body:JSON.stringify({code:totpCode})});setRecoveryCodes(result.recoveryCodes);setTotpSecret("");setTotpUri("");setTotpCode("");setSecurityMessage(result.message);await reloadSecurity();}
    catch(error){setSecurityError(error instanceof Error?error.message:"Could not verify authenticator code.");}finally{setSecurityBusy(false);}
  }
  async function disableTotp(event:FormEvent<HTMLFormElement>){
    event.preventDefault();setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{const result=await request<{message:string}>("/auth/2fa/totp/disable",{method:"POST",body:JSON.stringify({password:disablePassword,code:disableCode})});setSecurityMessage(result.message);setDisablePassword("");setDisableCode("");await reloadSecurity();}
    catch(error){setSecurityError(error instanceof Error?error.message:"Could not disable authenticator.");}finally{setSecurityBusy(false);}
  }
  async function addPasskey(){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{
      if(!navigator.credentials)throw new Error("Passkeys are not supported by this browser.");
      const options=await request<{publicKey:{challenge:string;rp:{name:string;id:string};user:{id:string;name:string;displayName:string};pubKeyCredParams:PublicKeyCredentialParameters[];timeout:number;attestation:AttestationConveyancePreference;authenticatorSelection:AuthenticatorSelectionCriteria;excludeCredentials:{type:"public-key";id:string}[]}}>("/auth/passkeys/register/options",{method:"POST",body:"{}"});
      const publicKey:PublicKeyCredentialCreationOptions={...options.publicKey,challenge:fromBase64Url(options.publicKey.challenge),user:{...options.publicKey.user,id:fromBase64Url(options.publicKey.user.id)},excludeCredentials:options.publicKey.excludeCredentials.map(item=>({...item,id:fromBase64Url(item.id)}))};
      const credential=await navigator.credentials.create({publicKey}) as PublicKeyCredential|null;if(!credential)throw new Error("Passkey creation was cancelled.");
      const response=credential.response as AuthenticatorAttestationResponse;
      await request("/auth/passkeys/register/verify",{method:"POST",body:JSON.stringify({challenge:options.publicKey.challenge,credentialId:credential.id,clientDataJSON:toBase64Url(response.clientDataJSON),attestationObject:toBase64Url(response.attestationObject),name:"This device",transports:response.getTransports?.()??[]})});
      setSecurityMessage("Passkey added to your account.");await reloadSecurity();
    }catch(error){setSecurityError(error instanceof Error?error.message:"Could not add passkey.");}finally{setSecurityBusy(false);}
  }
  async function removePasskey(id:string){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{await request("/auth/passkeys/"+encodeURIComponent(id),{method:"DELETE"});setSecurityMessage("Passkey removed.");await reloadSecurity();}
    catch(error){setSecurityError(error instanceof Error?error.message:"Could not remove passkey.");}finally{setSecurityBusy(false);}
  }
  async function revokeAllSessions(){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{await request("/auth/sessions/revoke-all",{method:"POST",body:"{}"});setSecurityMessage("All sessions revoked. You will need to sign in again.");setDevices([]);}
    catch(error){setSecurityError(error instanceof Error?error.message:"Could not revoke sessions.");}finally{setSecurityBusy(false);}
  }

  if (page === "account" && !isSettings) {
    return (
      <section className="account-settings-page">
        <header className="page-heading">
          <div><p className="eyebrow">YOUR ACCOUNT</p><h1>Account</h1><p className="muted">Manage your ArcTester profile and account security.</p></div>
          <button type="button" className="ghost" onClick={() => setIsSettings(true)}>Settings</button>
        </header>
        <SettingSection title="Profile" description="Your account identity and access.">
          <div className="account-profile-summary"><span className="account-profile-avatar">SH</span><div><strong>Shaik Mahammad Hussain</strong><p>{email}</p></div></div>
          <div className="account-detail-row"><span>Account ID</span><strong>{userId}</strong></div>
          <div className="account-detail-row"><span>Account type</span><strong>{role === "ADMIN" ? "Administrator" : "Student"}</strong></div>
        </SettingSection>
        <SettingSection title="Security overview" description="Protect your account and review access.">
          <div className="account-security-summary"><span className="security-summary-dot" /><div><strong>Password and sessions</strong><p>Change your password in Settings. Changing it revokes previously issued sessions.</p></div></div>
          <div className="account-security-summary"><span className="security-summary-dot muted-dot" /><div><strong>Authenticator and passkeys</strong><p>These sign-in methods are not enabled on the server yet. Setup controls will appear when login enforcement is ready.</p></div></div>
          <button className="ghost account-signout" disabled={busy} onClick={onSignOut}>{busy ? "Signing out…" : "Sign out"}</button>
        </SettingSection>
      </section>
    );
  }

  return (
    <section className="account-settings-page">
      <header className="page-heading">
        <div><p className="eyebrow">ACCOUNT CONTROL CENTER</p><h1>Settings</h1><p className="muted">Security, privacy, notifications and accessibility preferences.</p></div>
        <button type="button" className="ghost" onClick={() => setIsSettings(false)}>← Back to account</button>
      </header>

      <SettingSection title="Sign-in security" description="Change credentials and review the protections available on your account.">
        <div className="security-settings-grid">
          <div className="security-settings-card">
            <div className="security-card-heading"><span className="security-card-icon">⌑</span><div><strong>Change password</strong><small>Use a unique password with 12 or more characters.</small></div></div>
            <form className="security-password-form" onSubmit={(event) => void changePassword(event)}>
              <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required maxLength={128} /></label>
              <label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required minLength={12} maxLength={128} /></label>
              <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required minLength={12} maxLength={128} /></label>
              {passwordError ? <p className="security-form-message error" role="alert">{passwordError}</p> : null}
              {passwordMessage ? <p className="security-form-message success" role="status">{passwordMessage}</p> : null}
              <button className="button button-primary" type="submit" disabled={passwordBusy || !currentPassword || !newPassword || !confirmPassword}>{passwordBusy ? "Updating password…" : "Update password"}</button>
            </form>
          </div>
          <div className="security-settings-card security-methods-card">
            <div className="security-card-heading"><span className="security-card-icon">✧</span><div><strong>Additional sign-in methods</strong><small>Enrollment will be available once server-side verification is enabled.</small></div></div>
            <SecurityStatus title="Two-step verification" detail="Login currently does not require a second factor." status="Not enabled" action="Setup unavailable" />
            <SecurityStatus title="Authenticator app" detail="TOTP enrollment, recovery codes and login challenge are not configured." status="Not configured" action="Setup unavailable" />
            <SecurityStatus title="Passkeys" detail="WebAuthn registration and assertion verification are not configured." status="Not configured" action="Setup unavailable" />
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Devices and sessions" description="Review remembered devices. Revoking a device removes its registered access record.">
        {devicesLoading ? <p className="muted">Loading registered devices…</p> : null}
        {deviceError ? <p className="security-form-message error" role="alert">{deviceError}</p> : null}
        {!devicesLoading && devices.length === 0 && !deviceError ? <div className="account-empty-device"><strong>No registered devices</strong><p>Devices will appear here after they are registered by a supported client.</p></div> : null}
        {devices.map((device) => (
          <div className="account-device-row" key={device.id}>
            <span className="account-device-icon" aria-hidden="true">▣</span>
            <div><strong>{device.deviceName}</strong><small>{device.platform.toUpperCase()} · Last active {new Date(device.lastSeenAt).toLocaleString()}</small></div>
            <button className="ghost" type="button" disabled={revokingDevice === device.id} onClick={() => void revokeDevice(device.id)}>{revokingDevice === device.id ? "Revoking…" : "Revoke"}</button>
          </div>
        ))}
        <p className="muted account-settings-note">Changing your password also invalidates all previously issued sessions. Sign out to revoke the current session.</p>
      </SettingSection>

      <SettingSection title="Appearance" description="Personalize the workspace on this device.">
        <div className="account-theme-picker"><div><strong>Theme</strong><small>Choose your preferred display.</small></div><div className="account-theme-options">
          <button type="button" className={theme === "light" ? "selected" : ""} aria-pressed={theme === "light"} onClick={() => onThemeChange("light")}>☼ Light</button>
          <button type="button" className={theme === "dark" ? "selected" : ""} aria-pressed={theme === "dark"} onClick={() => onThemeChange("dark")}>☾ Dark</button>
        </div></div>
      </SettingSection>

      <SettingSection title="Notifications" description="Control how updates appear in the student workspace.">
        <ToggleRow title="Announcement pop-ups" description="Show new administrator announcements once, until you acknowledge them." checked={showAnnouncementPopups} onChange={onShowAnnouncementPopupsChange} />
        <div className="account-setting-row account-setting-static"><span><strong>Notification inbox</strong><small>Read, revisit and manage notifications from the dashboard bell.</small></span><span className="account-setting-badge">In-app</span></div>
      </SettingSection>

      <SettingSection title="Accessibility" description="Make the interface easier to use.">
        <ToggleRow title="Reduce motion" description="Reduce animated transitions and movement." checked={reduceMotion} onChange={onReduceMotionChange} />
      </SettingSection>

      <SettingSection title="Privacy and account" description="Review the information associated with your sign-in.">
        <div className="account-detail-row"><span>Full name</span><strong>Shaik Mahammad Hussain</strong></div>
        <div className="account-detail-row"><span>Email address</span><strong>{email}</strong></div>
        <div className="account-detail-row"><span>Account ID</span><strong>{userId}</strong></div>
        <div className="account-detail-row"><span>Preferences storage</span><strong>This browser</strong></div>
        <p className="muted account-settings-note">Appearance and accessibility preferences are stored locally. Security actions are verified by the server.</p>
      </SettingSection>

      <SettingSection title="Account actions">
        <div className="account-danger-zone"><div><strong>Sign out</strong><p>End this session on the current device.</p></div><button className="ghost" disabled={busy} onClick={onSignOut}>{busy ? "Signing out…" : "Sign out"}</button></div>
      </SettingSection>
    </section>
  );
}
