// Authentication uses HMAC-SHA256 JWTs and Node's built-in scrypt password hashing.
// Student registration is invitation-only. Privileged operations re-check the
// current database role instead of trusting a role claim in a client token.

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { createHash, createHmac, randomBytes, scrypt, scryptSync, timingSafeEqual } from "node:crypto";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import type { PrismaClient } from "@prisma/client";

const DEVELOPMENT_JWT_SECRET = "dev-secret-change-me-in-production";
const JWT_SECRET = process.env.JWT_SECRET ?? (process.env.NODE_ENV === "production" ? "" : DEVELOPMENT_JWT_SECRET);
const COOKIE_NAME = "ecet_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

  const payload = JSON.parse(parseBase64Url(body).toString("utf8")) as Record<string, unknown>;
  if (typeof payload.exp === "number" && payload.exp <= nowSeconds()) {
    throw new Error("expired token");
  }
  return payload;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = scryptSync(password, salt, 64);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

function scryptAsync(password: string | Buffer, salt: string | Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (error, derived) => {
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

export const RegisterSchema = z.object({
  email: z.string().email("Enter a valid email address.").trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters.").max(128),
  invitationToken: z.string().min(32).max(256),
});

export const LoginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

const InvitationSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
});

const DeviceSchema = z.object({
  deviceName: z.string().trim().min(1).max(100),
  platform: z.enum(["web", "android", "ios", "windows"]),
  fingerprint: z.string().trim().min(16).max(128),
});

// Login throttling is keyed by client IP *and* target email:
// - the ip+email bucket stops one IP from guessing one account's password
//   without letting a different IP lock that account out;
// - the ip-only bucket bounds brute force from a single source so one IP
//   cannot exhaust the shared failure map or hammer many accounts.
// Both buckets are process-local (not a distributed limiter), matching the
// existing best-effort throttle.
const LOGIN_FAILURE_LIMIT = 8;
const IP_FAILURE_LIMIT = 20;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map<string, { count: number; windowStartedAt: number; blockedUntil: number }>();

function loginBucketKey(ip: string, email?: string): string {
  return email ? `${ip}::${email.toLowerCase()}` : `ip-only::${ip}`;
}

function loginRetryAfter(key: string, now = Date.now()): number {
  const bucket = loginFailures.get(key);
  if (!bucket) return 0;
  if (now - bucket.windowStartedAt >= LOGIN_FAILURE_WINDOW_MS && bucket.blockedUntil <= now) {
    loginFailures.delete(key);
    return 0;
  }
  return bucket.blockedUntil > now ? Math.ceil((bucket.blockedUntil - now) / 1000) : 0;
}

function recordLoginFailure(key: string, now = Date.now()): number {
  let bucket = loginFailures.get(key);
  if (!bucket || now - bucket.windowStartedAt >= LOGIN_FAILURE_WINDOW_MS) {
    bucket = { count: 0, windowStartedAt: now, blockedUntil: 0 };
  }
  bucket.count += 1;
  const limit = key.startsWith("ip-only::") ? IP_FAILURE_LIMIT : LOGIN_FAILURE_LIMIT;
  if (bucket.count >= limit) bucket.blockedUntil = now + LOGIN_FAILURE_WINDOW_MS;
  loginFailures.set(key, bucket);

  if (loginFailures.size > 5000) {
    for (const [bucketKey, value] of loginFailures) {
      if (now - value.windowStartedAt >= LOGIN_FAILURE_WINDOW_MS && value.blockedUntil <= now) loginFailures.delete(bucketKey);
    }
    while (loginFailures.size > 5000) {
      const oldestKey = loginFailures.keys().next().value;
      if (oldestKey === undefined) break;
      loginFailures.delete(oldestKey);
    }
  }
  return loginRetryAfter(key, now);
}

