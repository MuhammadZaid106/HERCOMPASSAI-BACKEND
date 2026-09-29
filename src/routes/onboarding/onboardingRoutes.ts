import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  submitOnboarding,
  getOnboardingProfile,
  getPersonalSnapshot,
  getSnapshotVersions,
  submitSnapshotFeedback,
} from "../../controllers/onboarding/onboardingController.js";

const router: Router = Router();

// All onboarding endpoints require an authenticated user session
router.use(requireAuth);

router.post("/", submitOnboarding);
router.get("/me", getOnboardingProfile);
router.get("/snapshot", getPersonalSnapshot);
router.get("/snapshot/versions", getSnapshotVersions);
router.post("/snapshot/feedback", submitSnapshotFeedback);

export default router;
