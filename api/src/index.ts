import express from "express";
import { PrismaClient } from "@prisma/client";
import { errorHandler, notFound } from "./errors.js";
import { testRouter } from "./testRoutes.js";

const db = new PrismaClient();

/**
 * Minimal CORS for the local Next.js dev server (localhost:3000 -> :4000).
 * Hand-rolled instead of the `cors` package: 8 lines, no new dependency.
 * Allow every localhost port so the API also works on a phone via LAN.
 */
function localCors(_req: express.Request, res: express.Response, next: express.NextFunction): void {
  const origin = _req.headers.origin ?? "";
  if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "content-type");
  }
  if (_req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

export function buildApp(database: PrismaClient = db): express.Express {
  const app = express();
  app.use(express.json());
  app.use(localCors);

  app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "ecet-api", time: new Date().toISOString() });
  });

  app.use(testRouter(database));

  app.use((_req, _res, next) => next(notFound("That page does not exist.")));
  app.use(errorHandler);
  return app;
}

const app = buildApp();

const PORT = Number(process.env.PORT ?? 4000);
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`ecet-api listening on http://localhost:${PORT}`);
  });
}

export default app;
