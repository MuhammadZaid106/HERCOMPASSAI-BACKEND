import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { requireStaff } from "../../middleware/roleMiddleware.js";
import { listAiFlags, updateAiFlag, getMemberAiUsage } from "../../controllers/admin/adminController.js";
import { listCommunityNotes, reviewCommunityNote } from "../../controllers/admin/communityReviewController.js";

const router: Router = Router();

// Every admin route is staff-only. requireAuth first (it populates req.user),
// then requireStaff checks the role on that verified token.
router.use(requireAuth, requireStaff);

/**
 * The AI review queue.
 *
 * `ai_flags` was write-only from the day it was added: `recordAiFeedback` created
 * rows, nothing ever read them. These routes close that loop.
 */
router.get("/ai-flags", listAiFlags);
router.patch("/ai-flags/:id", updateAiFlag);

/** Per-member AI allowance, for support. */
router.get("/ai-usage/:userId", getMemberAiUsage);

router.get("/community-notes", listCommunityNotes);
router.patch("/community-notes/:id", reviewCommunityNote);

export default router;
