import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { aiRateLimiter } from "../../middleware/rateLimiter.js";
import {
  generateSnapshot,
  generateInsight,
  submitAiFeedback,
  getAiHealth,
} from "../../controllers/ai/aiGatewayController.js";

const router: Router = Router();

// Every AI route requires an authenticated session.
router.use(requireAuth);

// Generation is rate limited per IP: AI calls are the most expensive endpoint in
// the product and the most attractive target for abuse.
router.post("/snapshot", aiRateLimiter, generateSnapshot);
router.post("/insight", aiRateLimiter, generateInsight);
router.post("/feedback", aiRateLimiter, submitAiFeedback);

router.get("/health", getAiHealth);

export default router;
