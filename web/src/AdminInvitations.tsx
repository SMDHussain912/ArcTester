import type { FormEvent } from "react";

export type AdminInvitation = { id: string; email: string; expiresAt: string; status: string };
export type CreatedAdminInvitation = { email: string; token: string; expiresAt: string };

type AdminInvitationsProps = {
  invitations: AdminInvitation[];
  inviteEmail: string;
  createdInvitation: CreatedAdminInvitation | null;
  busy: boolean;
  onInviteEmailChange: (value: string) => void;
  onCreate: (event: FormEvent<HTMLFormElement>) => void;
  onRevoke: (id: string) => void;
};

export default function AdminInvitations({ invitations, inviteEmail, createdInvitation, busy, onInviteEmailChange, onCreate, onRevoke }: AdminInvitationsProps) {
  return (
    <>
      <div className="admin-page-title"><div><p className="eyebrow">STUDENT ACCESS</p><h1>Invitations</h1><p>Create secure invitation codes and control who can join ArcTester.</p></div></div>
      <form className="admin-panel admin-form" onSubmit={onCreate}>
        <label>Email address<input type="email" required value={inviteEmail} onChange={(event) => onInviteEmailChange(event.target.value)} placeholder="student@example.com" /></label>
        <button className="primary" disabled={busy}>Create invitation</button>
      </form>
      {createdInvitation && <div className="admin-panel invite-result"><b>{createdInvitation.email}</b><code>{createdInvitation.token}</code><button className="ghost" onClick={() => void navigator.clipboard?.writeText(createdInvitation.token)}>Copy code</button><small>Expires {new Date(createdInvitation.expiresAt).toLocaleString()}</small></div>}
      <div className="admin-panel invitation-list">{invitations.map((invitation) => <div className="invitation-row" key={invitation.id}><div><b>{invitation.email}</b><small>Expires {new Date(invitation.expiresAt).toLocaleDateString()}</small></div><span className={`status status-${invitation.status.toLowerCase()}`}>{invitation.status}</span>{invitation.status === "PENDING" && <button className="ghost" onClick={() => onRevoke(invitation.id)}>Revoke</button>}</div>)}</div>
    </>
  );
}
