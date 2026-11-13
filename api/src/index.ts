import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { PrismaClient } from "@prisma/client";
import { errorHandler, notFound } from "./errors.js";
import { testRouter } from "./testRoutes.js";
import { authRouter } from "./auth.js";
import { examRouter } from "./examRoutes.js";
import { questionRouter } from "./questionRoutes.js";
import { sessionRouter } from "./sessionRoutes.js";
import { submissionRouter } from "./submissionRoutes.js";
import { questionAdminRouter } from "./questionAdminRoutes.js";
import { modelRegistryRouter } from "./modelRoutes.js";
import { modelTrainingJobsRouter } from "./modelTrainingJobRoutes.js";
import { startModelTrainingWorker } from "./modelTrainingWorker.js";
import { announcementRouter } from "./announcementRoutes.js";
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
 * Minimal CORS without another dependency. In production only exact configured
 * origins are allowed; localhost/loopback is permitted outside production so
 * local development and the packaged desktop client (file://) can reach the API.
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
  // file:// (desktop) sends Origin: "null"; allow it outside production so the
  // packaged desktop app can reach the API on localhost.
  const isFileOrigin = process.env.NODE_ENV !== "production" && origin === "null";
  if (origin && (isLocalOrigin || isFileOrigin || configuredOrigins.has(origin))) {
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
  // helmet sets secure defaults (HSTS, X-Content-Type-Options, CSP, referrer
  // policy, etc.). Disable frameguard so the admin live monitor can be framed
  // only where explicitly desired; keep the rest of the defaults.
  app.use(
    helmet({
      contentSecurityPolicy: false,
    })
  );
  app.use(apiRateLimit);
  // 1 MB JSON body limit by default. The large-payload import routes apply their
  // own 50 MB parsers below; every other route uses the 1 MB global parser.
  app.use((req, res, next) => {
    if (req.path === "/admin/questions/import" || req.path === "/analytics/import") {
      return next();
    }
    express.json({ limit: "1mb" })(req, res, next);
  });
  app.use(localCors);
  app.use(cookieCsrfGuard);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ecet-api", time: new Date().toISOString() });
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
  app.use(modelRegistryRouter(database));
  app.use(modelTrainingJobsRouter(database));
  app.use(announcementRouter(database));

  app.use((_req, _res, next) => next(notFound("That page does not exist.")));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    startModelTrainingWorker(db);
    console.log(`ecet-api listening on http://localhost:${PORT}`);
  });
}

export default app;
