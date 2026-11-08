export interface CookieMutationContext {
  method: string;
  origin?: string;
  authorization?: string;
  cookie?: string;
}

/** Reject cross-site state-changing requests that rely on the browser session cookie. */
export function isTrustedCookieMutation(
  request: CookieMutationContext,
  allowedOrigins: ReadonlySet<string>,
): boolean {
  const method = request.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) return true;
  if (/^Bearer\s+\S+$/i.test(request.authorization ?? "")) return true;
  if (!/(?:^|;\s*)ecet_session=/.test(request.cookie ?? "")) return true;
  const origin = request.origin;
  if (!origin) return false;
  const localOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  return localOrigin || allowedOrigins.has(origin);
}
