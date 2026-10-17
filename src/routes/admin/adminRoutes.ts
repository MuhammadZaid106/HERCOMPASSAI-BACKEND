import { searchAcademicEvidence, ingestAcademicPaper } from "../../controllers/admin/academicEvidenceController.js";
import { getMonitoringDashboard, triggerMonitoringScan } from "../../controllers/admin/monitoringController.js";
import { runModelBenchmark, exportDataset, getLoraConfig, searchEvidenceVector } from "../../controllers/admin/mlAdminController.js";
import { Router } from "express";
import { requireAuth } from "../../middleware/authMiddleware.js";
import { requireStaff } from "../../middleware/roleMiddleware.js";
import { listAiFlags, updateAiFlag, retestAiFlag, listAiFlagHumanReviews, getMemberAiUsage } from "../../controllers/admin/adminController.js";
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
  getAdminEvidenceSubmissions,
  getAdminProductNotes,
  getAdminScorecard,
  getAdminSettings,
  getAdminSystem,
  patchAdminBetaMember,
  patchAdminContent,
  patchAdminEvidence,
  patchAdminProductNote,
  patchAdminSettings,
  postAdminBetaMember,
  postAdminContent,
  postAdminEvaluationRun,
  postAdminEvidence,
  postAdminGrandfathered,
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
router.get("/evidence-submissions", getAdminEvidenceSubmissions);
router.post("/evidence", postAdminEvidence);
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
router.get("/scorecard", getAdminScorecard);
router.post("/evaluation/run", postAdminEvaluationRun);
router.post("/grandfathered", postAdminGrandfathered);

router.get("/ai-flags", listAiFlags);
router.patch("/ai-flags/:id", updateAiFlag);
router.post("/ai-flags/:id/retest", retestAiFlag);
router.get("/ai-flags/:id/reviews", listAiFlagHumanReviews);

/** Per-member AI allowance, for support. */
router.get("/ai-usage/:userId", getMemberAiUsage);

router.get("/community-notes", listCommunityNotes);
router.patch("/community-notes/:id", reviewCommunityNote);


// ??? Academic Evidence Pipelines (PubMed & Semantic Scholar) ?????????????????
router.get("/evidence/academic/search", searchAcademicEvidence);
router.post("/evidence/academic/ingest", ingestAcademicPaper);

// ??? Continuous 24h Monitoring & Hallucination Audits ?????????????????????????
router.get("/monitoring/dashboard", getMonitoringDashboard);
router.post("/monitoring/scan", triggerMonitoringScan);

// ??? ML, Fine-Tuning & Model Evaluation Benchmark ????????????????????????????
router.post("/ml/benchmark", runModelBenchmark);
router.get("/ml/export-dataset", exportDataset);
router.get("/ml/lora-config", getLoraConfig);
router.get("/ml/vector-search", searchEvidenceVector);

export default router;