function clearLoginFailures(ip: string, email?: string): void {
  loginFailures.delete(loginBucketKey(ip, email));
  loginFailures.delete(loginBucketKey(ip));
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
      select: { email: true, sessionVersion: true },
    });
    if (!user || user.email !== email || user.sessionVersion !== sessionVersion) {
      return next(forbidden("This session has been revoked. Sign in again."));
    }
    req.user = { id, email };
    next();
  } catch (error) {
    next(error);
  }
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
  return secure && process.env.COOKIE_SAME_SITE?.toLowerCase() === "none" ? "None" : "Lax";
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

  router.post("/register", async (req, res, next) => {
    try {
      const input = RegisterSchema.parse(req.body);
      const tokenHash = sha256(input.invitationToken);
      const passwordHash = await hashPasswordAsync(input.password);
      const now = new Date();

      const user = await db.$transaction(async (tx) => {
        const invitation = await tx.invitation.findUnique({ where: { tokenHash } });
        if (
          !invitation ||
          invitation.email !== input.email ||
          invitation.usedAt ||
          invitation.revokedAt ||
          invitation.expiresAt <= now
        ) {
          throw badRequest("This invitation is invalid, expired, or already used.");
        }

        const existing = await tx.user.findUnique({ where: { email: input.email } });
        if (existing) throw conflict("An account with that email already exists.");

        const claimed = await tx.invitation.updateMany({
          where: {
            id: invitation.id,
            usedAt: null,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          data: { usedAt: now },
        });
        if (claimed.count !== 1) {
          throw badRequest("This invitation is invalid, expired, or already used.");
        }

        return tx.user.create({
          data: {
            email: input.email,
            passwordHash,
            role: "STUDENT",
          },
          select: { id: true, email: true, role: true },
        });
      });

      res.status(201).json({
        ok: true,
        message: "Account created. Sign in to continue.",
        user,
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/login", async (req, res, next) => {
    try {
      const input = LoginSchema.parse(req.body);
      const ip = req.ip ?? "unknown";
      const emailKey = loginBucketKey(ip, input.email);
      const ipKey = loginBucketKey(ip);
      const retryAfter = Math.max(loginRetryAfter(emailKey), loginRetryAfter(ipKey));
      if (retryAfter > 0) return rejectThrottledLogin(res, retryAfter);
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !await verifyPasswordAsync(input.password, user.passwordHash)) {
        recordLoginFailure(emailKey);
        recordLoginFailure(ipKey);
        const blockedFor = Math.max(loginRetryAfter(emailKey), loginRetryAfter(ipKey));
        if (blockedFor > 0) return rejectThrottledLogin(res, blockedFor);
        return next(badRequest("Invalid email or password."));
      }
      clearLoginFailures(ip, input.email);
      const token = signJwt({ sub: String(user.id), email: user.email, sv: user.sessionVersion });
      setSessionCookie(res, token);
      res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
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
      const retryAfter = Math.max(loginRetryAfter(emailKey), loginRetryAfter(ipKey));
      if (retryAfter > 0) return rejectThrottledLogin(res, retryAfter);
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !await verifyPasswordAsync(input.password, user.passwordHash)) {
        recordLoginFailure(emailKey);
        recordLoginFailure(ipKey);
        const blockedFor = Math.max(loginRetryAfter(emailKey), loginRetryAfter(ipKey));
        if (blockedFor > 0) return rejectThrottledLogin(res, blockedFor);
        return next(badRequest("Invalid email or password."));
      }
      clearLoginFailures(ip, input.email);
      const token = signJwt({ sub: String(user.id), email: user.email, sv: user.sessionVersion });
      res.json({
        ok: true,
        token,
        tokenType: "Bearer",
        expiresIn: JWT_TTL_SECONDS,
        user: { id: user.id, email: user.email, role: user.role },
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
          if (Number.isSafeInteger(userId) && userId > 0 &&
              Number.isSafeInteger(sessionVersion) && sessionVersion >= 0) {
            // Only revoke tokens from the version presented by this request.
            // Replaying logout cannot invalidate a later sign-in.
            await db.user.updateMany({
              where: { id: userId, sessionVersion },
              data: { sessionVersion: { increment: 1 } },
            });
          }
        }
      }
      clearSessionCookie(res);
      res.json({ ok: true, message: "Signed out. Existing sessions were revoked." });
    } catch (error) {
      next(error);
    }
  });

  router.get("/me", async (req, res, next) => {
    const token = readSessionToken(req);
    if (!token) return next(forbidden("Not signed in."));
    try {
      const payload = verifyJwt(token);
      const user = await db.user.findUnique({
        where: { id: Number(payload.sub) },
        select: { id: true, email: true, role: true, sessionVersion: true },
      });
      const sessionVersion = payload.sv === undefined ? 0 : Number(payload.sv);
      if (!user || !Number.isSafeInteger(sessionVersion) || user.sessionVersion !== sessionVersion) {
        return next(forbidden("This session has been revoked. Sign in again."));
      }
      res.json({ ok: true, user });
    } catch {
      next(forbidden("Invalid session."));
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

  return router;
}
