import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

/** App-level error with an HTTP status and a UI-safe message. Never leaks raw errors. */
export class AppError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
export const forbidden = (message: string) => new AppError(403, message);
export const badRequest = (message: string) => new AppError(400, message);

/** Last middleware: Zod -> 400 with field reasons, AppError -> its status, else 500. */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    const reasons = err.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`);
    res.status(400).json({ error: "That request was invalid.", reasons });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  if (err instanceof SyntaxError && "body" in (err as unknown as Record<string, unknown>)) {
    res.status(400).json({ error: "That request was not valid JSON." });
    return;
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
}
