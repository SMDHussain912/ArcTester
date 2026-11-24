import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import { PrismaClient } from "@prisma/client";
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
import { lessonGenerationRouter } from "./lessonGenerationRoutes.js";
import { lessonCatalogRouter } from "./lessonCatalogRoutes.js";
import { lessonPackageAdminRouter } from "./lessonPackageAdminRoutes.js";
import { learningPathRouter } from "./learningPathRoutes.js";
import { gamificationRouter } from "./gamificationRoutes.js";
import { masteryRouter } from "./masteryRoutes.js";
import { studentMcpRouter } from "./studentMcpRoutes.js";
import { adminMcpRouter } from "./adminMcpRoutes.js";
import { isTrustedCookieMutation } from "./csrf.js";

const db = new PrismaClient();

// General request rate limiting applied to every API route. Login keeps its own
// stricter per-IP + per-account throttle in auth.ts.
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Try again later." },
});

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
  const app = express();
  // requireAuth resolves the same injected client used by every router and test schema.
  app.locals.db = database;
  app.set("trust proxy", 1);
  // Morgan request logs expose route, status, latency and origin without logging
  // cookies, bearer tokens, request bodies or query-string secrets.
  morgan.token("route", (req) => req.path);
  app.use(morgan(":method :route :status :response-time ms origin=:req[origin]", {
    skip: (req) => req.path === "/health" || req.path === "/ready",
  }));
  // helmet sets secure defaults (HSTS, X-Content-Type-Options, CSP, referrer
  // policy, etc.). Disable frameguard so the admin live monitor can be framed
  // only where explicitly desired; keep the rest of the defaults.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(apiRateLimit);
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
  app.use(localCors);
  app.use(cookieCsrfGuard);

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
  app.use(examRouter(database));
  app.use(questionRouter(database));
  app.use(submissionRouter(database));
  app.use(questionAdminRouter(database));
  app.use(announcementRouter(database));
  app.use(studyMaterialRouter(database));
  app.use(lessonGenerationRouter(database));
  app.use(lessonCatalogRouter(database));
  app.use(lessonPackageAdminRouter(database));
  app.use(learningPathRouter(database));
  app.use(gamificationRouter(database));
  app.use(masteryRouter(database));
  app.use(studentMcpRouter(database));
  app.use(adminMcpRouter(database));

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
