import { Router, type IRouter } from "express";
import {
  registerController,
  loginController,
  refreshController,
  logoutController,
  meController,
  googleAuthController,
  forgotPasswordController,
  resetPasswordController,
} from "../../controllers/auth/authController.js";
import { authRateLimiter } from "../../middleware/rateLimiter.js";
import { requireAuth } from "../../middleware/authMiddleware.js";

const router: IRouter = Router();

/**
 * POST /api/auth/register
 * Rate-limited: 10 req / 15 min per IP
 */
router.post("/register", authRateLimiter, registerController);

/**
 * POST /api/auth/login
 * Rate-limited: 10 req / 15 min per IP
 */
router.post("/login", authRateLimiter, loginController);

/**
 * POST /api/auth/google
 * Verifies a Google ID token server-side. Rate-limited because an unverified
 * caller can otherwise spam token verification against Google's JWKS.
 */
router.post("/google", authRateLimiter, googleAuthController);

/**
 * POST /api/auth/refresh
 * Rotates the token pair. Reuse detection revokes the token family.
 */
router.post("/refresh", authRateLimiter, refreshController);

/**
 * POST /api/auth/logout
 * Revokes the provided refresh token
 */
router.post("/logout", authRateLimiter, logoutController);

/**
 * GET /api/auth/me
 * Protected: returns current user profile
 */
router.get("/me", requireAuth, meController);
router.post("/forgot-password", authRateLimiter, forgotPasswordController);
router.post("/reset-password", authRateLimiter, resetPasswordController);

export default router;
