// Authentication uses HMAC-SHA256 JWTs and Node's built-in scrypt password hashing.
// Student registration is invitation-only. Privileged operations re-check the
// current database role instead of trusting a role claim in a client token.

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { badRequest, conflict, forbidden, notFound } from "./errors.js";
import type { PrismaClient } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-in-production";
const COOKIE_NAME = "ecet_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60;
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60;
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  throw new Error("JWT_SECRET must be set in production.");
}

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

export function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction): void {
  const token = readSessionToken(req);
  if (!token) return next(forbidden("Sign in before using ArcTester."));
  try {
    const payload = verifyJwt(token);
    const id = Number(payload.sub);
    const email = String(payload.email ?? "");
    if (!Number.isSafeInteger(id) || id <= 0 || !email) {
      return next(forbidden("Invalid or expired session. Sign in again."));
    }
    req.user = { id, email };
    next();
  } catch {
    next(forbidden("Invalid or expired session. Sign in again."));
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

function setSessionCookie(res: Response, token: string): void {
  const secure = process.env.NODE_ENV === "production";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${token}; HttpOnly; Path=/; Max-Age=${COOKIE_MAX_AGE}; SameSite=Lax${
      secure ? "; Secure" : ""
    }`
  );
}

function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

export function authRouter(db: PrismaClient): Router {
  const router = Router();

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

  router.post(
    "/invitations/:id/revoke",
    requireAuth,
    requireAdmin(db),
    async (req, res, next) => {
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
            passwordHash: hashPassword(input.password),
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
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        return next(badRequest("Invalid email or password."));
      }
      const token = signJwt({ sub: String(user.id), email: user.email });
      setSessionCookie(res, token);
      res.json({ ok: true, user: { id: user.id, email: user.email, role: user.role } });
    } catch (error) {
      next(error);
    }
  });

  router.post("/token", async (req, res, next) => {
    try {
      const input = LoginSchema.parse(req.body);
      const user = await db.user.findUnique({ where: { email: input.email } });
      if (!user || !verifyPassword(input.password, user.passwordHash)) {
        return next(badRequest("Invalid email or password."));
      }
      const token = signJwt({ sub: String(user.id), email: user.email });
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

  router.post("/logout", (_req, res) => {
    clearSessionCookie(res);
    res.json({ ok: true, message: "Signed out." });
  });

  router.get("/me", async (req, res, next) => {
    const token = readSessionToken(req);
    if (!token) return next(forbidden("Not signed in."));
    try {
      const payload = verifyJwt(token);
      const user = await db.user.findUnique({
        where: { id: Number(payload.sub) },
        select: { id: true, email: true, role: true },
      });
      if (!user) return next(forbidden("Account not found."));
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
