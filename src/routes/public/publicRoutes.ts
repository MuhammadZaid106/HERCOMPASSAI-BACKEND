import { Router, type IRouter } from "express";
import {
  getPublicAcademyEpisodes,
  getPublicEvidenceSummary,
} from "../../controllers/public/publicController.js";

const router: IRouter = Router();

router.get("/academy/episodes", getPublicAcademyEpisodes);
router.get("/evidence/summary", getPublicEvidenceSummary);

export default router;
