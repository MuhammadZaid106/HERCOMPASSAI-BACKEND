import rateLimit from "express-rate-limit";
import { sendError } from "../utils/apiResponse.js";
import { logger } from "../utils/logger.js";

const rateLimitLog = logger.module("RATE-LIMIT");

/**
 * Strict rate limiter for auth endpoints.
 * Allows max 10 requests per 15 minutes per IP.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitLog.warn(`Rate limit exceeded for IP: ${req.ip}`);
    sendError(res, 429, "Too many requests. Please wait 15 minutes and try again.");
  },
});

/**
 * General API rate limiter for public endpoints.
 * Allows max 100 requests per 15 minutes per IP.
 */
export const generalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    rateLimitLog.warn(`General rate limit exceeded for IP: ${req.ip}`);
    sendError(res, 429, "Too many requests. Please try again later.");
  },
});
