import { Router, type IRouter } from "express";
import {
  getPublicAcademyEpisodes,
  getPublicEvidenceSummary,
  postGuestSnapshot,
} from "../../controllers/public/publicController.js";
import { aiRateLimiter } from "../../middleware/rateLimiter.js";

const router: IRouter = Router();

router.get("/academy/episodes", getPublicAcademyEpisodes);
router.get("/evidence/summary", getPublicEvidenceSummary);

/**
 * One free, no-signup Personal Menopause Snapshot.
 *
 * Rate-limited like the other AI surfaces: it runs a real Gateway generation and
 * creates a guest account, so it is the most expensive unauthenticated endpoint
 * on the API.
 */
router.post("/snapshot", aiRateLimiter, postGuestSnapshot);

export default router;
