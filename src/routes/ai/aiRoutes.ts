import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { aiRateLimiter } from "../../middleware/rateLimiter.js";
import {
  generateSnapshot,
  generateInsight,
  generateGeneric,
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
// F14: spec-canonical alias — `feature` field in body routes to snapshot or insight.
router.post("/generate", aiRateLimiter, generateGeneric);
router.post("/feedback", aiRateLimiter, submitAiFeedback);

router.get("/health", getAiHealth);

export default router;
