export function getSessionActionLabel(session: { current: boolean }): string {
  return session.current ? "Sign out this device" : "Revoke session";
}
