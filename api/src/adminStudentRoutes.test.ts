import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { adminStudentRouter } from "./adminStudentRoutes.js";

function response() {
  const state: { status: number; body: unknown } = { status: 200, body: null };
  const res = { status(code: number) { state.status = code; return this; }, json(body: unknown) { state.body = body; return this; } };
  return { res, state };
}
function handlerFor(router: ReturnType<typeof adminStudentRouter>, method: "get" | "patch" | "delete", path: string) {
  type RouteHandler = (req: unknown, res: unknown, next: (error?: unknown) => void) => unknown;
  type RouteLayer = { route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: RouteHandler }> } };
  const stack = (router as unknown as { stack: RouteLayer[] }).stack;
  const layer = stack.find((item) => item.route?.path === path && item.route.methods[method]);
  if (!layer?.route) throw new Error("Route not found");
  return layer.route.stack[layer.route.stack.length - 1].handle;
}
async function invoke(fn: (req: unknown, res: unknown, next: (error?: unknown) => void) => unknown, req: unknown, res: unknown) {
  await new Promise<void>((resolve, reject) => Promise.resolve(fn(req, res, (error) => error ? reject(error) : resolve())).then(resolve, reject));
}
describe("admin student management", () => {
  it("returns paginated student profile rows without deleted accounts", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: 7, email: "s@example.com", fullName: "Student" }]);
    const count = vi.fn().mockResolvedValue(1);
    const router = adminStudentRouter({ user: { findMany, count } } as unknown as PrismaClient);
    const { res, state } = response();
    await invoke(handlerFor(router, "get", "/admin/students"), { query: { page: "1", limit: "25" } }, res);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ role: "STUDENT" }), take: 25 }));
    expect(state.body).toMatchObject({ ok: true, total: 1, students: [{ id: 7 }] });
  });

  it("updates only validated student profile fields", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7 });
    const update = vi.fn().mockResolvedValue({ id: 7, fullName: "Updated Student" });
    const router = adminStudentRouter({ user: { findFirst, update } } as unknown as PrismaClient);
    const { res, state } = response();
    await invoke(handlerFor(router, "patch", "/admin/students/:id"), { params: { id: "7" }, body: { fullName: "Updated Student" } }, res);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 7 }, data: { fullName: "Updated Student" } }));
    expect(state.body).toMatchObject({ ok: true, student: { fullName: "Updated Student" } });
  });

  it("anonymizes and invalidates a removed student's account", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: 7 });
    const update = vi.fn().mockResolvedValue({});
    const router = adminStudentRouter({ user: { findFirst, update } } as unknown as PrismaClient);
    const { res, state } = response();
    await invoke(handlerFor(router, "delete", "/admin/students/:id"), { params: { id: "7" } }, res);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 7 },
      data: expect.objectContaining({ accessStatus: "REJECTED", sessionVersion: { increment: 1 }, fullName: "Deleted student" }),
    }));
    expect(state.body).toMatchObject({ ok: true, deleted: true });
  });
});
