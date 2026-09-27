import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { getMemberDashboard, getMemberProgress } from "../../controllers/member/memberController.js";

const router: IRouter = Router();
router.use(requireAuth);
router.get("/dashboard", getMemberDashboard);
router.get("/progress", getMemberProgress);

export default router;