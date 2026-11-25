import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { adminInstitutionRouter } from "./adminInstitutionRoutes.js";

function makeResponse() {
  const state: { statusCode: number; body: unknown } = { statusCode: 200, body: null };
  const res = {
    status(code: number) { state.statusCode = code; return this; },
    json(body: unknown) { state.body = body; return this; },
  };
  return { res: res as unknown as Response, state };
}

function handlerFor(router: ReturnType<typeof adminInstitutionRouter>, path: string): RequestHandler {
  type RouteLayer = {
    route?: {
      path: string;
      methods: Record<string, boolean>;
      stack: Array<{ handle: RequestHandler }>;
    };
  };
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((item) => item.route?.path === path && item.route.methods.get);
  if (!layer?.route) throw new Error("Route not found");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function invoke(handler: RequestHandler, req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    const next: NextFunction = (error?: unknown) => error ? reject(error) : resolve();
    Promise.resolve(handler(req, res, next)).then(resolve, reject);
  });
}

describe("admin institution directory", () => {
  it("groups registered profiles by college and branch with custom names preserved", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { collegeName: "Govt Polytechnic", collegeCode: "GPK", branchName: "Computer Engineering", branchCode: "CM" },
      { collegeName: " Govt Polytechnic ", collegeCode: "GPK", branchName: "Computer Engineering", branchCode: "CM" },
      { collegeName: "Govt Polytechnic", collegeCode: "GPK", branchName: "Electronics", branchCode: "EC" },
      { collegeName: "Custom College", collegeCode: "X999", branchName: "Custom Branch", branchCode: "XB" },
    ]);
    const router = adminInstitutionRouter({ user: { findMany } } as unknown as PrismaClient);
    const handler = handlerFor(router, "/admin/institutions");
    const req = { query: {} } as unknown as Request;
    const { res, state } = makeResponse();
    await invoke(handler, req, res);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ role: "STUDENT", accessStatus: { not: "REJECTED" } }),
    }));
    expect(state.statusCode).toBe(200);
    expect(state.body).toMatchObject({
      total: 2,
      institutions: expect.arrayContaining([
        expect.objectContaining({ collegeName: "Govt Polytechnic", collegeCode: "GPK", studentCount: 3, branchCount: 2 }),
        expect.objectContaining({ collegeName: "Custom College", collegeCode: "X999", studentCount: 1, branchCount: 1 }),
      ]),
    });
  });

  it("applies college and branch filters and paginates results", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { collegeName: "Poly A", collegeCode: "A1", branchName: "Computer Engineering", branchCode: "CM" },
      { collegeName: "Poly B", collegeCode: "B1", branchName: "Mechanical", branchCode: "ME" },
    ]);
    const router = adminInstitutionRouter({ user: { findMany } } as unknown as PrismaClient);
    const handler = handlerFor(router, "/admin/institutions");
    const req = { query: { q: "Poly", branch: "computer", page: "1", limit: "1" } } as unknown as Request;
    const { res, state } = makeResponse();
    await invoke(handler, req, res);
    expect(state.body).toMatchObject({ total: 1, totalPages: 1, institutions: [{ collegeName: "Poly A" }] });
  });

  it("does not return rejected student profiles to the query", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const router = adminInstitutionRouter({ user: { findMany } } as unknown as PrismaClient);
    const handler = handlerFor(router, "/admin/institutions");
    const { res, state } = makeResponse();
    await invoke(handler, { query: {} } as unknown as Request, res);
    expect(findMany.mock.calls[0][0].where.accessStatus).toEqual({ not: "REJECTED" });
    expect(state.body).toMatchObject({ total: 0, institutions: [] });
  });
});
