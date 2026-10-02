import { Router, type IRouter } from "express";
import {
  registerController,
  loginController,
  refreshController,
  logoutController,
  meController,
  googleAuthController,
  changePasswordController,
  getSessionsController,
  revokeOtherSessionsController,
  forgotPasswordController,
  resetPasswordController,
} from "../../controllers/auth/authController.js";
import { authRateLimiter, sessionRateLimiter } from "../../middleware/rateLimiter.js";
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
router.post("/refresh", sessionRateLimiter, refreshController);

/**
 * POST /api/auth/logout
 * Revokes the provided refresh token
 */
router.post("/logout", sessionRateLimiter, logoutController);

/**
 * GET /api/auth/me
 * Protected: returns current user profile
 */
router.get("/me", requireAuth, meController);
router.post("/forgot-password", authRateLimiter, forgotPasswordController);
router.post("/reset-password", authRateLimiter, resetPasswordController);

/**
 * POST /api/auth/change-password
 * Protected. Rate-limited because it is the one endpoint an attacker can probe
 * with guesses at the current password.
 */
router.post("/change-password", requireAuth, authRateLimiter, changePasswordController);

/**
 * GET /api/auth/sessions
 * Protected: how many logins are currently live.
 */
router.get("/sessions", requireAuth, getSessionsController);

/**
 * POST /api/auth/sessions/revoke-others
 * Protected: ends every session except the one that presents its refresh token.
 */
router.post("/sessions/revoke-others", requireAuth, authRateLimiter, revokeOtherSessionsController);

export default router;
