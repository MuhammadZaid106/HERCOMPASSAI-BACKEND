import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { getMemberDashboard, getMemberNotifications, getMemberProgress, getMemberSubscription } from "../../controllers/member/memberController.js";

const router: IRouter = Router();
router.use(requireAuth);
router.get("/dashboard", getMemberDashboard);
router.get("/progress", getMemberProgress);
router.get("/notifications", getMemberNotifications);
router.get("/subscription", getMemberSubscription);

export default router;