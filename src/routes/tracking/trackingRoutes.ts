import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  getTrackingSummary,
  saveEnergyEntry,
  saveLifestyleEntry,
  saveMoodEntry,
  saveSleepEntry,
  saveSymptomEntry,
} from "../../controllers/tracking/trackingController.js";

const router: IRouter = Router();
router.use(requireAuth);
router.get("/summary", getTrackingSummary);
router.post("/symptoms", saveSymptomEntry);
router.post("/mood", saveMoodEntry);
router.post("/sleep", saveSleepEntry);
router.post("/energy", saveEnergyEntry);
router.post("/lifestyle", saveLifestyleEntry);

export default router;