// Authentication uses HMAC-SHA256 JWTs and Node's built-in scrypt password hashing.
// Student accounts self-register and require administrator approval. Privileged
// operations re-check the current database role instead of trusting client claims.

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import type { PrismaClient } from "@prisma/client";
import { decryptTotpSecret, encryptTotpSecret, generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, verifyTotp } from "./totp.js";
import { base64urlEncode, createWebAuthnChallenge, parseNoneAttestation, verifyClientData, verifyPasskeyAssertion } from "./webauthn.js";

const DEVELOPMENT_JWT_SECRET = "dev-secret-change-me-in-production";
const JWT_SECRET = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : DEVELOPMENT_JWT_SECRET);
const COOKIE_NAME = "ecet_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
// Keep issuer/audience stable across API instances. Overrides are useful for
// staging environments; changing either intentionally invalidates existing sessions.
const JWT_ISSUER = process.env.JWT_ISSUER?.trim() || "arctester-api";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE?.trim() || "arctester-client";
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Explicit parameters keep password hashes stable across Node runtime upgrades.
const SCRYPT_OPTIONS = { N: 1 << 14, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

export function validateJwtSecret(secret: string, production = process.env.NODE_ENV === "production"): void {
  if (!production) return;
  if (
    Buffer.byteLength(secret, "utf8") < 32 ||
    secret === DEVELOPMENT_JWT_SECRET ||
    /change[_ -]?me|replace[_ -]?me|example|placeholder/i.test(secret)
  ) {
    throw new Error("JWT_SECRET must be a strong, unique secret of at least 32 bytes in production. Generate one with: openssl rand -hex 32");
  }
}

validateJwtSecret(JWT_SECRET);

function base64Url(data: Buffer): string {
  return data.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function parseBase64Url(input: string): Buffer {
  let str = input.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return Buffer.from(str, "base64");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function signJwt(
  payload: Record<string, unknown>,
  ttlSeconds: number = JWT_TTL_SECONDS
): string {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64Url(
    Buffer.from(
      JSON.stringify({
        ...payload,
        iss: JWT_ISSUER,
        aud: JWT_AUDIENCE,
        iat: nowSeconds(),
        exp: nowSeconds() + ttlSeconds,
      })
    )
  );
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${body}.${sig}`;
}

export function verifyJwt(token: string): Record<string, unknown> {
  if (typeof token !== "string") throw new Error("malformed token");
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("malformed token");
  const [header, body, sig] = parts;
  if (!header || !body || !sig) throw new Error("malformed token");

  const expected = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const sigBytes = Buffer.from(sig);
  const expectedBytes = Buffer.from(expected);
  if (sigBytes.length !== expectedBytes.length || !timingSafeEqual(sigBytes, expectedBytes)) {
    throw new Error("bad signature");
  }

  let parsedHeader: unknown;
  try {
    parsedHeader = JSON.parse(parseBase64Url(header).toString("utf8"));
  } catch {
    throw new Error("malformed token header");
  }
  if (
    !parsedHeader || typeof parsedHeader !== "object" ||
    (parsedHeader as Record<string, unknown>).alg !== "HS256" ||
    (parsedHeader as Record<string, unknown>).typ !== "JWT"
  ) {
    throw new Error("unsupported JWT header");
  }

  let parsedPayload: unknown;
  try {
    parsedPayload = JSON.parse(parseBase64Url(body).toString("utf8"));
  } catch {
    throw new Error("malformed token payload");
  }
  if (!parsedPayload || typeof parsedPayload !== "object" || Array.isArray(parsedPayload)) {
    throw new Error("malformed token payload");
  }
  const payload = parsedPayload as Record<string, unknown>;
  const now = nowSeconds();
  if (!Number.isSafeInteger(payload.exp)) throw new Error("missing or invalid token expiry");
  if (!Number.isSafeInteger(payload.iat)) throw new Error("missing or invalid token issued-at");
  if (typeof payload.iss !== "string" || payload.iss !== JWT_ISSUER) throw new Error("invalid token issuer");
  const audience = payload.aud;
  if (!(audience === JWT_AUDIENCE || (Array.isArray(audience) && audience.includes(JWT_AUDIENCE)))) {
    throw new Error("invalid token audience");
  }
  const issuedAt = payload.iat as number;
  const expiresAt = payload.exp as number;
  if (issuedAt > now + 60) throw new Error("token issued in the future");
  if (expiresAt <= now) throw new Error("expired token");
  if (expiresAt <= issuedAt || expiresAt - issuedAt > JWT_TTL_SECONDS) throw new Error("invalid token lifetime");
  if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || (payload.nbf as number) > now + 60)) {
    throw new Error("token not yet valid");
  }
  return payload;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64, SCRYPT_OPTIONS);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, 64, SCRYPT_OPTIONS);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function scryptAsync(password: string | Buffer, salt: string | Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, SCRYPT_OPTIONS, (error, derived) => {
      if (error) reject(error);
      else resolve(derived as Buffer);
    });
  });
}

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPasswordAsync(password: string, stored: string): Promise<boolean> {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex || !/^[a-f0-9]{32}$/i.test(saltHex) || !/^[a-f0-9]{128}$/i.test(hashHex)) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = await scryptAsync(password, salt, 64);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

export const StudentAcademicProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(100),
  collegeName: z.string().trim().min(2, "Enter your college name.").max(180),
  collegeCode: z.string().trim().min(1, "Enter your college PIN / institute code.").max(16),
  postalPin: z.string().trim().regex(/^\d{6}$/, "Postal PIN must contain 6 digits.").or(z.literal("")).optional(),
  branchName: z.string().trim().min(2, "Choose or enter your diploma branch.").max(120),
  branchCode: z.string().trim().max(24).or(z.literal("")).optional(),
});

export const StudentAcademicProfileUpdateSchema = StudentAcademicProfileSchema.extend({
  registrationNumber: z.string().trim().regex(/^\d{5}-[A-Z]{1,3}-\d{3}$/i, "Enter a valid diploma registration number, e.g. 24010-CM-053.").or(z.literal("")).optional(),
});

const REGISTRATION_BRANCHES: Record<string, { code: string; name: string }> = {
  CM: { code: "CM", name: "Computer Engineering (CME)" },
  EC: { code: "EC", name: "Electronics and Communication Engineering (ECE)" },
  EE: { code: "EE", name: "Electrical and Electronics Engineering (EEE)" },
  M: { code: "M", name: "Mechanical Engineering" },
  C: { code: "C", name: "Civil Engineering" },
  A: { code: "A", name: "Automobile Engineering" },
};

function validateRegistrationIdentity(registrationNumber: string, collegeCode: string, branchCode: string, branchName: string): { collegeCode: string; branchCode: string; branchName: string } {
  const parts = registrationNumber.toUpperCase().match(/^(\d{2})(\d{3})-([A-Z]{1,3})-(\d{3})$/);
  if (!parts) throw badRequest("Registration number must look like 24010-CM-053.");
  const branch = REGISTRATION_BRANCHES[parts[3]];
  if (!branch) throw badRequest("Diploma registration number has an unsupported branch code.");
  if (collegeCode !== parts[2]) throw badRequest("College code does not match your registration number.");
  if (branchCode !== branch.code || branchName !== branch.name) throw badRequest("Diploma branch does not match the branch code in your registration number.");
  return { collegeCode: parts[2], branchCode: branch.code, branchName: branch.name };
}

export const RegisterSchema = z.object({
  email: z.string().email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  captchaToken: z.string().optional(),
  registrationNumber: z.string().trim().regex(/^\d{5}-[A-Z]{1,3}-\d{3}$/i, "Enter your diploma registration number, e.g. 24010-CM-053.").optional(),
}).merge(StudentAcademicProfileSchema);

type SvgCaptchaPayload = { answerDigest: string; expiresAt: number; nonce: string };
const usedSvgCaptchaNonces = new Map<string, number>();
const SVG_CAPTCHA_TTL_MS = 5 * 60 * 1000;
const SVG_CAPTCHA_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function signSvgCaptchaPayload(encoded: string): string {
  if (!JWT_SECRET) throw new Error("JWT_SECRET is required to sign registration CAPTCHA challenges.");
  return createHmac("sha256", JWT_SECRET).update("svg-captcha:" + encoded).digest("base64url");
}

function createSvgCaptcha(): { svg: string; token: string } {
  const answer = Array.from(randomBytes(5), byte => SVG_CAPTCHA_ALPHABET[byte % SVG_CAPTCHA_ALPHABET.length]).join("");
  const nonce = randomBytes(18).toString("base64url");
  const answerDigest = createHmac("sha256", JWT_SECRET).update("svg-captcha-answer:" + nonce + ":" + answer).digest("base64url");
  const payload: SvgCaptchaPayload = { answerDigest, expiresAt: Date.now() + SVG_CAPTCHA_TTL_MS, nonce };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const token = encoded + "." + signSvgCaptchaPayload(encoded);
  const chars = Array.from(answer, (char, index) => {
    const x = 28 + index * 37;
    const y = 39 + (index % 2 ? 4 : -3);
    const rotate = (index % 5 - 2) * 8;
    return `<text x="${x}" y="${y}" transform="rotate(${rotate} ${x} ${y})" font-size="30" font-family="monospace" font-weight="700" fill="#${["234","345","456","567","678"][index]}">${char}</text>`;
  }).join("");
  const lines = Array.from({ length: 7 }, (_, i) => {
    const x1 = (i * 47 + 13) % 220, y1 = (i * 23 + 9) % 65;
    const x2 = (i * 61 + 77) % 220, y2 = (i * 31 + 19) % 65;
    return `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="#9aa4b2" stroke-width="1.3" opacity=".55"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="68" viewBox="0 0 220 68"><rect width="220" height="68" rx="8" fill="#f1f5f9"/><g>${lines}</g><g>${chars}</g></svg>`;
  return { svg, token };
}

function verifySvgCaptcha(token: string | undefined): void {
  if (!token?.trim()) throw badRequest("Enter the characters shown in the security image.");
  const answerSeparator = token.lastIndexOf(":");
  if (answerSeparator <= 0) throw badRequest("Enter the characters shown in the security image.");
  const signedToken = token.slice(0, answerSeparator);
  const answer = token.slice(answerSeparator + 1).trim().toUpperCase();
  const separator = signedToken.lastIndexOf(".");
  if (separator <= 0) throw badRequest("Security image expired. Refresh it and try again.");
  const encoded = signedToken.slice(0, separator);
  const suppliedSignature = signedToken.slice(separator + 1);
  const expectedSignature = signSvgCaptchaPayload(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw badRequest("Security image is invalid. Refresh it and try again.");
  }
  let payload: SvgCaptchaPayload;
  try { payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as SvgCaptchaPayload; }
  catch { throw badRequest("Security image is invalid. Refresh it and try again."); }
  if (!payload || typeof payload.answerDigest !== "string" || typeof payload.nonce !== "string" || !Number.isFinite(payload.expiresAt)) {
    throw badRequest("Security image is invalid. Refresh it and try again.");
  }
  if (payload.expiresAt < Date.now()) throw badRequest("Security image expired. Refresh it and try again.");
  const submittedDigest = createHmac("sha256", JWT_SECRET).update("svg-captcha-answer:" + payload.nonce + ":" + answer).digest("base64url");
  const submittedDigestBytes = Buffer.from(submittedDigest);
  const expectedDigestBytes = Buffer.from(payload.answerDigest);
  if (submittedDigestBytes.length !== expectedDigestBytes.length || !timingSafeEqual(submittedDigestBytes, expectedDigestBytes)) throw badRequest("The security image characters do not match. Try again.");
  if (usedSvgCaptchaNonces.has(payload.nonce)) throw badRequest("Security image was already used. Refresh it and try again.");
  usedSvgCaptchaNonces.set(payload.nonce, payload.expiresAt);
  for (const [nonce, expiry] of usedSvgCaptchaNonces) if (expiry < Date.now()) usedSvgCaptchaNonces.delete(nonce);
}
async function verifyRegistrationCaptcha(token: string | undefined, _ip: string, nativeClient = false): Promise<void> {
  if (nativeClient || process.env.NODE_ENV === "test") return;
  verifySvgCaptcha(token);
}

export const LoginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required.").max(128),
  newPassword: z.string().min(12, "New password must be at least 12 characters.").max(128),
}).refine((input) => input.currentPassword !== input.newPassword, {
  message: "Choose a new password different from your current password.",
  path: ["newPassword"],
});

const InvitationSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

const DeviceSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
  platform: z.enum(["web", "android", "ios", "windows"]),
  fingerprint: z.string().trim().min(16).max(128),
});

// Shared PostgreSQL login throttling; only hashed bucket identifiers are stored.
const LOGIN_FAILURE_LIMIT = 8;
const IP_FAILURE_LIMIT = 20;
function loginBucketKey(ip: string, email?: string): string { return email ? `${ip}::${email.toLowerCase()}` : `ip-only::${ip}`; }
async function loginRetryAfter(db: PrismaClient, key: string): Promise<number> {
 const hash = sha256(key);
 const rows = await db.$queryRaw<Array<{ retryAfterSeconds: number }>>`SELECT GREATEST(0, CEIL(EXTRACT(EPOCH FROM (blocked_until - NOW()))))::int AS "retryAfterSeconds" FROM auth_rate_limit_buckets WHERE bucket_key = ${hash} AND window_started_at > NOW() - INTERVAL '15 minutes' AND blocked_until IS NOT NULL`;
 return rows[0]?.retryAfterSeconds ?? 0;
}
async function recordLoginFailure(db: PrismaClient, key: string): Promise<number> {
 const hash = sha256(key), limit = key.startsWith("ip-only::") ? IP_FAILURE_LIMIT : LOGIN_FAILURE_LIMIT;
 await db.$executeRaw`INSERT INTO auth_rate_limit_buckets (bucket_key,failure_count,window_started_at,blocked_until,updated_at) VALUES (${hash},1,NOW(),NULL,NOW()) ON CONFLICT (bucket_key) DO UPDATE SET failure_count=CASE WHEN auth_rate_limit_buckets.window_started_at <= NOW()-INTERVAL '15 minutes' THEN 1 ELSE auth_rate_limit_buckets.failure_count+1 END, window_started_at=CASE WHEN auth_rate_limit_buckets.window_started_at <= NOW()-INTERVAL '15 minutes' THEN NOW() ELSE auth_rate_limit_buckets.window_started_at END, blocked_until=CASE WHEN (CASE WHEN auth_rate_limit_buckets.window_started_at <= NOW()-INTERVAL '15 minutes' THEN 1 ELSE auth_rate_limit_buckets.failure_count+1 END) >= ${limit} THEN NOW()+INTERVAL '15 minutes' ELSE NULL END, updated_at=NOW()`;
 await db.$executeRaw`DELETE FROM auth_rate_limit_buckets WHERE updated_at < NOW() - INTERVAL '1 day'`;
 return loginRetryAfter(db,key);
}
async function clearLoginFailures(db: PrismaClient, ip: string, email?: string): Promise<void> {
 const keys=[loginBucketKey(ip,email),loginBucketKey(ip)].map(sha256);
 await db.$executeRaw`DELETE FROM auth_rate_limit_buckets WHERE bucket_key IN (${keys[0]},${keys[1]})`;
}
function rejectThrottledLogin(res: Response, retryAfter: number): void {
  res.setHeader("Retry-After", String(retryAfter));
  res.status(429).json({ error: "Too many failed sign-in attempts. Try again later." });
}

export interface AuthedRequest extends Request {
  user?: { id: number; email: string };
}

export function readSessionToken(req: Request): string | null {
  const cookieToken = getCookie(req, COOKIE_NAME);
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> {
  const token = readSessionToken(req);
  if (!token) return next(forbidden("Sign in before using ArcTester."));

  let payload: Record<string, unknown>;
  try {
    payload = verifyJwt(token);
  } catch {
    return next(forbidden("Invalid or expired session. Sign in again."));
  }

  const id = Number(payload.sub);
  const email = String(payload.email ?? "");
  const sessionVersion = payload.sv === undefined ? 0 : Number(payload.sv);
  if (!Number.isSafeInteger(id) || id <= 0 || !email ||
      !Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
    return next(forbidden("Invalid or expired session. Sign in again."));
  }

  const db = req.app.locals.db as PrismaClient | undefined;
  if (!db) return next(new Error("Authentication database is not configured."));
  try {
    const user = await db.user.findUnique({
      where: { id },
      select: { email: true, sessionVersion: true, accessStatus: true },
    });
    if (!user || user.email !== email || user.sessionVersion !== sessionVersion) {
      return next(forbidden("This session has been revoked. Sign in again."));
    }
    const sessionId = typeof payload.sid === "string" ? payload.sid : "";
    if (sessionId) {
      const activeSession = await db.authSession.findFirst({ where: { id: sessionId, userId: id, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, lastSeenAt: true } });
      if (!activeSession) return next(forbidden("This device session has been revoked. Sign in again."));
      if (activeSession.lastSeenAt.getTime() < Date.now() - 5 * 60 * 1000) await db.authSession.update({ where: { id: sessionId }, data: { lastSeenAt: new Date() } });
    } else {
      const legacySessionId = "legacy-" + id + "-" + sha256(token).slice(0, 20);
      const legacySession = await db.authSession.findUnique({ where: { id: legacySessionId }, select: { id: true, revokedAt: true, expiresAt: true } });
      if (legacySession && (legacySession.revokedAt || legacySession.expiresAt <= new Date())) return next(forbidden("This legacy session has been revoked. Sign in again."));
    }
    if (user.accessStatus !== "APPROVED") {
      return next(forbidden(user.accessStatus === "REJECTED" ? "Your account was not approved. Contact your administrator." : "Your account is waiting for administrator approval."));
    }
    req.user = { id, email };
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Security-sensitive account changes require a recently issued session token.
 * The JWT iat is set by the server at successful authentication and cannot be
 * changed without invalidating its signature.
 */
export function requireRecentAuth(maxAgeSeconds = 5 * 60) {
  return (req: AuthedRequest, _res: Response, next: NextFunction): void => {
    const token = readSessionToken(req);
    if (!token) return next(forbidden("Sign in again to confirm this security change."));
    try {
      const payload = verifyJwt(token);
      const issuedAt = payload.iat;
      if (!Number.isSafeInteger(issuedAt)) return next(forbidden("Sign in again to confirm this security change."));
      const ageSeconds = nowSeconds() - (issuedAt as number);
      if (ageSeconds < -60 || ageSeconds > maxAgeSeconds) return next(forbidden("Sign in again to confirm this security change."));
      next();
    } catch {
      next(forbidden("Sign in again to confirm this security change."));
    }
  };
}

export function requireAdmin(db: PrismaClient) {
  return async (req: AuthedRequest, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) return next(forbidden("Sign in before using this resource."));
      const user = await db.user.findUnique({
        where: { id: req.user.id },
        select: { role: true },
      });
      if (!user || user.role !== "ADMIN") {
        return next(forbidden("Administrator access is required."));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

function getCookie(req: Request, name: string): string | null {
  const cookie = req.headers.cookie ?? "";
  const match = cookie.match(new RegExp(`(?:^|; )${encodeURIComponent(name)}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function sessionCookieSameSite(secure: boolean): "Lax" | "None" {
  // The production web client (Vercel) and API (Render) are cross-site.
  // Always use SameSite=None; Secure in production so credentialed browser
  // requests can carry the session cookie. COOKIE_SAME_SITE=Lax from an old
  // deployment setting must not silently break /auth/me and security flows.
  return secure ? "None" : "Lax";
}

function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  const sameSite = sessionCookieSameSite(secure);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=${sameSite}${secure ? "; Secure" : ""}`
  );
}

function clearSessionCookie(res: Response): void {
  const secure = process.env.NODE_ENV === "production";
  const sameSite = sessionCookieSameSite(secure);
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=${sameSite}${secure ? "; Secure" : ""}`
  );
}


function maskedIp(ip: string): string {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ip)) return ip.replace(/\.\d+$/, ".0");
  if (ip.includes(":")) return ip.split(":").slice(0, 4).join(":") + "::";
  return "";
}
function requestDevice(req: Request): { deviceName: string; platform: string; userAgent: string; ipAddress: string } {
  const userAgent = String(req.headers["user-agent"] ?? "").slice(0, 500);
  const nativeClient = req.header("x-arctester-client") === "mobile";
  const platform = nativeClient ? (/iphone|ipad|ios/i.test(userAgent) ? "ios" : /android/i.test(userAgent) ? "android" : "mobile") : /android/i.test(userAgent) ? "android" : /iphone|ipad|ios/i.test(userAgent) ? "ios" : /windows/i.test(userAgent) ? "windows" : /mac os/i.test(userAgent) ? "macos" : /linux/i.test(userAgent) ? "linux" : "web";
  const ua = userAgent.toLowerCase();
  const browser = nativeClient ? "ArcTester" : ua.includes("edg/") ? "Edge" : ua.includes("firefox/") ? "Firefox" : ua.includes("chrome/") ? "Chrome" : ua.includes("safari/") ? "Safari" : "Browser";
  const deviceName = nativeClient ? "ArcTester mobile app" : /mobile|android|iphone/i.test(userAgent) ? browser + " on mobile" : browser + " on " + platform;
  return { deviceName, platform, userAgent, ipAddress: maskedIp(req.ip ?? "") };
}
async function recordLoginEvent(db: PrismaClient, req: Request, email: string, userId: number | null, result: string, method = "password"): Promise<void> {
  const device = requestDevice(req);
  await db.loginEvent.create({ data: { email: email.slice(0, 254), userId, result, method, ipAddress: device.ipAddress, userAgent: device.userAgent } });
}
async function createAuthSession(db: PrismaClient, req: Request, user: { id: number; email: string; sessionVersion: number }, method = "password"): Promise<{ token: string; sessionId: string }> {
  const device = requestDevice(req);
  const recentDevice = await db.authSession.findFirst({
    where: {
      userId: user.id,
      deviceName: device.deviceName,
      platform: device.platform,
      userAgent: device.userAgent,
      ipAddress: device.ipAddress,
      createdAt: { gte: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000) },
    },
    select: { id: true },
  });
  const expiresAt = new Date(Date.now() + JWT_TTL_SECONDS * 1000);
  const session = await db.authSession.create({ data: { userId: user.id, ...device, loginMethod: method, expiresAt } });
  if (!recentDevice) {
    try {
      const locationHint = device.ipAddress ? " from " + device.ipAddress : "";
      await db.studentNotification.create({
        data: {
          userId: user.id,
          kind: "SECURITY_NEW_DEVICE",
          title: "New sign-in detected",
          message: `New sign-in on ${device.deviceName}${locationHint}. If this wasn't you, review your sessions and change your password.`,
          href: "/profile",
          dedupeKey: "security-new-device:" + session.id,
          expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
        },
      });
    } catch {
      // Security alerts are best-effort; a notification failure must not block login.
    }
  }
  const token = signJwt({ sub: String(user.id), email: user.email, sv: user.sessionVersion, sid: session.id });
  return { token, sessionId: session.id };
}

