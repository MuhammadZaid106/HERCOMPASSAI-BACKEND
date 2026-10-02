import { Router, type IRouter } from "express";
import { authRateLimiter } from "../../middleware/rateLimiter.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  acceptPartnerInvite,
  declinePartnerInvite,
  getPartnerInvite,
} from "../../controllers/partner/partnerInviteController.js";
import { getPartnerHome } from "../../controllers/partner/partnerHomeController.js";

const router: IRouter = Router();

router.get("/home", requireAuth, getPartnerHome);
router.get("/invite/:token", authRateLimiter, getPartnerInvite);
router.post("/invite/:token/accept", authRateLimiter, requireAuth, acceptPartnerInvite);
router.post("/invite/:token/decline", authRateLimiter, declinePartnerInvite);

export default router;
