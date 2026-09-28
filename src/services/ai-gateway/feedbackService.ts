import { AiFeedback, AiFlag } from "../../models/index.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import type { GatewayFeature } from "../../ai/types/index.js";

/**
 * User feedback and the internal review queue (spec Step 26 / Section 15).
 *
 *   AI output -> user feedback -> AI flag -> review -> resolution -> evaluation data
 *
 * Feedback never trains a model directly. It becomes a flag that a human reviews
 * before anything enters an evaluation dataset (spec Step 67).
 */

const feedbackLog = logger.module("AI-FEEDBACK");

export type FeedbackRating = "helpful" | "not_helpful" | "report_concern";

export interface RecordFeedbackInput {
  userId: string;
  requestId: string;
  feature: GatewayFeature;
  rating: FeedbackRating;
  comment?: string | null;
}

export interface RecordFeedbackResult {
  recorded: boolean;
  flagged: boolean;
}

const FLAG_BY_RATING: Record<FeedbackRating, { reason: AiFlag["reason"]; severity: AiFlag["severity"] }> = {
  helpful: { reason: "manual", severity: "low" },
  not_helpful: { reason: "user_not_helpful", severity: "medium" },
  report_concern: { reason: "user_report_concern", severity: "high" },
};

export async function recordAiFeedback(
  input: RecordFeedbackInput
): Promise<RecordFeedbackResult> {
  if (env.DATABASE_URL.trim() === "") {
    feedbackLog.warn(
      `AI feedback not persisted (no DATABASE_URL). request=${input.requestId} rating=${input.rating}`
    );
    return { recorded: false, flagged: false };
  }

  await AiFeedback.create({
    userId: input.userId,
    requestId: input.requestId,
    feature: input.feature,
    rating: input.rating,
    comment: input.comment ?? null,
  });

  if (input.rating === "helpful") {
    return { recorded: true, flagged: false };
  }

  const { reason, severity } = FLAG_BY_RATING[input.rating];

  await AiFlag.create({
    requestId: input.requestId,
    userId: input.userId,
    feature: input.feature,
    reason,
    severity,
    detail: input.comment ?? null,
    reviewStatus: "open",
  });

  feedbackLog.info(
    `AI flag opened for request ${input.requestId} (reason=${reason}, severity=${severity}).`
  );

  return { recorded: true, flagged: true };
}
