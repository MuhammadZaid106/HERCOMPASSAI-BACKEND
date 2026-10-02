import rateLimit from "express-rate-limit";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const rateLimitLog = logger.module("RATE-LIMIT");
const WINDOW_MS = 15 * 60 * 1000;
const AUTH_MESSAGE = "Too many requests. Please wait 15 minutes and try again.";
/** Local testing signs in, registers, and opens invite links far more often than production. */
const DEV = process.env.NODE_ENV !== "production";

function createLimiter(label: string, max: number, message: string) {
  return rateLimit({
    windowMs: WINDOW_MS,
    max: DEV ? 200 : max,
    standardHeaders: true,
    legacyHeaders: false,
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
export const authRateLimiter = createLimiter("Auth rate limit", 20, AUTH_MESSAGE);

/** Token refresh and logout. A normal session must not consume the sign-in budget. */
export const sessionRateLimiter = createLimiter("Session rate limit", 40, AUTH_MESSAGE);

/** Opening or answering a partner invitation. Separate from sign-in. */
export const inviteRateLimiter = createLimiter("Invite rate limit", 40, AUTH_MESSAGE);

/**
 * General API rate limiter for public endpoints.
 * Allows max 100 requests per 15 minutes per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: WINDOW_MS,
  max: DEV ? 200 : 100,
  standardHeaders: true,
  legacyHeaders: false,
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
  handler: (req, res) => {
    rateLimitLog.warn(`AI Gateway rate limit exceeded for IP: ${req.ip}`);
    sendError(res, 429, "You've reached the AI insight limit for now. Please try again in 15 minutes.");
  },
});
