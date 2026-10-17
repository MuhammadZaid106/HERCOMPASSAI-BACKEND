import type { Request, Response } from "express";
import { nutritionRadarService } from "../../services/intelligence/nutritionRadarService.js";
import { correlationEngine } from "../../services/intelligence/correlationEngine.js";
import { coupleChallengesService } from "../../services/partner/coupleChallengesService.js";
import { SymptomEntry } from "../../models/index.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { env } from "../../config/env.js";

/**
 * GET /api/member/nutrition-radar
 */
export async function getNutritionRadar(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  let symptoms: string[] = ["Night sweats", "Sleep disruption"];

  if (userId && env.DATABASE_URL && env.DATABASE_URL.trim() !== "") {
    try {
      const latest = await SymptomEntry.findOne({
        where: { userId },
        order: [["createdAt", "DESC"]],
      });
      if (latest && Array.isArray(latest.symptoms)) {
        symptoms = latest.symptoms as string[];
      }
    } catch {
      // fallback to baseline
    }
  }

  const profile = nutritionRadarService.calculateProfile({
    symptoms,
    sleepHours: 5,
    notes: "Stressful week at work, evening fatigue.",
  });

  sendSuccess(res, 200, "Nutrition radar profile calculated", { profile });
}

/**
 * GET /api/member/predictions
 */
export async function getPredictiveCorrelations(req: Request, res: Response): Promise<void> {
  const predictions = correlationEngine.calculatePredictions({
    symptoms: ["Night sweats", "Insomnia"],
    sleepDisturbance: true,
    stressLevel: "high",
    caffeineLate: true,
  });

  sendSuccess(res, 200, "Predictive correlation insights retrieved", { predictions });
}

/**
 * GET /api/member/challenges
 */
export async function getCoupleChallenges(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id || "guest-pair";
  const challenges = await coupleChallengesService.getChallengeProgress(userId);
  sendSuccess(res, 200, "Couple challenges progress retrieved", { challenges });
}

/**
 * POST /api/member/challenges/:challengeId/complete
 */
export async function completeCoupleChallenge(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id || "guest-pair";
  const { challengeId } = req.params;
  const role = req.user?.role === "partner" ? "partner" : "member";

  const updated = await coupleChallengesService.recordActivity(userId, challengeId, role);
  sendSuccess(res, 200, "Challenge step recorded successfully", { challenge: updated });
}
