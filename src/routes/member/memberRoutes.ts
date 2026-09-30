import { Router, type IRouter } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { getMemberAccount, getMemberDashboard, getMemberInsights, getMemberNotifications, getMemberProgress, getMemberSubscription } from "../../controllers/member/memberController.js";
import {
  createSupportRequest,
  deleteMemberAccount,
  getExploreProgress,
  getNotificationPreferences,
  updateExploreProgress,
  updateNotificationPreferences,
  updatePartnerSettings,
} from "../../controllers/member/memberLibraryController.js";
import {
  getRecipe,
  getWorkout,
  listRecipes,
  listWorkouts,
  saveRecipe,
  saveWorkout,
} from "../../controllers/member/contentLibraryController.js";

const router: IRouter = Router();
router.use(requireAuth);
router.get("/dashboard", getMemberDashboard);
router.get("/progress", getMemberProgress);
router.get("/insights", getMemberInsights);
router.get("/notifications", getMemberNotifications);
router.get("/subscription", getMemberSubscription);
router.get("/account", getMemberAccount);
router.post("/account/delete", deleteMemberAccount);
router.get("/notification-preferences", getNotificationPreferences);
router.put("/notification-preferences", updateNotificationPreferences);
router.get("/explore-progress", getExploreProgress);
router.put("/explore-progress/:slug", updateExploreProgress);
router.post("/support", createSupportRequest);
router.put("/partner", updatePartnerSettings);
router.get("/recipes", listRecipes);
router.get("/recipes/:slug", getRecipe);
router.put("/recipes/:slug", saveRecipe);
router.get("/workouts", listWorkouts);
router.get("/workouts/:slug", getWorkout);
router.put("/workouts/:slug", saveWorkout);

export default router;