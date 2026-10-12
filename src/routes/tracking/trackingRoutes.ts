import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import {
  deleteTrackingEntry,
  getTrackingEntry,
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
// Declared after static paths so "summary" / domain posts are never read as :type.
router.get("/:type/:id", getTrackingEntry);
router.delete("/:type/:id", deleteTrackingEntry);

export default router;