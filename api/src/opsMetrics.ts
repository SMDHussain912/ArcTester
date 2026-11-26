import os from "node:os";
import { hostname } from "node:os";
import { Router, type RequestHandler } from "express";
import type { PrismaClient } from "@prisma/client";
import { requireAdmin, requireAuth } from "./auth.js";

type LatencySample = { at: number; durationMs: number };
const startedAt = new Date();
const instanceId = (process.env.INSTANCE_ID ?? process.env.RENDER_INSTANCE_ID ?? `${hostname()}-${process.pid}`).slice(0, 180);
const buildSha = (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_SHA ?? process.env.SOURCE_VERSION ?? "unknown").slice(0, 80);
const version = (process.env.npm_package_version ?? "0.1.0").slice(0, 40);
let requestsTotal = 0;
let errorsTotal = 0;
let activeRequests = 0;
let cpuBaseline = process.cpuUsage();
let cpuWallBaseline = process.hrtime.bigint();
let cpuPercent = 0;
let cleanupPersistCount = 0;
const samples: LatencySample[] = [];
const MAX_SAMPLES = 512;
const requestBuckets = Array.from({ length: 60 }, () => ({ second: -1, count: 0 }));

function recordRequest(now: number): void {
  const second = Math.floor(now / 1000);
  const bucket = requestBuckets[second % requestBuckets.length]!;
  if (bucket.second !== second) { bucket.second = second; bucket.count = 0; }
  bucket.count += 1;
}

function requestsInLastMinute(now: number): number {
  const currentSecond = Math.floor(now / 1000);
  return requestBuckets.reduce((total, bucket) => bucket.second >= currentSecond - 59 && bucket.second <= currentSecond ? total + bucket.count : total, 0);
}

function percentile(percent: number): number {
  if (!samples.length) return 0;
  const sorted = samples.map(sample => sample.durationMs).sort((a, b) => a - b);
  return Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(percent * sorted.length) - 1)] * 100) / 100;
}

function snapshot(dbLatencyMs: number | null) {
  const now = Date.now();
  while (samples.length && now - samples[0]!.at > 60_000) samples.shift();
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage(cpuBaseline);
  const wallUs = Number(process.hrtime.bigint() - cpuWallBaseline) / 1000;
  if (wallUs > 0) cpuPercent = Math.max(0, Math.min(100 * os.cpus().length, ((cpu.user + cpu.system) / wallUs) * 100));
  cpuBaseline = process.cpuUsage();
  cpuWallBaseline = process.hrtime.bigint();
  return {
    instanceId, hostname: hostname().slice(0, 180), version, buildSha,
    startedAt, lastSeenAt: new Date(now), cpuPercent: Math.round(cpuPercent * 100) / 100,
    rssBytes: BigInt(memory.rss), heapUsedBytes: BigInt(memory.heapUsed),
    uptimeSeconds: Math.floor(process.uptime()), activeRequests,
    requestsTotal: BigInt(requestsTotal), errorsTotal: BigInt(errorsTotal),
    requestRate: requestsInLastMinute(now),
    p50LatencyMs: percentile(0.5), p95LatencyMs: percentile(0.95), dbLatencyMs,
  };
}

async function persistSnapshot(db: PrismaClient, dbLatencyMs: number | null = null): Promise<void> {
  const value = snapshot(dbLatencyMs);
  await db.$executeRaw`
    INSERT INTO server_instance_metrics
      (instance_id, hostname, version, build_sha, started_at, last_seen_at, cpu_percent,
       rss_bytes, heap_used_bytes, uptime_seconds, active_requests, requests_total,
       errors_total, request_rate, p50_latency_ms, p95_latency_ms, db_latency_ms)
    VALUES
      (${value.instanceId}, ${value.hostname}, ${value.version}, ${value.buildSha},
       ${value.startedAt}, ${value.lastSeenAt}, ${value.cpuPercent},
       ${value.rssBytes}, ${value.heapUsedBytes}, ${value.uptimeSeconds},
       ${value.activeRequests}, ${value.requestsTotal}, ${value.errorsTotal},
       ${value.requestRate}, ${value.p50LatencyMs}, ${value.p95LatencyMs}, ${value.dbLatencyMs})
    ON CONFLICT (instance_id) DO UPDATE SET
      hostname = EXCLUDED.hostname, version = EXCLUDED.version, build_sha = EXCLUDED.build_sha,
      started_at = LEAST(server_instance_metrics.started_at, EXCLUDED.started_at), last_seen_at = GREATEST(server_instance_metrics.last_seen_at, EXCLUDED.last_seen_at),
      cpu_percent = EXCLUDED.cpu_percent, rss_bytes = EXCLUDED.rss_bytes,
      heap_used_bytes = EXCLUDED.heap_used_bytes, uptime_seconds = EXCLUDED.uptime_seconds,
      active_requests = EXCLUDED.active_requests, requests_total = GREATEST(server_instance_metrics.requests_total, EXCLUDED.requests_total),
      errors_total = GREATEST(server_instance_metrics.errors_total, EXCLUDED.errors_total), request_rate = EXCLUDED.request_rate,
      p50_latency_ms = EXCLUDED.p50_latency_ms, p95_latency_ms = EXCLUDED.p95_latency_ms,
      db_latency_ms = COALESCE(EXCLUDED.db_latency_ms, server_instance_metrics.db_latency_ms)
  `;
  cleanupPersistCount += 1;
  if (cleanupPersistCount % 240 === 0) {
    await db.$executeRaw`DELETE FROM server_instance_metrics WHERE last_seen_at < NOW() - INTERVAL '30 days'`;
  }
}

