import { Router, type IRouter } from "express";
import {
  registerController,
  loginController,
  refreshController,
  logoutController,
  meController,
  googleAuthController,
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
 * Synchronize Google OAuth user into Neon PostgreSQL
 */
router.post("/google", googleAuthController);

/**
 * POST /api/auth/refresh
 * Issues a new access token using a valid refresh token
 */
router.post("/refresh", refreshController);

/**
 * POST /api/auth/logout
 * Revokes the provided refresh token
 */
router.post("/logout", logoutController);

/**
 * GET /api/auth/me
 * Protected: returns current user profile
 */
router.get("/me", requireAuth, meController);

export default router;
