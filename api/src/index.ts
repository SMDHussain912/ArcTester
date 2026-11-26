import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { errorHandler, notFound } from "./errors.js";
import { testRouter } from "./testRoutes.js";
import { authRouter } from "./auth.js";
import { examRouter } from "./examRoutes.js";
import { questionRouter } from "./questionRoutes.js";
import { sessionRouter } from "./sessionRoutes.js";
import { submissionRouter } from "./submissionRoutes.js";
import { questionAdminRouter } from "./questionAdminRoutes.js";
import { announcementRouter } from "./announcementRoutes.js";
import { studyMaterialRouter } from "./studyMaterialRoutes.js";
import { conceptLibraryRouter } from "./conceptLibraryRoutes.js";
import { lessonGenerationRouter } from "./lessonGenerationRoutes.js";
import { lessonCatalogRouter } from "./lessonCatalogRoutes.js";
import { lessonPackageAdminRouter } from "./lessonPackageAdminRoutes.js";
import { learningPathRouter } from "./learningPathRoutes.js";
import { gamificationRouter } from "./gamificationRoutes.js";
import { masteryRouter } from "./masteryRoutes.js";
import { studentMcpRouter } from "./studentMcpRoutes.js";
import { adminMcpRouter } from "./adminMcpRoutes.js";
import { modelInferenceRouter } from "./modelInferenceRoutes.js";
import { isTrustedCookieMutation } from "./csrf.js";
import { adminInstitutionRouter } from "./adminInstitutionRoutes.js";
import { adminStudentRouter } from "./adminStudentRoutes.js";
import { auditRequestMiddleware } from "./audit.js";
import { studentAuditRouter } from "./studentAuditRoutes.js";
import { validateProductionSecurityConfig } from "./securityConfig.js";


const db = new PrismaClient();