export function startOpsMetricsHeartbeat(db: PrismaClient): () => void {
  void persistSnapshot(db).catch(() => undefined);
  const timer = setInterval(() => { void persistSnapshot(db).catch(() => undefined); }, 15_000);
  timer.unref?.();
  return () => clearInterval(timer);
}

export function opsMetricsMiddleware(): RequestHandler {
  return (_req, res, next) => {
    const started = process.hrtime.bigint();
    activeRequests += 1;
    res.once("finish", () => {
      activeRequests = Math.max(0, activeRequests - 1);
      requestsTotal += 1;
      if (res.statusCode >= 500) errorsTotal += 1;
      const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
      const finishedAt = Date.now();
      recordRequest(finishedAt);
      samples.push({ at: finishedAt, durationMs });
      if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
    });
    next();
  };
}

export function opsMetricsRouter(db: PrismaClient): Router {
  const router = Router();
  router.get("/admin/ops/servers", requireAuth, requireAdmin(db), async (_req, res, next) => {
    try {
      let dbLatencyMs: number | null = null;
      let databaseStatus: "ready" | "unavailable" = "ready";
      const probeStarted = process.hrtime.bigint();
      try {
        await db.$queryRaw`SELECT 1`;
        dbLatencyMs = Math.round(Number(process.hrtime.bigint() - probeStarted) / 1_000_000 * 100) / 100;
      } catch {
        databaseStatus = "unavailable";
      }
      await persistSnapshot(db, dbLatencyMs);
      const rows = await db.$queryRaw<Array<{
        instance_id: string; hostname: string; version: string; build_sha: string;
        started_at: Date; last_seen_at: Date; cpu_percent: number; rss_bytes: bigint;
        heap_used_bytes: bigint; uptime_seconds: number; active_requests: number;
        requests_total: bigint; errors_total: bigint; request_rate: number;
        p50_latency_ms: number; p95_latency_ms: number; db_latency_ms: number | null;
      }>>`
        SELECT instance_id, hostname, version, build_sha, started_at, last_seen_at,
          cpu_percent, rss_bytes, heap_used_bytes, uptime_seconds, active_requests,
          requests_total, errors_total, request_rate, p50_latency_ms, p95_latency_ms, db_latency_ms
        FROM server_instance_metrics ORDER BY last_seen_at DESC LIMIT 50
      `;
      const now = Date.now();
      const servers = rows.map(row => {
        const ageSeconds = Math.max(0, Math.floor((now - row.last_seen_at.getTime()) / 1000));
        const status = ageSeconds <= 30 ? "healthy" : ageSeconds <= 120 ? "stale" : "offline";
        return {
          instanceId: row.instance_id, hostname: row.hostname, version: row.version,
          buildSha: row.build_sha, startedAt: row.started_at.toISOString(),
          lastSeenAt: row.last_seen_at.toISOString(), ageSeconds, status,
          cpuPercent: Number(row.cpu_percent), rssBytes: Number(row.rss_bytes),
          heapUsedBytes: Number(row.heap_used_bytes), uptimeSeconds: row.uptime_seconds,
          activeRequests: row.active_requests, requestsTotal: Number(row.requests_total),
          errorsTotal: Number(row.errors_total), requestRatePerMinute: Number(row.request_rate),
          p50LatencyMs: Number(row.p50_latency_ms), p95LatencyMs: Number(row.p95_latency_ms),
          dbLatencyMs: row.db_latency_ms === null ? null : Number(row.db_latency_ms),
        };
      });
      res.json({ ok: true, databaseStatus, serverTime: new Date().toISOString(), servers });
    } catch (error) { next(error); }
  });
  return router;
}
