import rateLimit from "express-rate-limit";
import { RedisStore, type RedisReply } from "rate-limit-redis";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";
import { getRedis, redisConfigured } from "../config/redis.js";

const rateLimitLog = logger.module("RATE-LIMIT");
const WINDOW_MS = 15 * 60 * 1000;
const AUTH_MESSAGE = "Too many requests. Please wait 15 minutes and try again.";
/** Local testing signs in, registers, and opens invite links far more often than production. */
const DEV = process.env.NODE_ENV !== "production";

/**
 * Builds a shared Redis store when Redis is configured, otherwise returns
 * `undefined` so express-rate-limit keeps its in-process default.
 *
 * The counters must be shared: with more than one backend replica (Docker
 * Compose, a load balancer, or serverless functions) a per-process memory store
 * lets a client spend the full budget on every replica. Redis makes the window
 * global.
 */
function sharedStore(namespace: string): RedisStore | undefined {
  if (!redisConfigured()) return undefined;

  return new RedisStore({
    // Namespaced under the same `hc:` prefix as every other key this app writes.
    prefix: `hc:rl:${namespace}:`,
    sendCommand: (command: string, ...args: string[]) => {
      const redis = getRedis();
      if (!redis) throw new Error("Redis is not configured");
      // ioredis ships `call` at runtime but does not type it — the generated
      // commander omits this escape hatch. The cast keeps the adapter honest.
      const raw = redis as unknown as {
        call: (cmd: string, ...params: string[]) => Promise<RedisReply>;
      };
      return raw.call(command, ...args);
    },
  });
}

function createLimiter(label: string, max: number, message: string, namespace: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: DEV ? 200 : max,
    standardHeaders: true,
    legacyHeaders: false,
    store: sharedStore(namespace),
    // If Redis is briefly unreachable the store throws; serve the request rather
    // than failing the API. Caching/limiting is best-effort, availability is not.
    passOnStoreError: true,
    handler: (req, res) => {
      rateLimitLog.warn(`${label} exceeded for IP: ${req.ip}`);
      sendError(res, 429, message);
    },
  });
}

/**
 * Sign-in, registration, and password recovery.
 * These share one counter so guessing stays slow. Logout and invite reads do not.
 */
export const authRateLimiter = createLimiter("Auth rate limit", 20, AUTH_MESSAGE, "auth");

/** Token refresh and logout. A normal session must not consume the sign-in budget. */
export const sessionRateLimiter = createLimiter("Session rate limit", 40, AUTH_MESSAGE, "session");

/** Opening or answering a partner invitation. Separate from sign-in. */
export const inviteRateLimiter = createLimiter("Invite rate limit", 40, AUTH_MESSAGE, "invite");

/**
 * General API rate limiter for public endpoints.
 * Allows max 100 requests per 15 minutes per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: DEV ? 200 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore("general"),
  passOnStoreError: true,
  handler: (req, res) => {
    rateLimitLog.warn(`General rate limit exceeded for IP: ${req.ip}`);
    sendError(res, 429, "Too many requests. Please try again later.");
  },
});

/**
 * AI Gateway rate limiter.
 * AI generation is expensive and the highest-value abuse target, so it gets a
 * tighter budget than the general API: 20 requests per 15 minutes per IP.
 */
export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  store: sharedStore("ai"),
  passOnStoreError: true,
  handler: (req, res) => {
    rateLimitLog.warn(`AI Gateway rate limit exceeded for IP: ${req.ip}`);
    sendError(res, 429, "You've reached the AI insight limit for now. Please try again in 15 minutes.");
  },
});
