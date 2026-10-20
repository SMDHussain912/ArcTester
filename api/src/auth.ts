// Auth module — zero new libraries. JWT signed with Node's built-in crypto
// (HMAC-SHA256, base64url), passwords hashed with scrypt. Sessions are
// httpOnly cookies so the API never leaks a bearer token to localStorage.

import type { NextFunction, Request, Response } from "express";
import { Router } from "express";
import { z } from "zod";
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { badRequest, conflict, forbidden } from "./errors.js";
import type { PrismaClient } from "@prisma/client";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me-in-production";
const COOKIE_NAME = "ecet_session";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days, in seconds
const JWT_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days, in seconds

// A production deployment must supply its own secret; the dev fallback would
// otherwise let anyone forge a session cookie.
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

/** Sign a JWT payload (header + payload signed with HMAC-SHA256). */
export function signJwt(
  payload: Record<string, unknown>,
  ttlSeconds: number = JWT_TTL_SECONDS
): string {
  const header = base64Url(Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const body = base64Url(
    Buffer.from(JSON.stringify({ ...payload, iat: nowSeconds(), exp: nowSeconds() + ttlSeconds }))
  );
  const sig = createHmac("sha256", JWT_SECRET)
    .update(`${header}.${body}`)
    .digest("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return `${header}.${body}.${sig}`;
}

/**
 * Verify a JWT and return its payload, or throw.
 * Checks shape, signature length, signature, and expiry before trusting it.
 */
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

  // timingSafeEqual throws when the buffers differ in length, so compare the
  // decoded signatures only after confirming they are the same size.
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

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Hash a password with scrypt + random 16-byte salt. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const derived = scryptSync(password, salt, 64);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Verify a plaintext password against a stored hash. */
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
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .max(128, "Password is too long."),
});

export const LoginSchema = z.object({
  email: z.string().email().trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

export interface AuthedRequest extends Request {
  user?: { id: number; email: string };
}

/**
 * Pull the session token out of a request.
 *
 * Two sources are accepted:
 *  - the httpOnly cookie (the web app),
 *  - `Authorization: Bearer <jwt>` (native mobile apps, which have no cookie
 *    jar and would otherwise have to keep the token in plain storage).
 *
 * The cookie wins when both are present, so the web app can never be
 * downgraded to a weaker transport by accident.
 */
export function readSessionToken(req: Request): string | null {
  const cookieToken = getCookie(req, COOKIE_NAME);
  if (cookieToken) return cookieToken;

  const header = req.headers.authorization;
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

/** Middleware: require a valid session (cookie or bearer token). */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = readSessionToken(req);
  if (!token) return next(forbidden("Sign in before using the test engine."));
  try {
    const payload = verifyJwt(token);
    req.user = { id: Number(payload.sub), email: String(payload.email) };
    next();
  } catch {
    next(forbidden("Invalid or expired session. Sign in again."));
  }
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

  router.post("/register", async (req, res, next) => {
    try {
      const input = RegisterSchema.parse(req.body);
      const existing = await db.user.findUnique({ where: { email: input.email } });
      if (existing) return next(conflict("An account with that email already exists."));
      await db.user.create({
        data: { email: input.email, passwordHash: hashPassword(input.password) },
      });
      res.status(201).json({ ok: true, message: "Account created. Sign in to continue." });
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
      res.json({ ok: true, user: { id: user.id, email: user.email } });
    } catch (error) {
      next(error);
    }
  });

  // Same as /login, but returns the JWT in the body instead of only setting a
  // cookie. Native mobile apps have no cookie jar, so they send the token
  // back as `Authorization: Bearer <jwt>`. The web app never uses this.
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
        user: { id: user.id, email: user.email },
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
        select: { id: true, email: true },
      });
      if (!user) return next(forbidden("Account not found."));
      res.json({ ok: true, user });
    } catch {
      next(forbidden("Invalid session."));
    }
  });

  return router;
}
