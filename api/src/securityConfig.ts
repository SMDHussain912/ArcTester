export function validateProductionSecurityConfig(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;
  const origins = (env.CORS_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error("CORS_ORIGINS must contain one or more exact HTTPS frontend origins in production.");
  for (const origin of origins) {
    let parsed: URL;
    try { parsed = new URL(origin); } catch { throw new Error("CORS_ORIGINS contains an invalid origin."); }
    if (parsed.protocol !== "https:" || parsed.hostname.includes("*") || parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error("CORS_ORIGINS must contain exact HTTPS origins only (no wildcard, path, credentials, query, or fragment).");
    }
  }
  const sameSite = env.COOKIE_SAME_SITE?.trim().toLowerCase();
  if (sameSite && sameSite !== "lax" && sameSite !== "none") {
    throw new Error("COOKIE_SAME_SITE must be either lax or none.");
  }
  for (const name of ["JWT_ISSUER", "JWT_AUDIENCE"] as const) {
    const value = env[name];
    if (value !== undefined && (!value.trim() || [...value].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127))) {
      throw new Error(`${name} must be a non-empty value without control characters.`);
    }
  }
}
