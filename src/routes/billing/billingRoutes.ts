import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  createCheckoutSession,
  createPortalSession,
  getBillingStatus,
} from "../../controllers/billing/billingController.js";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/status", getBillingStatus);
router.post("/checkout-session", createCheckoutSession);
router.post("/portal", createPortalSession);

export default router;
