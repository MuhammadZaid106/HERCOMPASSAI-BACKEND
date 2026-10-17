import Redis from "ioredis";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

/**
 * Redis client and cache helpers.
 *
 * Redis is optional. When `REDIS_URL` is blank — local runs, the test suite, or a
 * Vercel deployment without a cache — every helper here is a silent no-op so the
 * application behaves exactly as it did before caching existed. When a URL is
 * configured we connect lazily on first use and treat any command failure as a
 * cache miss rather than an error the request path has to handle.
 *
 * The client is intentionally permissive on connect but fail-fast on commands:
 * `maxRetriesPerRequest: 1` stops a dead Redis from stalling a request behind a
 * queue of retries, while `enableOfflineQueue` still lets the very first commands
 * wait for the initial handshake.
 */

const redisLog = logger.module("REDIS");

/** Every key lives under one namespace so `SCAN`/`DEL` by prefix stays safe. */
export const KEY_PREFIX = "hc:";

let client: Redis | null = null;
let errorLogged = false;

export function redisConfigured(): boolean {
  return env.REDIS_URL.trim() !== "";
}

/** Returns the shared client, creating (and lazily connecting) it on first use. */
export function getRedis(): Redis | null {
  if (!redisConfigured()) return null;
  if (client) return client;

  const created = new Redis(env.REDIS_URL, {
    // Connect on first command rather than at import time, so a cold start that
    // never touches the cache never opens a socket.
    lazyConnect: true,
    // Keep the default offline queue so the initial handshake can finish, but…
    enableOfflineQueue: true,
    // …cap per-command retries so a dead server fails fast instead of hanging.
    maxRetriesPerRequest: 1,
    // Never give up reconnecting: the cache is best-effort, and a recovered
    // server should resume serving without a process restart.
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });

  created.on("error", (error: Error) => {
    if (!errorLogged) {
      errorLogged = true;
      redisLog.warn(`Redis unavailable; cache disabled until reconnect. ${error.message}`);
    }
  });

  created.on("ready", () => {
    errorLogged = false;
  });

  client = created;
  return client;
}

/** Health string for the `/health` endpoint. Never throws. */
export function redisHealth(): "disabled" | "connecting" | "ready" | "error" {
  if (!redisConfigured()) return "disabled";
  const status = client?.status;
  if (status === "ready") return "ready";
  if (status === "connecting" || status === "connect" || status === "reconnecting" || status === "wait") {
    return "connecting";
  }
  return "error";
}

function logCommandFailure(operation: string, error: unknown): void {
  if (!errorLogged) {
    errorLogged = true;
    redisLog.warn(
      `Redis ${operation} failed; treating as cache miss. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/** Reads a JSON value. Returns `null` on miss, on any decode error, or when disabled. */
export async function cacheGet<T>(key: string): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(KEY_PREFIX + key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch (error) {
    logCommandFailure("GET", error);
    return null;
  }
}

/** Writes a JSON value with a TTL. Never throws. */
export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(KEY_PREFIX + key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (error) {
    logCommandFailure("SET", error);
  }
}

/** Deletes exact keys. Never throws. */
export async function cacheDel(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(...keys.map((key) => KEY_PREFIX + key));
  } catch (error) {
    logCommandFailure("DEL", error);
  }
}

/**
 * Deletes every key under a prefix using `SCAN` rather than `KEYS`, so a large
 * keyspace cannot block the Redis event loop. Never throws.
 */
export async function cacheDelPrefix(prefix: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  const match = `${KEY_PREFIX}${prefix}*`;
  try {
    let cursor = "0";
    do {
      const [next, found] = await redis.scan(cursor, "MATCH", match, "COUNT", "200");
      cursor = next;
      if (found.length > 0) await redis.del(...found);
    } while (cursor !== "0");
  } catch (error) {
    logCommandFailure("SCAN", error);
  }
}

/**
 * Cache-aside read: return the cached value, otherwise run `loader`, cache a
 * non-null result, and return it. A `null`/`undefined` result is not cached, so
 * a "not found" answer is never pinned in place.
 */
export async function cacheRemember<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  const cached = await cacheGet<T>(key);
  if (cached !== null) return cached;

  const value = await loader();
  if (value !== undefined && value !== null) {
    await cacheSet(key, value, ttlSeconds);
  }
  return value;
}
