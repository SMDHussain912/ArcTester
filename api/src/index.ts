import express from "express";
import { PrismaClient } from "@prisma/client";
import { errorHandler, notFound } from "./errors.js";
import { testRouter } from "./testRoutes.js";

const db = new PrismaClient();

export function buildApp(database: PrismaClient = db): express.Express {
  const app = express();
  app.use(express.json());

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