// Shared atomic request limiting in PostgreSQL; works across API instances.
// Store only a SHA-256 digest of the client IP, not the IP itself.
const API_LIMIT = 300;
const apiBucketHash = (ip: string) => "api:" + createHash("sha256").update(ip || "unknown").digest("hex");
let apiLimiterCleanupCounter = 0;
function sharedApiRateLimit(database: PrismaClient): express.RequestHandler {
  return async (req, res, next) => {
    // Keep liveness/readiness semantics independent of the rate-limit table.
    if (req.path === "/health" || req.path === "/ready" || req.method === "OPTIONS") return next();
    try {
      const bucketKey = apiBucketHash(req.ip ?? "unknown");
      const rows = await database.$queryRaw<Array<{ count: number; blockedUntil: Date | null; retryAfterSeconds: number }>>`
        INSERT INTO auth_rate_limit_buckets (bucket_key, failure_count, window_started_at, blocked_until, updated_at)
        VALUES (${bucketKey}, 1, NOW(), NULL, NOW())
        ON CONFLICT (bucket_key) DO UPDATE SET
          failure_count = CASE WHEN auth_rate_limit_buckets.window_started_at <= NOW() - INTERVAL '15 minutes' THEN 1 ELSE auth_rate_limit_buckets.failure_count + 1 END,
          window_started_at = CASE WHEN auth_rate_limit_buckets.window_started_at <= NOW() - INTERVAL '15 minutes' THEN NOW() ELSE auth_rate_limit_buckets.window_started_at END,
          blocked_until = CASE
            WHEN auth_rate_limit_buckets.window_started_at <= NOW() - INTERVAL '15 minutes' THEN NULL
            WHEN auth_rate_limit_buckets.failure_count + 1 > ${API_LIMIT} THEN COALESCE(auth_rate_limit_buckets.blocked_until, NOW() + INTERVAL '15 minutes')
            ELSE auth_rate_limit_buckets.blocked_until
          END,
          updated_at = NOW()
        RETURNING failure_count AS count, blocked_until AS "blockedUntil",
          CASE WHEN blocked_until IS NULL THEN GREATEST(0, CEIL(EXTRACT(EPOCH FROM (window_started_at + INTERVAL '15 minutes' - NOW()))))::int
               ELSE GREATEST(0, CEIL(EXTRACT(EPOCH FROM (blocked_until - NOW()))))::int END AS "retryAfterSeconds"
      `;
      const row = rows[0];
      if (!row) return next(new Error("Shared API rate limiter did not return a bucket."));
      res.setHeader("RateLimit-Limit", String(API_LIMIT));
      res.setHeader("RateLimit-Remaining", String(Math.max(0, API_LIMIT - row.count)));
      res.setHeader("RateLimit-Reset", String(row.retryAfterSeconds));
      if (row.count > API_LIMIT || (row.blockedUntil && row.blockedUntil.getTime() > Date.now())) {
        const retryAfter = Math.max(1, row.retryAfterSeconds);
        res.setHeader("Retry-After", String(retryAfter));
        return res.status(429).json({ error: "Too many requests. Try again later." });
      }
      apiLimiterCleanupCounter += 1;
      if (apiLimiterCleanupCounter % 100 === 0) {
        void database.$executeRaw`DELETE FROM auth_rate_limit_buckets WHERE updated_at < NOW() - INTERVAL '1 day'`.catch(() => undefined);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Minimal CORS. In production only exact configured origins are allowed;
 * localhost/loopback is permitted outside production for local development.
 */
function localCors(
  _req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  const origin = _req.headers.origin ?? "";
  const configuredOrigins = new Set(
    (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const isLocalOrigin =
    process.env.NODE_ENV !== "production" &&
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  if (origin && (isLocalOrigin || configuredOrigins.has(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    // "authorization" is needed by native/mobile clients that send a bearer
    // token instead of relying on the cookie.
    res.setHeader("Access-Control-Allow-Headers", "content-type,authorization");
    // The session lives in an httpOnly cookie, so the browser must be allowed
    // to send credentials cross-origin. Without this the cookie is dropped.
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}


/**
 * SameSite=None is needed when the Vite frontend and API are hosted on
 * different sites (for example Vercel + Render). In that mode, require a
 * trusted Origin for every state-changing request authenticated by the
 * browser cookie. Native clients use bearer tokens and do not depend on CORS.
 */
function cookieCsrfGuard(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  if (process.env.NODE_ENV !== "production") return next();
  const allowedOrigins = new Set(
    (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean)
  );
  if (!isTrustedCookieMutation({
    method: req.method,
    origin: req.headers.origin,
    authorization: req.headers.authorization,
    cookie: req.headers.cookie,
  }, allowedOrigins)) {
    res.status(403).json({ error: "This browser request origin is not allowed." });
    return;
  }
  next();
}

export function buildApp(database: PrismaClient = db): express.Express {
  validateProductionSecurityConfig();
  const app = express();
  // requireAuth resolves the same injected client used by every router and test schema.
  app.locals.db = database;
  const trustProxyHops = Number(process.env.TRUST_PROXY_HOPS ?? 1);
  if (!Number.isSafeInteger(trustProxyHops) || trustProxyHops < 0 || trustProxyHops > 10) {
    throw new Error("TRUST_PROXY_HOPS must be an integer from 0 to 10 and match the deployed proxy chain.");
  }
  app.set("trust proxy", trustProxyHops);
  // Morgan request logs expose route, status, latency and origin without logging
  // cookies, bearer tokens, request bodies or query-string secrets.
  morgan.token("route", (req) => req.path);
  app.use(morgan(":method :route :status :response-time ms origin=:req[origin]", {
    skip: (req) => req.path === "/health" || req.path === "/ready",
  }));
  // Keep Helmet's default security headers, including CSP and SAMEORIGIN
  // framing protection. This API does not need to serve embeddable HTML.
  app.use(helmet());
  app.use(localCors);
  app.use(sharedApiRateLimit(database));
  // Keep the bulk import endpoints on their route-specific parsers. Prepared
  // lesson audio is base64 JSON (up to 12 MiB decoded), so parse it here with
  // enough headroom for the encoded payload; ordinary API requests stay at 1 MiB.
  app.use((req, res, next) => {
    if (req.path === "/admin/questions/import" || req.path === "/analytics/import" || req.path === "/mcp/student" || req.path === "/mcp/admin" || req.path === "/student/private-questions/import") {
      return next();
    }
    const isLessonAudioUpload = /^\/admin\/lesson-drafts\/[^/]+\/scenes\/\d+\/audio$/.test(req.path);
    express.json({ limit: isLessonAudioUpload ? "18mb" : "1mb" })(req, res, next);
  });
  app.use(cookieCsrfGuard);
  app.use(auditRequestMiddleware(database));

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ecet-api", time: new Date().toISOString() });
  });

  // Readiness is distinct from liveness: only report ready when the active
  // database connection can execute a trivial query.
  app.get("/ready", async (_req, res) => {
    try {
      await database.$queryRaw`SELECT 1`;
      res.json({ ok: true, service: "ecet-api", database: "ready", time: new Date().toISOString() });
    } catch {
      res.status(503).json({ ok: false, service: "ecet-api", database: "unavailable" });
    }
  });

  app.use(testRouter(database));
  app.use("/auth", authRouter(database));
  // sessionRoutes must mount before examRoutes so that /admin/exams/live-sessions
  // and /admin/exams/attendance are matched before the /admin/exams/:id param route.
  app.use(sessionRouter(database));
  // Audit timeline/export endpoints must be registered before the generic student :id routes.
  app.use(studentAuditRouter(database));
  // Student administration routes must precede exam routes, which retain legacy
  // /admin/students handlers for backwards compatibility.
  app.use(adminStudentRouter(database));
  app.use(examRouter(database));
  app.use(questionRouter(database));
  app.use(submissionRouter(database));
  app.use(questionAdminRouter(database));
  app.use(announcementRouter(database));
  app.use(studyMaterialRouter(database));
  app.use(conceptLibraryRouter(database));
  app.use(lessonGenerationRouter(database));
  app.use(lessonCatalogRouter(database));
  app.use(lessonPackageAdminRouter(database));
  app.use(learningPathRouter(database));
  app.use(gamificationRouter(database));
  app.use(masteryRouter(database));
  app.use(studentMcpRouter(database));
  app.use(adminInstitutionRouter(database));
  app.use(adminMcpRouter(database));
  app.use(modelInferenceRouter(database));

  app.use((_req, _res, next) => next(notFound("That page does not exist.")));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  const server = app.listen(PORT, () => {
    console.log(`ecet-api listening on http://localhost:${PORT}`);
  });
  let shutdownStarted = false;
  const shutdown = (signal: string) => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    console.log(`ecet-api received ${signal}; draining requests`);
    server.close((error) => {
      if (error) {
        console.error("ecet-api HTTP shutdown failed", error);
        process.exitCode = 1;
      }
      void db.$disconnect().catch((disconnectError: unknown) => {
        console.error("ecet-api database disconnect failed", disconnectError);
        process.exitCode = 1;
      });
    });
    server.closeIdleConnections?.();
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
}

export default app;
