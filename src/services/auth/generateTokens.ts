import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";

interface AccessTokenPayload {
  userId: string;
  email: string;
  role: "member" | "partner" | "admin";
  plan: "free" | "plus" | "premium";
}

interface RefreshTokenPayload {
  userId: string;
}

/**
 * Generates a short-lived JWT access token (default: 15 minutes).
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Generates a long-lived JWT refresh token (default: 7 days).
 */
export function generateRefreshToken(payload: RefreshTokenPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
}

/**
 * Verifies and decodes an access token.
 * Throws if expired or invalid.
 */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

/**
 * Verifies and decodes a refresh token.
 * Throws if expired or invalid.
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}
