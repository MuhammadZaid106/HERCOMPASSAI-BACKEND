import { Router, type IRouter } from "express";
import { inviteRateLimiter } from "../../middleware/rateLimiter.js";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  acceptPartnerInvite,
  declinePartnerInvite,
  getPartnerInvite,
} from "../../controllers/partner/partnerInviteController.js";
import { getPartnerHome, postPartnerLeave, updatePartnerName } from "../../controllers/partner/partnerHomeController.js";
import {
  getPartnerActivities,
  getPartnerAcademy,
  getPartnerConversation,
  getPartnerDigest,
  getPartnerLesson,
  getPartnerSupport,
  markPartnerLessonRead,
} from "../../controllers/partner/partnerContentController.js";

const router: IRouter = Router();

router.get("/home", requireAuth, getPartnerHome);
router.get("/activities", requireAuth, getPartnerActivities);
router.get("/academy", requireAuth, getPartnerAcademy);
router.get("/academy/:slug", requireAuth, getPartnerLesson);
router.post("/academy/:slug/read", requireAuth, markPartnerLessonRead);
router.get("/support", requireAuth, getPartnerSupport);
router.get("/conversation", requireAuth, getPartnerConversation);
router.get("/digest", requireAuth, getPartnerDigest);
router.post("/leave", requireAuth, postPartnerLeave);
router.put("/profile", requireAuth, updatePartnerName);
router.get("/invite/:token", inviteRateLimiter, getPartnerInvite);
router.post("/invite/:token/accept", inviteRateLimiter, requireAuth, acceptPartnerInvite);
router.post("/invite/:token/decline", inviteRateLimiter, declinePartnerInvite);

export default router;