export function authRouter(db: PrismaClient): Router {
  const router = Router();

  router.get("/invitations", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      const invitations = await db.invitation.findMany({
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          email: true,
          expiresAt: true,
          usedAt: true,
          revokedAt: true,
          createdAt: true,
        },
      });
      const now = Date.now();
      res.json({
        ok: true,
        invitations: invitations.map((invitation) => ({
          ...invitation,
          status: invitation.usedAt
            ? "USED"
            : invitation.revokedAt
              ? "REVOKED"
              : invitation.expiresAt.getTime() <= now
                ? "EXPIRED"
                : "PENDING",
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/invitations", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const { email } = InvitationSchema.parse(req.body);
      const existing = await db.user.findUnique({ where: { email }, select: { id: true } });
      if (existing) return next(conflict("An account with that email already exists."));

      const rawToken = randomBytes(32).toString("base64url");
      const invitation = await db.invitation.create({
        data: {
          email,
          tokenHash: sha256(rawToken),
          expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
          createdById: (req as AuthedRequest).user!.id,
        },
        select: { id: true, email: true, expiresAt: true, createdAt: true },
      });
      // The raw token is returned once and is never persisted.
      res.status(201).json({ ok: true, invitation: { ...invitation, token: rawToken } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/invitations/:id/revoke", requireAuth, requireAdmin(db), async (req, res, next) => {
    try {
      const result = await db.invitation.updateMany({
        where: { id: req.params.id, usedAt: null, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return next(notFound("Invitation not found or already used."));
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.get("/captcha/challenge", (_req, res, next) => {
    try {
      const challenge = createSvgCaptcha();
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.json(challenge);
    } catch (error) { next(error); }
  });

  router.post("/register", async (req, res, next) => {
    try {
      const input = RegisterSchema.parse(req.body);
      const nativeClient = req.header("x-arctester-client") === "mobile";
      if (!input.registrationNumber && !nativeClient) throw badRequest("Enter your diploma registration number.");
      const registrationNumber: string | null = input.registrationNumber?.toUpperCase() ?? null;
      let registrationCollegeCode = input.collegeCode;
      let registrationBranchCode = input.branchCode || null;
      let registrationBranchName = input.branchName;
      if (registrationNumber) {
        const parts = registrationNumber.match(/^(\d{2})(\d{3})-([A-Z]{1,3})-(\d{3})$/);
        if (!parts) throw badRequest("Registration number must look like 24010-CM-053.");
        registrationCollegeCode = parts[2];
        const identity = validateRegistrationIdentity(registrationNumber, input.collegeCode, input.branchCode || "", input.branchName);
        registrationCollegeCode = identity.collegeCode;
        registrationBranchCode = identity.branchCode;
        registrationBranchName = identity.branchName;
      }
      await verifyRegistrationCaptcha(input.captchaToken, req.ip ?? "unknown", nativeClient);
      const passwordHash = await hashPasswordAsync(input.password);
      const user = await db.user.create({
        data: { email: input.email, passwordHash, role: "STUDENT", accessStatus: "PENDING", fullName: input.fullName, collegeName: input.collegeName, collegeCode: registrationCollegeCode, postalPin: input.postalPin || null, branchName: registrationBranchName, branchCode: registrationBranchCode, registrationNumber },
        select: { id: true, email: true, role: true, accessStatus: true, fullName: true, collegeName: true, collegeCode: true, postalPin: true, branchName: true, branchCode: true, registrationNumber: true },
      });
      res.status(201).json({
        ok: true,
        message: "Account submitted for administrator approval. You can sign in after approval.",
        user,
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return next(conflict("An account with this email already exists."));
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const input = LoginSchema.parse(req.body);
      const ip = req.ip ?? "unknown";
      const emailKey = loginBucketKey(ip, input.email);
      const ipKey = loginBucketKey(ip);
      const retryAfter = Math.max(await loginRetryAfter(db, emailKey), await loginRetryAfter(db, ipKey));
      if (retryAfter > 0) { await recordLoginEvent(db, req, input.email, null, "throttled", "password"); return rejectThrottledLogin(res, retryAfter); }
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !await verifyPasswordAsync(input.password, user.passwordHash)) {
        await recordLoginEvent(db, req, input.email, user?.id ?? null, "failed", "password");
        await recordLoginFailure(db, emailKey);
        await recordLoginFailure(db, ipKey);
        const blockedFor = Math.max(await loginRetryAfter(db, emailKey), await loginRetryAfter(db, ipKey));
        if (blockedFor > 0) return rejectThrottledLogin(res, blockedFor);
        return next(badRequest("Invalid email or password."));
      }
      await clearLoginFailures(db, ip, input.email);
      if (user.accessStatus !== "APPROVED") { await recordLoginEvent(db, req, input.email, user.id, "blocked"); return next(forbidden(user.accessStatus === "REJECTED" ? "Your account was not approved. Contact your administrator." : "Your account is waiting for administrator approval.")); }
      const totp = await db.totpCredential.findUnique({ where: { userId: user.id }, select: { enabledAt: true } });
      if (totp?.enabledAt) {
        const challenge = randomBytes(32).toString("base64url");
        await db.authChallenge.create({ data: { userId: user.id, challenge: sha256(challenge), purpose: "totp-login", expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
        await recordLoginEvent(db, req, input.email, user.id, "second-factor-required", "password");
        return res.json({ ok: true, twoFactorRequired: true, challengeId: challenge, expiresIn: 300 });
      }
      await recordLoginEvent(db, req, input.email, user.id, "success", "password");
      const { token } = await createAuthSession(db, req, user, "password");
      setSessionCookie(res, token);
      res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, collegeName: user.collegeName, collegeCode: user.collegeCode, postalPin: user.postalPin, branchName: user.branchName, branchCode: user.branchCode, registrationNumber: user.registrationNumber } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/token", async (req, res, next) => {
    try {
      const input = LoginSchema.parse(req.body);
      const ip = req.ip ?? "unknown";
      const emailKey = loginBucketKey(ip, input.email);
      const ipKey = loginBucketKey(ip);
      const retryAfter = Math.max(await loginRetryAfter(db, emailKey), await loginRetryAfter(db, ipKey));
      if (retryAfter > 0) { await recordLoginEvent(db, req, input.email, null, "throttled", "password"); return rejectThrottledLogin(res, retryAfter); }
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !await verifyPasswordAsync(input.password, user.passwordHash)) {
        await recordLoginEvent(db, req, input.email, user?.id ?? null, "failed", "password");
        await recordLoginFailure(db, emailKey);
        await recordLoginFailure(db, ipKey);
        const blockedFor = Math.max(await loginRetryAfter(db, emailKey), await loginRetryAfter(db, ipKey));
        if (blockedFor > 0) return rejectThrottledLogin(res, blockedFor);
        return next(badRequest("Invalid email or password."));
      }
      await clearLoginFailures(db, ip, input.email);
      if (user.accessStatus !== "APPROVED") { await recordLoginEvent(db, req, input.email, user.id, "blocked"); return next(forbidden(user.accessStatus === "REJECTED" ? "Your account was not approved. Contact your administrator." : "Your account is waiting for administrator approval.")); }
      await recordLoginEvent(db, req, input.email, user.id, "success", "password");
      const { token } = await createAuthSession(db, req, user, "password");
      res.json({
        ok: true,
        token,
        tokenType: "Bearer",
        expiresIn: JWT_TTL_SECONDS,
        user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, collegeName: user.collegeName, collegeCode: user.collegeCode, postalPin: user.postalPin, branchName: user.branchName, branchCode: user.branchCode, registrationNumber: user.registrationNumber },
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/logout", async (req, res, next) => {
    try {
      const token = readSessionToken(req);
      if (token) {
        let payload: Record<string, unknown> | null = null;
        try {
          payload = verifyJwt(token);
        } catch {
          // Invalid or expired tokens still have their browser cookie cleared.
        }
        if (payload) {
          const userId = Number(payload.sub);
          const sessionVersion = payload.sv === undefined ? 0 : Number(payload.sv);
          if (Number.isSafeInteger(userId) && userId > 0 && Number.isSafeInteger(sessionVersion) && sessionVersion >= 0) {
            if (typeof payload.sid === "string") {
              await db.authSession.updateMany({ where: { id: payload.sid, userId, revokedAt: null }, data: { revokedAt: new Date() } });
            } else {
              await db.authSession.updateMany({ where: { userId, loginMethod: "legacy-session", revokedAt: null }, data: { revokedAt: new Date() } });
              await db.user.updateMany({ where: { id: userId, sessionVersion }, data: { sessionVersion: { increment: 1 } } });
            }
          }
        }
      }
      clearSessionCookie(res);
      res.json({ ok: true, message: "This device session was revoked." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", async (req, res, next) => {
    const token = readSessionToken(req);
    if (!token) return next(forbidden("Not signed in."));
    try {
      const payload = verifyJwt(token);
      const id = Number(payload.sub);
      const tokenEmail = String(payload.email ?? "");
      const sessionVersion = payload.sv === undefined ? 0 : Number(payload.sv);
      if (!Number.isSafeInteger(id) || id <= 0 || !tokenEmail || !Number.isSafeInteger(sessionVersion) || sessionVersion < 0) {
        return next(forbidden("Invalid or expired session. Sign in again."));
      }
      const user = await db.user.findUnique({
        where: { id },
        select: { id: true, email: true, role: true, sessionVersion: true, accessStatus: true, fullName: true, collegeName: true, collegeCode: true, postalPin: true, branchName: true, branchCode: true, registrationNumber: true },
      });
      if (!user || user.email !== tokenEmail || user.sessionVersion !== sessionVersion) {
        return next(forbidden("This session has been revoked. Sign in again."));
      }
      const sessionId = typeof payload.sid === "string" ? payload.sid : "";
      const trackedId = sessionId || "legacy-" + user.id + "-" + sha256(token).slice(0, 20);
      const trackedSession = await db.authSession.findUnique({ where: { id: trackedId }, select: { revokedAt: true, expiresAt: true } });
      if (trackedSession && (trackedSession.revokedAt || trackedSession.expiresAt <= new Date())) return next(forbidden("This device session has been revoked. Sign in again."));
      if (user.accessStatus !== "APPROVED") return next(forbidden(user.accessStatus === "REJECTED" ? "Your account was not approved. Contact your administrator." : "Your account is waiting for administrator approval."));
      res.json({ ok: true, user });
    } catch {
      next(forbidden("Invalid session."));
    }
  });

  router.post("/reauthenticate", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ password: z.string().min(1).max(128), code: z.string().trim().max(32).optional() }).parse(req.body);
      const user = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, sessionVersion: true, passwordHash: true, accessStatus: true },
      });
      if (!user || user.accessStatus !== "APPROVED") return next(forbidden("Your account is not approved for security changes."));
      if (!await verifyPasswordAsync(input.password, user.passwordHash)) return next(forbidden("Password is incorrect."));

      const credential = await db.totpCredential.findUnique({
        where: { userId: user.id },
        select: { enabledAt: true, secretEncrypted: true, lastUsedCounter: true, recoveryCodesJson: true },
      });
      if (credential?.enabledAt) {
        const submitted = input.code?.trim() ?? "";
        const counter = /^\d{6}$/.test(submitted) ? verifyTotp(decryptTotpSecret(credential.secretEncrypted), submitted) : null;
        if (counter !== null) {
          if (counter <= credential.lastUsedCounter) return next(forbidden("That authenticator code was already used. Wait for the next code."));
          await db.totpCredential.update({ where: { userId: user.id }, data: { lastUsedCounter: counter } });
        } else {
          const recoveryHashes = JSON.parse(credential.recoveryCodesJson) as string[];
          const recoveryHash = hashRecoveryCode(submitted);
          const recoveryIndex = recoveryHashes.indexOf(recoveryHash);
          if (!submitted || recoveryIndex < 0) return next(forbidden("Enter your current authenticator code or an unused recovery code."));
          recoveryHashes.splice(recoveryIndex, 1);
          await db.totpCredential.update({ where: { userId: user.id }, data: { recoveryCodesJson: JSON.stringify(recoveryHashes) } });
        }
      }

      const oldToken = readSessionToken(req);
      const oldPayload = oldToken ? verifyJwt(oldToken) : {};
      const { token } = await createAuthSession(db, req, user, "reauthentication");
      if (typeof oldPayload.sid === "string") {
        await db.authSession.updateMany({
          where: { id: oldPayload.sid, userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      setSessionCookie(res, token);
      await recordLoginEvent(db, req, user.email, user.id, "reauthenticated", "password");
      res.json({ ok: true, reauthenticated: true, expiresIn: JWT_TTL_SECONDS });
    } catch (error) { next(error); }
  });

  router.post("/change-password", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = ChangePasswordSchema.parse(req.body);
      const user = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, email: true, passwordHash: true, sessionVersion: true },
      });
      if (!user || !await verifyPasswordAsync(input.currentPassword, user.passwordHash)) {
        return next(forbidden("Current password is incorrect."));
      }

      const passwordHash = await hashPasswordAsync(input.newPassword);
      const updated = await db.user.update({
        where: { id: user.id },
        data: { passwordHash, sessionVersion: { increment: 1 } },
        select: { id: true, email: true, sessionVersion: true },
      });
      await db.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      // Rotate the current session while revoking every other previously issued session.
      const { token } = await createAuthSession(db, req, updated, "password-change");
      const cookieSession = Boolean(getCookie(req, COOKIE_NAME));
      if (cookieSession) setSessionCookie(res, token);
      res.json({
        ok: true,
        message: "Password changed. Other sessions have been revoked.",
        ...(cookieSession ? {} : { token, tokenType: "Bearer", expiresIn: JWT_TTL_SECONDS }),
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/profile", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = StudentAcademicProfileUpdateSchema.parse(req.body);
      const current = await db.user.findUnique({
        where: { id: req.user!.id },
        select: { id: true, role: true, accessStatus: true, fullName: true, collegeName: true, collegeCode: true, postalPin: true, branchName: true, branchCode: true, registrationNumber: true },
      });
      if (!current || current.role !== "STUDENT") return next(forbidden("Only student accounts can edit an academic profile."));
      if (current.accessStatus !== "APPROVED") return next(forbidden("Only approved student accounts can edit an academic profile."));

      const registrationNumber = input.registrationNumber?.trim().toUpperCase() || current.registrationNumber;
      let collegeCode = input.collegeCode;
      let branchCode = input.branchCode || null;
      let branchName = input.branchName;
      if (registrationNumber) {
        const identity = validateRegistrationIdentity(registrationNumber, input.collegeCode, input.branchCode || "", input.branchName);
        collegeCode = identity.collegeCode;
        branchCode = identity.branchCode;
        branchName = identity.branchName;
      }

      const data = {
        fullName: input.fullName,
        collegeName: input.collegeName,
        collegeCode,
        postalPin: input.postalPin || null,
        branchName,
        branchCode,
        registrationNumber: registrationNumber || null,
      };
      const changed = current.fullName !== data.fullName ||
        current.collegeName !== data.collegeName ||
        current.collegeCode !== data.collegeCode ||
        current.postalPin !== data.postalPin ||
        current.branchName !== data.branchName ||
        current.branchCode !== data.branchCode ||
        current.registrationNumber !== data.registrationNumber;

      if (!changed) {
        return res.json({
          ok: true,
          changed: false,
          message: "No profile changes were made.",
          profile: {
            id: current.id,
            fullName: current.fullName,
            collegeName: current.collegeName,
            collegeCode: current.collegeCode,
            postalPin: current.postalPin,
            branchName: current.branchName,
            branchCode: current.branchCode,
            registrationNumber: current.registrationNumber,
          },
        });
      }

      const profile = await db.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: current.id },
          data: { ...data, sessionVersion: { increment: 1 } },
          select: { id: true, fullName: true, collegeName: true, collegeCode: true, postalPin: true, branchName: true, branchCode: true, registrationNumber: true },
        });
        await tx.authSession.updateMany({
          where: { userId: current.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
        return updated;
      });
      clearSessionCookie(res);
      res.json({
        ok: true,
        changed: true,
        message: "Settings changed successfully. Please log in again.",
        profile,
        requiresReauthentication: true,
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return next(conflict("That diploma registration number is already connected to another account."));
      }
      next(error);
    }
  });

  router.post("/devices/register", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = DeviceSchema.parse(req.body);
      const device = await db.device.upsert({
        where: {
          userId_fingerprint: {
            userId: req.user!.id,
            fingerprint: input.fingerprint,
          },
        },
        create: { ...input, userId: req.user!.id },
        update: { ...input, revokedAt: null, lastSeenAt: new Date() },
        select: {
          id: true,
          deviceName: true,
          platform: true,
          createdAt: true,
          lastSeenAt: true,
        },
      });
      res.status(200).json({ ok: true, device });
    } catch (error) {
      next(error);
    }
  });

  router.get("/devices", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const devices = await db.device.findMany({
        where: { userId: req.user!.id, revokedAt: null },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true, deviceName: true, platform: true, createdAt: true, lastSeenAt: true },
      });
      res.json({ ok: true, devices });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/devices/:id", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const result = await db.device.updateMany({
        where: { id: req.params.id, userId: req.user!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return next(notFound("Device not found."));
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });



  router.post("/2fa/totp/setup", requireAuth, requireRecentAuth(), async (req: AuthedRequest, res, next) => {
    try {
      const existing = await db.totpCredential.findUnique({ where: { userId: req.user!.id } });
      if (existing?.enabledAt) return next(conflict("Authenticator is already enabled. Disable it before re-enrolling."));
      const secret = generateTotpSecret();
      const encrypted = encryptTotpSecret(secret);
      await db.totpCredential.upsert({
        where: { userId: req.user!.id },
        create: { userId: req.user!.id, secretEncrypted: encrypted },
        update: { secretEncrypted: encrypted, enabledAt: null, recoveryCodesJson: "[]", lastUsedCounter: -1 },
      });
      const account = encodeURIComponent(req.user!.email);
      const issuer = encodeURIComponent("ArcTester");
      const uri = `otpauth://totp/${issuer}:${account}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
      res.json({ ok: true, secret, otpauthUri: uri });
    } catch (error) { next(error); }
  });

  router.post("/2fa/totp/verify-setup", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ code: z.string().regex(/^\d{6}$/) }).parse(req.body);
      const credential = await db.totpCredential.findUnique({ where: { userId: req.user!.id } });
      if (!credential || credential.enabledAt) return next(badRequest("Start authenticator setup first."));
      const secret = decryptTotpSecret(credential.secretEncrypted);
      const counter = verifyTotp(secret, input.code);
      if (counter === null) return next(badRequest("The authenticator code is incorrect or expired."));
      const recoveryCodes = generateRecoveryCodes();
      await db.totpCredential.update({ where: { userId: req.user!.id }, data: { enabledAt: new Date(), lastUsedCounter: counter, recoveryCodesJson: JSON.stringify(recoveryCodes.map(hashRecoveryCode)) } });
      res.json({ ok: true, enabled: true, recoveryCodes, message: "Save these recovery codes now. Each code can be used once." });
    } catch (error) { next(error); }
  });

  router.get("/2fa/status", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const [totp, passkeyCount] = await Promise.all([
        db.totpCredential.findUnique({ where: { userId: req.user!.id }, select: { enabledAt: true, recoveryCodesJson: true } }),
        db.passkeyCredential.count({ where: { userId: req.user!.id } }),
      ]);
      const recoveryCodesRemaining = totp?.enabledAt ? (JSON.parse(totp.recoveryCodesJson) as string[]).length : 0;
      res.json({ ok: true, authenticatorEnabled: Boolean(totp?.enabledAt), recoveryCodesRemaining, passkeyCount });
    } catch (error) { next(error); }
  });

  router.post("/2fa/totp/disable", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ password: z.string().min(1).max(128), code: z.string().min(6).max(32) }).parse(req.body);
      const user = await db.user.findUnique({ where: { id: req.user!.id }, select: { passwordHash: true } });
      const credential = await db.totpCredential.findUnique({ where: { userId: req.user!.id } });
      if (!user || !await verifyPasswordAsync(input.password, user.passwordHash)) return next(forbidden("Password is incorrect."));
      if (!credential?.enabledAt) return next(badRequest("Authenticator is not enabled."));
      const secret = decryptTotpSecret(credential.secretEncrypted);
      const counter = verifyTotp(secret, input.code, Date.now(), credential.lastUsedCounter);
      const recovery = (JSON.parse(credential.recoveryCodesJson) as string[]).map(hash => hash === hashRecoveryCode(input.code));
      if (counter === null && !recovery.some(Boolean)) return next(forbidden("Authenticator or recovery code is incorrect."));
      await db.$transaction([
        db.totpCredential.delete({ where: { userId: req.user!.id } }),
        db.user.update({ where: { id: req.user!.id }, data: { sessionVersion: { increment: 1 } } }),
        db.authSession.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
      res.json({ ok: true, message: "Two-step verification disabled. Sign in again on your devices." });
    } catch (error) { next(error); }
  });

  const completeTotpLogin = (nativeClient: boolean) => async (req: Request, res: Response, next: NextFunction) => {
    try {
      const input = z.object({ challengeId: z.string().min(20).max(100), code: z.string().min(6).max(32) }).parse(req.body);
      const challenge = await db.authChallenge.findUnique({ where: { challenge: sha256(input.challengeId) } });
      if (!challenge || challenge.purpose !== "totp-login" || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return next(forbidden("The verification request expired. Sign in again."));
      const attempt = await db.authChallenge.updateMany({
        where: { id: challenge.id, purpose: "totp-login", attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      });
      if (attempt.count !== 1) return next(forbidden("The verification request expired. Sign in again."));
      const credential = await db.totpCredential.findUnique({ where: { userId: challenge.userId } });
      const user = await db.user.findUnique({ where: { id: challenge.userId } });
      if (!credential?.enabledAt || !user || user.accessStatus !== "APPROVED") return next(forbidden("Two-step verification is unavailable for this account."));
      const secret = decryptTotpSecret(credential.secretEncrypted);
      const counter = verifyTotp(secret, input.code, Date.now(), credential.lastUsedCounter);
      let valid = counter !== null;
      if (counter !== null) {
        const updated = await db.totpCredential.updateMany({ where: { id: credential.id, lastUsedCounter: { lt: counter } }, data: { lastUsedCounter: counter } });
        valid = updated.count === 1;
      } else {
        const recovery = JSON.parse(credential.recoveryCodesJson) as string[];
        const hash = hashRecoveryCode(input.code);
        const index = recovery.indexOf(hash);
        if (index >= 0) {
          recovery.splice(index, 1);
          // Compare-and-swap prevents two concurrent requests consuming the
          // same one-time recovery code successfully.
          const consumed = await db.totpCredential.updateMany({
            where: { id: credential.id, recoveryCodesJson: credential.recoveryCodesJson },
            data: { recoveryCodesJson: JSON.stringify(recovery) },
          });
          valid = consumed.count === 1;
        }
      }
      if (!valid) {
        await db.authChallenge.deleteMany({ where: { id: challenge.id, attempts: { gte: 5 } } });
        return next(forbidden("Authenticator or recovery code is incorrect."));
      }
      await db.authChallenge.delete({ where: { id: challenge.id } });
      await recordLoginEvent(db, req, user.email, user.id, "success", "password+totp");
      const { token } = await createAuthSession(db, req, user, "password+totp");
      if (!nativeClient) setSessionCookie(res, token);
      res.json({ ok: true, ...(nativeClient ? { token, tokenType: "Bearer", expiresIn: JWT_TTL_SECONDS } : {}), user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, collegeName: user.collegeName, collegeCode: user.collegeCode, postalPin: user.postalPin, branchName: user.branchName, branchCode: user.branchCode, registrationNumber: user.registrationNumber } });
    } catch (error) { next(error); }
  };
  router.post("/login/2fa", completeTotpLogin(false));
  router.post("/token/2fa", completeTotpLogin(true));


  function passkeyOrigin(req: Request): { origin: string; rpId: string } {
    const origin = String(req.headers.origin ?? "");
    const configured = (process.env.CORS_ORIGINS ?? "").split(",").map(value => value.trim()).filter(Boolean);
    const parsedOrigin = origin ? new URL(origin) : null;
    const localDevOrigin = process.env.NODE_ENV !== "production" && Boolean(parsedOrigin && parsedOrigin.hostname === "localhost");
    if (!origin || (!configured.includes(origin) && !localDevOrigin)) throw forbidden("This origin is not configured for passkey sign-in.");
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && parsed.hostname === "localhost")) throw forbidden("Passkeys require a secure origin.");
    return { origin, rpId: parsed.hostname };
  }

  router.post("/passkeys/register/options", requireAuth, requireRecentAuth(), async (req: AuthedRequest, res, next) => {
    try {
      const { rpId } = passkeyOrigin(req);
      const user = await db.user.findUnique({ where: { id: req.user!.id }, select: { id: true, email: true, fullName: true } });
      if (!user) return next(notFound("Account not found."));
      const challenge = createWebAuthnChallenge();
      await db.authChallenge.create({ data: { userId: user.id, challenge: sha256(challenge), purpose: "passkey-register", expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
      const existing = await db.passkeyCredential.findMany({ where: { userId: user.id }, select: { credentialId: true } });
      res.json({ ok: true, publicKey: { challenge, rp: { name: "ArcTester", id: rpId }, user: { id: base64urlEncode(Buffer.from(String(user.id))), name: user.email, displayName: user.fullName ?? user.email }, pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }], timeout: 300000, attestation: "none", authenticatorSelection: { residentKey: "preferred", userVerification: "required" }, excludeCredentials: existing.map(item => ({ type: "public-key", id: item.credentialId })) } });
    } catch (error) { next(error); }
  });

  router.post("/passkeys/register/verify", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const input = z.object({ challenge: z.string().min(20), credentialId: z.string().min(8), clientDataJSON: z.string().min(20), attestationObject: z.string().min(20), name: z.string().trim().min(1).max(80).optional(), transports: z.array(z.string().max(32)).max(8).optional() }).parse(req.body);
      const { origin, rpId } = passkeyOrigin(req);
      const challenge = await db.authChallenge.findUnique({ where: { challenge: sha256(input.challenge) } });
      if (!challenge || challenge.userId !== req.user!.id || challenge.purpose !== "passkey-register" || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return next(forbidden("Passkey setup expired. Start again."));
      const attempt = await db.authChallenge.updateMany({
        where: { id: challenge.id, userId: req.user!.id, purpose: "passkey-register", attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      });
      if (attempt.count !== 1) return next(forbidden("Passkey setup expired. Start again."));
      verifyClientData(input.clientDataJSON, input.challenge, origin, "webauthn.create");
      const attested = parseNoneAttestation(input.attestationObject, rpId);
      if (attested.credentialId !== input.credentialId) return next(badRequest("Passkey credential ID does not match."));
      // Consume the challenge atomically before persisting a credential. Concurrent
      // registration submissions cannot attach multiple credentials to one challenge.
      const consumed = await db.authChallenge.deleteMany({
        where: { id: challenge.id, userId: req.user!.id, purpose: "passkey-register", expiresAt: { gt: new Date() }, attempts: { lte: 5 } },
      });
      if (consumed.count !== 1) return next(forbidden("Passkey setup expired. Start again."));
      const credential = await db.passkeyCredential.create({ data: { userId: req.user!.id, credentialId: attested.credentialId, publicKey: attested.publicKey, signCount: attested.signCount, name: input.name ?? "Passkey", transports: JSON.stringify(input.transports ?? []) } });
      res.status(201).json({ ok: true, passkey: { id: credential.id, name: credential.name, createdAt: credential.createdAt } });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return next(conflict("This passkey is already registered."));
      next(error);
    }
  });

  router.post("/passkeys/login/options", async (req, res, next) => {
    try {
      const input = z.object({ email: z.string().email().trim().toLowerCase() }).parse(req.body);
      const { rpId } = passkeyOrigin(req);
      const user = await db.user.findUnique({ where: { email: input.email }, select: { id: true, email: true } });
      if (!user) return next(badRequest("No passkeys are available for this account."));
      const credentials = await db.passkeyCredential.findMany({ where: { userId: user.id }, select: { credentialId: true, transports: true } });
      if (!credentials.length) return next(badRequest("No passkeys are available for this account."));
      const challenge = createWebAuthnChallenge();
      await db.authChallenge.create({ data: { userId: user.id, challenge: sha256(challenge), purpose: "passkey-login", expiresAt: new Date(Date.now() + 5 * 60 * 1000) } });
      res.json({ ok: true, challengeId: challenge, publicKey: { challenge, rpId, allowCredentials: credentials.map(item => ({ type: "public-key", id: item.credentialId, transports: JSON.parse(item.transports) as string[] })), timeout: 300000, userVerification: "required" } });
    } catch (error) { next(error); }
  });

  router.post("/passkeys/login/verify", async (req, res, next) => {
    try {
      const input = z.object({ challengeId: z.string().min(20), credentialId: z.string().min(8), clientDataJSON: z.string().min(20), authenticatorData: z.string().min(20), signature: z.string().min(8) }).parse(req.body);
      const { origin, rpId } = passkeyOrigin(req);
      const challenge = await db.authChallenge.findUnique({ where: { challenge: sha256(input.challengeId) } });
      if (!challenge || challenge.purpose !== "passkey-login" || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return next(forbidden("Passkey request expired. Start sign-in again."));
      const attempt = await db.authChallenge.updateMany({
        where: { id: challenge.id, purpose: "passkey-login", attempts: { lt: 5 }, expiresAt: { gt: new Date() } },
        data: { attempts: { increment: 1 } },
      });
      if (attempt.count !== 1) return next(forbidden("Passkey request expired. Start sign-in again."));
      const credential = await db.passkeyCredential.findUnique({ where: { credentialId: input.credentialId } });
      if (!credential || credential.userId !== challenge.userId) return next(forbidden("Passkey could not be verified."));
      verifyClientData(input.clientDataJSON, input.challengeId, origin, "webauthn.get");
      const counter = verifyPasskeyAssertion({ authenticatorData: input.authenticatorData, clientDataJSON: input.clientDataJSON, signature: input.signature, publicKey: credential.publicKey, expectedChallenge: input.challengeId, expectedOrigin: origin, rpId });
      if ((credential.signCount > 0 || counter > 0) && counter <= credential.signCount) return next(forbidden("Passkey counter did not advance. Use another passkey or contact support."));
      if (counter > 0) {
        const counterUpdate = await db.passkeyCredential.updateMany({ where: { id: credential.id, signCount: credential.signCount }, data: { signCount: counter, lastUsedAt: new Date() } });
        if (counterUpdate.count !== 1) return next(forbidden("Passkey was used concurrently or its counter changed. Try signing in again."));
      } else {
        await db.passkeyCredential.update({ where: { id: credential.id }, data: { lastUsedAt: new Date() } });
      }
      const user = await db.user.findUnique({ where: { id: challenge.userId } });
      if (!user || user.accessStatus !== "APPROVED") return next(forbidden("Account access is not approved."));
      const consumed = await db.authChallenge.deleteMany({
        where: { id: challenge.id, purpose: "passkey-login", expiresAt: { gt: new Date() }, attempts: { lte: 5 } },
      });
      if (consumed.count !== 1) return next(forbidden("Passkey request was already used. Start sign-in again."));
      await recordLoginEvent(db, req, user.email, user.id, "success", "passkey");
      const { token } = await createAuthSession(db, req, user, "passkey");
      setSessionCookie(res, token);
      res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role, fullName: user.fullName, collegeName: user.collegeName, collegeCode: user.collegeCode, postalPin: user.postalPin, branchName: user.branchName, branchCode: user.branchCode, registrationNumber: user.registrationNumber } });
    } catch (error) { next(error); }
  });

  router.get("/passkeys", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const passkeys = await db.passkeyCredential.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, select: { id: true, name: true, createdAt: true, lastUsedAt: true, transports: true } });
      res.json({ ok: true, passkeys: passkeys.map(item => ({ ...item, transports: JSON.parse(item.transports) as string[] })) });
    } catch (error) { next(error); }
  });

  router.delete("/passkeys/:id", requireAuth, requireRecentAuth(), async (req: AuthedRequest, res, next) => {
    try {
      const removed = await db.$transaction(async (tx) => {
        const result = await tx.passkeyCredential.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
        if (!result.count) return 0;
        await tx.user.update({ where: { id: req.user!.id }, data: { sessionVersion: { increment: 1 } } });
        await tx.authSession.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
        return result.count;
      });
      if (!removed) return next(notFound("Passkey not found."));
      res.json({ ok: true, message: "Passkey removed. Sign in again on your devices." });
    } catch (error) { next(error); }
  });

  router.get("/sessions", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const token = readSessionToken(req);
      let currentId = "";
      if (token) {
        try {
          const payload = verifyJwt(token);
          currentId = String(payload.sid ?? "");
          if (!currentId) {
            currentId = "legacy-" + req.user!.id + "-" + sha256(token).slice(0, 20);
            const device = requestDevice(req);
            await db.authSession.upsert({
              where: { id: currentId },
              create: { id: currentId, userId: req.user!.id, ...device, loginMethod: "legacy-session", createdAt: new Date(Number(payload.iat ?? nowSeconds()) * 1000), expiresAt: new Date(Number(payload.exp) * 1000) },
              update: { lastSeenAt: new Date() },
            });
          }
        } catch { /* requireAuth already validated */ }
      }
      const sessions = await db.authSession.findMany({
        where: { userId: req.user!.id, revokedAt: null, expiresAt: { gt: new Date() } },
        orderBy: { lastSeenAt: "desc" },
        select: { id: true, deviceName: true, platform: true, loginMethod: true, ipAddress: true, createdAt: true, lastSeenAt: true, expiresAt: true },
      });
      res.json({ ok: true, sessions: sessions.map(session => ({ ...session, current: session.id === currentId })) });
    } catch (error) { next(error); }
  });

  router.delete("/sessions/:id", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const result = await db.authSession.updateMany({
        where: { id: req.params.id, userId: req.user!.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (result.count === 0) return next(notFound("Session not found or already revoked."));
      res.json({ ok: true, message: "Session revoked." });
    } catch (error) { next(error); }
  });

  router.post("/sessions/revoke-all", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      await db.authSession.updateMany({ where: { userId: req.user!.id, revokedAt: null }, data: { revokedAt: new Date() } });
      await db.user.update({ where: { id: req.user!.id }, data: { sessionVersion: { increment: 1 } } });
      res.json({ ok: true, message: "All sessions revoked. Sign in again on this device." });
    } catch (error) { next(error); }
  });

  router.get("/login-history", requireAuth, async (req: AuthedRequest, res, next) => {
    try {
      const events = await db.loginEvent.findMany({
        where: { userId: req.user!.id },
        orderBy: { createdAt: "desc" },
        take: 50,
        select: { id: true, email: true, result: true, method: true, ipAddress: true, userAgent: true, createdAt: true },
      });
      res.json({ ok: true, events });
    } catch (error) { next(error); }
  });

  return router;
}
