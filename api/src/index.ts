import express from "express";
import { PrismaClient } from "@prisma/client";
import { errorHandler, notFound } from "./errors.js";
import { testRouter } from "./testRoutes.js";
import { authRouter } from "./auth.js";
import { examRouter } from "./examRoutes.js";
import { announcementRouter } from "./announcementRoutes.js";
import { modelRegistryRouter } from "./modelRoutes.js";

const db = new PrismaClient();

/**
 * Minimal CORS without another dependency. Localhost is allowed by default;
 * additional exact origins (for example a phone's LAN URL) must be listed in
 * CORS_ORIGINS as a comma-separated environment variable.
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
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
  if (origin && (isLocalOrigin || configuredOrigins.has(origin))) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
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

export function buildApp(database: PrismaClient = db): express.Express {
  const app = express();
  app.use(express.json({ limit: "10mb" }));
  app.use(localCors);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ecet-api", time: new Date().toISOString() });
  });

  app.use(testRouter(database));
  app.use("/auth", authRouter(database));
  app.use(examRouter(database));
  app.use(announcementRouter(database));
  app.use(modelRegistryRouter(database));

  app.use((_req, _res, next) => next(notFound("That page does not exist.")));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`ecet-api listening on http://localhost:\${PORT}`);
  });
}

export default app;
