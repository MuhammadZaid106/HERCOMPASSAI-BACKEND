import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { requireStaff } from "../../middleware/roleMiddleware.js";
import { listAiFlags, updateAiFlag, getMemberAiUsage } from "../../controllers/admin/adminController.js";
import {
  getAdminAudit,
  getAdminEvidence,
  getAdminMetrics,
  getAdminPartners,
  getAdminPlans,
  getAdminSupport,
  getAdminUser,
  getAdminUsers,
} from "../../controllers/admin/adminDeskController.js";
import { listCommunityNotes, reviewCommunityNote } from "../../controllers/admin/communityReviewController.js";
import {
  getAdminBeta,
  getAdminContent,
  getAdminProductNotes,
  getAdminSettings,
  getAdminSystem,
  patchAdminBetaMember,
  patchAdminContent,
  patchAdminEvidence,
  patchAdminProductNote,
  patchAdminSettings,
  postAdminBetaMember,
  postAdminContent,
} from "../../controllers/admin/adminOpsController.js";

const router: Router = Router();

// Every admin route is staff-only. requireAuth first (it populates req.user),
// then requireStaff checks the role on that verified token.
router.use(requireAuth, requireStaff);

router.get("/metrics", getAdminMetrics);
router.get("/users", getAdminUsers);
router.get("/users/:id", getAdminUser);
router.get("/partners", getAdminPartners);
router.get("/plans", getAdminPlans);
router.get("/audit", getAdminAudit);
router.get("/support", getAdminSupport);
router.get("/evidence", getAdminEvidence);
router.patch("/evidence/:evidenceId", patchAdminEvidence);
router.get("/system", getAdminSystem);
router.get("/beta", getAdminBeta);
router.post("/beta/members", postAdminBetaMember);
router.patch("/beta/members/:id", patchAdminBetaMember);
router.get("/content", getAdminContent);
router.post("/content", postAdminContent);
router.patch("/content/:id", patchAdminContent);
router.get("/product-notes", getAdminProductNotes);
router.patch("/product-notes/:id", patchAdminProductNote);
router.get("/settings", getAdminSettings);
router.patch("/settings", patchAdminSettings);

router.get("/ai-flags", listAiFlags);
router.patch("/ai-flags/:id", updateAiFlag);

/** Per-member AI allowance, for support. */
router.get("/ai-usage/:userId", getMemberAiUsage);

router.get("/community-notes", listCommunityNotes);
router.patch("/community-notes/:id", reviewCommunityNote);

export default router;
