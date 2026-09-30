import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  getMemberAccount,
  getMemberDashboard,
  getMemberInsights,
  getMemberNotifications,
  getMemberProgress,
  getMemberSubscription,
  markAllMemberNotificationsRead,
  markMemberNotificationRead,
} from "../../controllers/member/memberController.js";
import {
  createSupportRequest,
  deleteMemberAccount,
  getExploreProgress,
  getNotificationPreferences,
  updateAccountConsent,
  updateAccountPreferences,
  updateExploreProgress,
  updateMemberProfile,
  updateNotificationPreferences,
  updatePartnerSettings,
} from "../../controllers/member/memberLibraryController.js";

const router: IRouter = Router();
router.use(requireAuth);
router.get("/dashboard", getMemberDashboard);
router.get("/progress", getMemberProgress);
router.get("/insights", getMemberInsights);
router.get("/notifications", getMemberNotifications);
// Declared before the ":id" route so "read-all" is never read as an id.
router.post("/notifications/read-all", markAllMemberNotificationsRead);
router.patch("/notifications/:id/read", markMemberNotificationRead);
router.get("/subscription", getMemberSubscription);
router.get("/account", getMemberAccount);
router.put("/account/profile", updateMemberProfile);
router.put("/account/preferences", updateAccountPreferences);
router.put("/account/consent", updateAccountConsent);
router.post("/account/delete", deleteMemberAccount);
router.get("/notification-preferences", getNotificationPreferences);
router.put("/notification-preferences", updateNotificationPreferences);
router.get("/explore-progress", getExploreProgress);
router.put("/explore-progress/:slug", updateExploreProgress);
router.post("/support", createSupportRequest);
router.put("/partner", updatePartnerSettings);

export default router;