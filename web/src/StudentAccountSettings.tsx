import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
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
function toWebAuthnBufferSource(value:Uint8Array):ArrayBuffer{const buffer=new ArrayBuffer(value.byteLength);new Uint8Array(buffer).set(value);return buffer}
function toBase64Url(value:ArrayBuffer):string{const bytes=new Uint8Array(value);let binary="";bytes.forEach(b=>binary+=String.fromCharCode(b));return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
type Props = {
  page: "account" | "settings";
  email: string;
  userId: number;
  role: string;
  fullName?: string | null;
  registrationNumber?: string | null;
  collegeName?: string | null;
  collegeCode?: string | null;
  postalPin?: string | null;
  branchName?: string | null;
  branchCode?: string | null;
  theme: "light" | "dark";
  onThemeChange: (theme: "light" | "dark") => void;
  reduceMotion: boolean;
  onReduceMotionChange: (value: boolean) => void;
  showAnnouncementPopups: boolean;
  onShowAnnouncementPopupsChange: (value: boolean) => void;
  busy: boolean;
  onSignOut: () => void;
  onProfileChanged: () => void;
};

export default function StudentAccountSettings(props: Props) {
  const { page, email, userId, role, fullName, registrationNumber, collegeName, collegeCode, postalPin, branchName, branchCode,
    theme, onThemeChange, reduceMotion, onReduceMotionChange,
    showAnnouncementPopups, onShowAnnouncementPopupsChange, busy, onSignOut, onProfileChanged } = props;
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
  const [profileDraft, setProfileDraft] = useState({
    fullName: fullName ?? "",
    registrationNumber: registrationNumber ?? "",
    collegeName: collegeName ?? "",
    collegeCode: collegeCode ?? "",
    postalPin: postalPin ?? "",
    branchName: branchName ?? "",
    branchCode: branchCode ?? "",
  });
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileConfirming, setProfileConfirming] = useState(false);
  const [securityReauthAction, setSecurityReauthAction] = useState<"totp" | "passkey" | "removePasskey" | null>(null);
  const [securityReauthPassword, setSecurityReauthPassword] = useState("");
  const [securityReauthCode, setSecurityReauthCode] = useState("");
  const [securityReauthPasskeyId, setSecurityReauthPasskeyId] = useState<string | null>(null);

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

  async function saveAcademicProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProfileError("");
    if (profileDraft.fullName.trim().length < 2 || profileDraft.collegeName.trim().length < 2 ||
      !profileDraft.collegeCode.trim() || profileDraft.branchName.trim().length < 2 ||
      (profileDraft.postalPin && !/^\d{6}$/.test(profileDraft.postalPin.trim())) ||
      (profileDraft.registrationNumber && !/^\d{5}-[A-Z]{1,3}-\d{3}$/i.test(profileDraft.registrationNumber.trim()))) {
      setProfileError("Check your name, diploma registration number, college and branch details.");
      return;
    }
    setProfileBusy(true);
    try {
      const result = await request<{ changed: boolean; requiresReauthentication?: boolean }>("/auth/profile", {
        method: "PATCH",
        body: JSON.stringify({
          ...profileDraft,
          fullName: profileDraft.fullName.trim(),
          registrationNumber: profileDraft.registrationNumber.trim(),
        }),
      });
      if (result.changed && result.requiresReauthentication) setProfileConfirming(true);
      else setProfileError("No profile changes were made.");
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : "Could not update your academic profile.");
    } finally {
      setProfileBusy(false);
    }
  }

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
      const wasCurrent=devices.find(device=>device.id===deviceId)?.current;setDevices((current) => current.filter((device) => device.id !== deviceId));if(wasCurrent)onSignOut();
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
  function beginTotpSetup(){setSecurityReauthAction("totp");setSecurityReauthPassword("");setSecurityReauthCode("");setSecurityError("");} 
  async function beginTotpSetupAfterReauth(){
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
  function addPasskey(){setSecurityReauthAction("passkey");setSecurityReauthPassword("");setSecurityReauthCode("");setSecurityError("");} 
  async function addPasskeyAfterReauth(){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{
      if(!navigator.credentials)throw new Error("Passkeys are not supported by this browser.");
      const options=await request<{publicKey:{challenge:string;rp:{name:string;id:string};user:{id:string;name:string;displayName:string};pubKeyCredParams:PublicKeyCredentialParameters[];timeout:number;attestation:AttestationConveyancePreference;authenticatorSelection:AuthenticatorSelectionCriteria;excludeCredentials:{type:"public-key";id:string}[]}}>("/auth/passkeys/register/options",{method:"POST",body:"{}"});
      const publicKey:PublicKeyCredentialCreationOptions={...options.publicKey,challenge:toWebAuthnBufferSource(fromBase64Url(options.publicKey.challenge)),user:{...options.publicKey.user,id:toWebAuthnBufferSource(fromBase64Url(options.publicKey.user.id))},excludeCredentials:options.publicKey.excludeCredentials.map(item=>({...item,id:toWebAuthnBufferSource(fromBase64Url(item.id))}))};
      const credential=await navigator.credentials.create({publicKey}) as PublicKeyCredential|null;if(!credential)throw new Error("Passkey creation was cancelled.");
      const response=credential.response as AuthenticatorAttestationResponse;
      await request("/auth/passkeys/register/verify",{method:"POST",body:JSON.stringify({challenge:options.publicKey.challenge,credentialId:credential.id,clientDataJSON:toBase64Url(response.clientDataJSON),attestationObject:toBase64Url(response.attestationObject),name:"This device",transports:response.getTransports?.()??[]})});
      setSecurityMessage("Passkey added to your account.");await reloadSecurity();
    }catch(error){setSecurityError(error instanceof Error?error.message:"Could not add passkey.");}finally{setSecurityBusy(false);}
  }
  async function submitSecurityReauthentication(event:FormEvent<HTMLFormElement>){
    event.preventDefault();if(!securityReauthAction)return;setSecurityBusy(true);setSecurityError("");
    try{
      await request("/auth/reauthenticate",{method:"POST",body:JSON.stringify({password:securityReauthPassword,code:securityReauthCode.trim()||undefined})});
      const action=securityReauthAction;setSecurityReauthAction(null);setSecurityReauthPassword("");setSecurityReauthCode("");
      if(action==="totp")await beginTotpSetupAfterReauth();else if(action==="passkey")await addPasskeyAfterReauth();else if(securityReauthPasskeyId)await removePasskeyAfterReauth(securityReauthPasskeyId);
    }catch(error){setSecurityError(error instanceof Error?error.message:"Could not confirm your identity. Please try again.");}
    finally{setSecurityBusy(false);}
  }

  function removePasskey(id:string){setSecurityReauthAction("removePasskey");setSecurityReauthPasskeyId(id);setSecurityReauthPassword("");setSecurityReauthCode("");setSecurityError("");}
  async function removePasskeyAfterReauth(id:string){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{await request("/auth/passkeys/"+encodeURIComponent(id),{method:"DELETE"});setSecurityMessage("Passkey removed.");await reloadSecurity();}
    catch(error){setSecurityError(error instanceof Error?error.message:"Could not remove passkey.");}finally{setSecurityBusy(false);}
  }
  async function revokeAllSessions(){
    setSecurityBusy(true);setSecurityError("");setSecurityMessage("");
    try{await request("/auth/sessions/revoke-all",{method:"POST",body:"{}"});setSecurityMessage("All sessions revoked. Signing out this device too.");setDevices([]);onSignOut();}
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
          <div className="account-profile-summary"><span className="account-profile-avatar">SH</span><div><strong>{fullName || "Student"}</strong><p>{email}</p></div></div>
          <div className="account-detail-row"><span>Diploma registration</span><strong>{registrationNumber || "Not set"}</strong></div>
          <div className="account-detail-row"><span>College / Polytechnic</span><strong>{collegeName || "Not set"} · {collegeCode || "No code"}</strong></div>
          <div className="account-detail-row"><span>Diploma branch</span><strong>{branchName || "Not set"}{branchCode ? " · " + branchCode : ""}</strong></div>
          <button type="button" className="button button-primary" onClick={() => setIsSettings(true)}>Edit academic profile</button>
          <div className="account-detail-row"><span>Account ID</span><strong>{userId}</strong></div>
          <div className="account-detail-row"><span>Account type</span><strong>{role === "ADMIN" ? "Administrator" : "Student"}</strong></div>
        </SettingSection>
        <SettingSection title="Security overview" description="Protect your account and review access.">
          <div className="account-security-summary"><span className="security-summary-dot" /><div><strong>Password and sessions</strong><p>Change your password in Settings. Changing it revokes previously issued sessions.</p></div></div>
          <div className="account-security-summary"><span className="security-summary-dot muted-dot" /><div><strong>Authenticator and passkeys</strong><p>Manage authenticator setup, passkeys, active sessions and previous sign-ins in Settings.</p></div></div>
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

      <SettingSection title="Academic profile" description="Keep your diploma identity accurate. Saving a change signs out every device so you must sign in again.">
        <form className="security-password-form" onSubmit={(event) => void saveAcademicProfile(event)}>
          <label>Full name<input value={profileDraft.fullName} onChange={(event) => setProfileDraft((current) => ({ ...current, fullName: event.target.value }))} autoComplete="name" required maxLength={100} /></label>
          <label>Diploma registration number<input value={profileDraft.registrationNumber} onChange={(event) => setProfileDraft((current) => ({ ...current, registrationNumber: event.target.value.toUpperCase() }))} placeholder="24010-CM-053" maxLength={16} /></label>
          <label>College / Polytechnic<input value={profileDraft.collegeName} onChange={(event) => setProfileDraft((current) => ({ ...current, collegeName: event.target.value }))} required maxLength={180} /></label>
          <label>College PIN / institute code<input value={profileDraft.collegeCode} onChange={(event) => setProfileDraft((current) => ({ ...current, collegeCode: event.target.value.toUpperCase() }))} required maxLength={16} /></label>
          <label>Postal PIN (optional)<input inputMode="numeric" value={profileDraft.postalPin} onChange={(event) => setProfileDraft((current) => ({ ...current, postalPin: event.target.value.replace(/[^0-9]/g, "").slice(0, 6) }))} maxLength={6} /></label>
          <label>Diploma branch<input value={profileDraft.branchName} onChange={(event) => setProfileDraft((current) => ({ ...current, branchName: event.target.value }))} required maxLength={120} /></label>
          <label>Branch code<input value={profileDraft.branchCode} onChange={(event) => setProfileDraft((current) => ({ ...current, branchCode: event.target.value.toUpperCase() }))} maxLength={24} /></label>
          {profileError ? <p className="security-form-message error" role="alert">{profileError}</p> : null}
          <button className="button button-primary" type="submit" disabled={profileBusy || busy}>{profileBusy ? "Saving profile…" : "Save academic profile"}</button>
        </form>
      </SettingSection>

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
            <div className="security-card-heading"><span className="security-card-icon">✧</span><div><strong>Two-factor authentication</strong><small>Use an authenticator app and a passkey to protect sign-in.</small></div></div>
            <div className="security-feature-row"><div className="security-feature-copy"><strong>Authenticator app (TOTP)</strong><p>{securityStatus.authenticatorEnabled?"Authenticator is enabled. Login requires a current code.":"Add an authenticator such as Google Authenticator, Microsoft Authenticator, or 1Password."}</p></div><span className="security-status-pill">{securityStatus.authenticatorEnabled?"Enabled":"Not enabled"}</span></div>
            {!securityStatus.authenticatorEnabled&&!totpSecret?<button type="button" className="button button-primary" disabled={securityBusy} onClick={()=>void beginTotpSetup()}>Set up authenticator</button>:null}
            {totpSecret?<div className="security-enrollment-panel"><strong>1. Add this key to your authenticator</strong><p>Enter the key manually in your authenticator app. Account: {email}</p><code className="security-secret-key">{totpSecret}</code><p className="muted">You can also use this setup URI:</p><textarea readOnly rows={3} value={totpUri}/><strong>2. Enter the current 6-digit code</strong><form onSubmit={verifyTotpSetup} className="security-inline-form"><input aria-label="Authenticator setup code" autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={totpCode} onChange={e=>setTotpCode(e.target.value)} required/><button type="submit" className="button button-primary" disabled={securityBusy||totpCode.length!==6}>Verify and enable</button></form></div>:null}
            {securityStatus.authenticatorEnabled?<><p className="muted">Recovery codes remaining: <strong>{securityStatus.recoveryCodesRemaining}</strong></p><form className="security-password-form" onSubmit={disableTotp}><label>Account password<input type="password" autoComplete="current-password" value={disablePassword} onChange={e=>setDisablePassword(e.target.value)} required/></label><label>Authenticator or recovery code<input value={disableCode} onChange={e=>setDisableCode(e.target.value)} required minLength={6} maxLength={32}/></label><button type="submit" className="ghost" disabled={securityBusy}>Disable two-factor authentication</button></form></>:null}
            {recoveryCodes.length?<div className="security-recovery-panel"><strong>Save your recovery codes now</strong><p>Each code works once. Keep them somewhere private and safe.</p><div className="security-recovery-codes">{recoveryCodes.map(code=><code key={code}>{code}</code>)}</div><button type="button" className="ghost" onClick={()=>void navigator.clipboard?.writeText(recoveryCodes.join("\n"))}>Copy recovery codes</button><button type="button" className="ghost" onClick={()=>setRecoveryCodes([])}>I saved them</button></div>:null}
            <div className="security-feature-row"><div className="security-feature-copy"><strong>Passkeys</strong><p>Sign in using your device's screen lock, fingerprint, face recognition, or a security key.</p></div><span className="security-status-pill">{passkeys.length} added</span></div>
            <button type="button" className="button button-primary" disabled={securityBusy} onClick={()=>void addPasskey()}>Add a passkey</button>
            {passkeys.map(passkey=><div className="account-device-row" key={passkey.id}><span className="account-device-icon">⌑</span><div><strong>{passkey.name}</strong><small>Added {new Date(passkey.createdAt).toLocaleString()} · {passkey.lastUsedAt?"Last used "+new Date(passkey.lastUsedAt).toLocaleString():"Not used yet"}</small></div><button type="button" className="ghost" disabled={securityBusy} onClick={()=>void removePasskey(passkey.id)}>Remove</button></div>)}
            {securityError?<p className="security-form-message error" role="alert">{securityError}</p>:null}
            {securityMessage?<p className="security-form-message success" role="status">{securityMessage}</p>:null}
          </div>
        </div>
      </SettingSection>

      <SettingSection title="Active sessions" description="These are sign-ins that currently have valid sessions. Revoke any device you don't recognize.">
        {devicesLoading?<p className="muted">Loading active sessions…</p>:null}
        {deviceError?<p className="security-form-message error" role="alert">{deviceError}</p>:null}
        {!devicesLoading&&!devices.length&&!deviceError?<div className="account-empty-device"><strong>No active sessions found</strong><p>Sign in again to create a tracked session.</p></div>:null}
        {devices.map(session=><div className="account-device-row" key={session.id}><span className="account-device-icon">▣</span><div><strong>{session.deviceName} {session.current?<span className="security-status-pill">This device</span>:null}</strong><small>{session.platform.toUpperCase()} · {session.loginMethod==="legacy-session"?"Old login (pre-security update)":session.loginMethod} · Last active {new Date(session.lastSeenAt).toLocaleString()} · IP {session.ipAddress||"Unavailable"}</small></div><button className="ghost" type="button" disabled={revokingDevice===session.id} onClick={()=>void revokeDevice(session.id)}>{revokingDevice===session.id?"Revoking…":"Sign out"}</button></div>)}
        <button type="button" className="ghost" disabled={securityBusy||!devices.length} onClick={()=>void revokeAllSessions()}>Sign out all devices</button>
      </SettingSection>
      <SettingSection title="Previous sign-ins" description="Recent login activity, including successful sign-ins and failed attempts. Historical events begin with the security rollout; older active sessions are labeled as old logins.">
        {!loginEvents.length?<p className="muted">No sign-in history recorded yet.</p>:<div className="security-login-history">{loginEvents.map(event=><div className="security-login-event" key={event.id}><div><strong>{event.result==="success"?"Successful sign-in":event.result==="failed"?"Failed sign-in":event.result==="blocked"?"Sign-in blocked":"Second factor required"}</strong><small>{new Date(event.createdAt).toLocaleString()} · {event.method} · IP {event.ipAddress||"Unavailable"}</small><small>{event.userAgent||"Device information unavailable"}</small></div><span className="security-status-pill">{event.result}</span></div>)}</div>}
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
        <div className="account-detail-row"><span>Full name</span><strong>{fullName || "Student"}</strong></div>
        <div className="account-detail-row"><span>Email address</span><strong>{email}</strong></div>
        <div className="account-detail-row"><span>Account ID</span><strong>{userId}</strong></div>
        <div className="account-detail-row"><span>Preferences storage</span><strong>This browser</strong></div>
        <p className="muted account-settings-note">Appearance and accessibility preferences are stored locally. Security actions are verified by the server.</p>
      </SettingSection>

      <SettingSection title="Account actions">
        <div className="account-danger-zone"><div><strong>Sign out</strong><p>End this session on the current device.</p></div><button className="ghost" disabled={busy} onClick={onSignOut}>{busy ? "Signing out…" : "Sign out"}</button></div>
      </SettingSection>
      {securityReauthAction ? createPortal(
        <div className="account-profile-confirm-backdrop" role="presentation">
          <form className="panel account-profile-confirm security-reauth-dialog" role="dialog" aria-modal="true" aria-labelledby="security-reauth-title" onSubmit={submitSecurityReauthentication}>
            <h2 id="security-reauth-title">Confirm it’s you</h2>
            <p>Enter your account password to continue with this security change. If authenticator verification is enabled, enter its current code or an unused recovery code too.</p>
            <label>Password<input type="password" autoComplete="current-password" value={securityReauthPassword} onChange={event=>setSecurityReauthPassword(event.target.value)} required maxLength={128}/></label>
            <label>Authenticator / recovery code (if enabled)<input value={securityReauthCode} onChange={event=>setSecurityReauthCode(event.target.value)} autoComplete="one-time-code" maxLength={32}/></label>
            {securityError?<p className="security-form-message error" role="alert">{securityError}</p>:null}
            <div className="security-reauth-actions"><button type="button" className="ghost" disabled={securityBusy} onClick={()=>{setSecurityReauthAction(null);setSecurityReauthPasskeyId(null)}}>Cancel</button><button type="submit" className="button button-primary" disabled={securityBusy||!securityReauthPassword}>{securityBusy?"Verifying…":"Continue"}</button></div>
          </form>
        </div>,
        document.body,
      ) : null}
      {profileConfirming ? (
        <div className="account-profile-confirm-backdrop" role="presentation">
          <div className="panel account-profile-confirm" role="dialog" aria-modal="true" aria-labelledby="profile-change-title">
            <h2 id="profile-change-title">Settings changed successfully. Please log in again.</h2>
            <p>Your academic profile was updated and all active sessions were revoked.</p>
            <button type="button" className="button button-primary" onClick={onProfileChanged}>Continue to login</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
