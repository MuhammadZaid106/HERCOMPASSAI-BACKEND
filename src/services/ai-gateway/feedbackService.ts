import { Op, type WhereOptions } from "sequelize";
import { AiAuditLog, AiFeedback, AiFlag } from "../../models/index.js";
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
export type FlagReason = AiFlag["reason"];
export type FlagSeverity = AiFlag["severity"];
export type ReviewStatus = AiFlag["reviewStatus"];

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

export interface ReviewQueueQuery {
  /** `open` means open + in review: the set nobody has closed out. */
  status?: ReviewStatus | "all";
  severity?: FlagSeverity;
  limit?: number;
  offset?: number;
}

export interface ReviewQueueItem {
  id: string;
  requestId: string;
  userId: string;
  feature: string;
  reason: FlagReason;
  severity: FlagSeverity;
  detail: string | null;
  reviewStatus: ReviewStatus;
  reviewedBy: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  /** From the audit row, so a reviewer can see which citations the event used. */
  citationIds: string[] | null;
  resultStatus: string | null;
  safetyStatus: string | null;
  sciFindingCodes: string[] | null;
  latencyMs: number | null;
  /** The member's own words, when they left any. */
  memberComment: string | null;
}

/**
 * Which review flag, if any, each rating opens.
 *
 * `helpful` is absent rather than mapped to a placeholder: a thumbs-up is worth
 * keeping in `ai_feedback` but is not something a human needs to review, so it
 * opens nothing.
 */
const FLAG_BY_RATING: Partial<
  Record<FeedbackRating, { reason: FlagReason; severity: FlagSeverity }>
> = {
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

  const mapping = FLAG_BY_RATING[input.rating];
  if (!mapping) {
    // Unreachable while `FeedbackRating` and this table agree. Guarded anyway, so
    // adding a rating later cannot quietly record feedback that opens no flag.
    feedbackLog.error(`No review-flag mapping for rating "${input.rating}"`, {
      requestId: input.requestId,
    });
    return { recorded: true, flagged: false };
  }

  const { reason, severity } = mapping;

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

/**
 * List the review queue, most urgent first.
 *
 * This is the read half of the human-in-the-loop loop. `ai_flags` was write-only
 * until now: a member could report a concern, a high-severity row was created, and
 * no human had any way to see it.
 *
 * Reads the member's own words from `ai_feedback.comment`, because a reviewer
 * cannot triage "this is wrong" without knowing what the member objected to. It
 * reads no health data and no generated content — only the audit row's own
 * classification fields.
 */
export async function listReviewQueue(
  options: ReviewQueueQuery = {}
): Promise<{ flags: ReviewQueueItem[]; total: number }> {
  const where: WhereOptions<AiFlag> = {};

  if (options.status === "open") {
    // `in_review` belongs in the triage view: somebody has picked it up, but it is
    // still not closed.
    where.reviewStatus = { [Op.in]: ["open", "in_review"] };
  } else if (options.status && options.status !== "all") {
    where.reviewStatus = options.status;
  }

  if (options.severity) {
    where.severity = options.severity;
  }

  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);

  const rows = await AiFlag.findAll({
    where,
    // Newest first within a severity. Severity is the ENUM order low < medium <
    // high in PostgreSQL, so DESC puts a member's reported concern above a model
    // tripping a guardrail — which is the right priority: one is a person saying
    // something is wrong, the other is a rule working correctly.
    order: [
      ["severity", "DESC"],
      ["createdAt", "ASC"],
    ],
    limit,
    offset,
    include: [{ model: AiAuditLog, as: "aiEvent", required: false }],
  });

  const total = await AiFlag.count({ where });

  // One query for every comment rather than a per-row lookup.
  const requestIds = rows.map((flag) => flag.requestId);
  const comments =
    requestIds.length > 0
      ? await AiFeedback.findAll({
          where: { requestId: { [Op.in]: requestIds } },
          attributes: ["requestId", "rating", "comment"],
          order: [["createdAt", "DESC"]],
        })
      : [];
  const commentByRequest = new Map<string, { comment: string | null }>();
  for (const row of comments) {
    if (!commentByRequest.has(row.requestId) && row.comment) {
      commentByRequest.set(row.requestId, { comment: row.comment });
    }
  }

  return {
    total,
    flags: rows.map((flag) => {
      const event = flag.aiEvent as AiAuditLog | undefined;
      return {
        id: flag.id,
        requestId: flag.requestId,
        userId: flag.userId,
        feature: flag.feature,
        reason: flag.reason,
        severity: flag.severity,
        detail: flag.detail,
        reviewStatus: flag.reviewStatus,
        reviewedBy: flag.reviewedBy,
        reviewedAt: flag.reviewedAt ?? null,
        createdAt: flag.createdAt,
        citationIds: event?.citationIds ?? null,
        resultStatus: event?.resultStatus ?? null,
        safetyStatus: event?.safetyStatus ?? null,
        sciFindingCodes: event?.sciFindingCodes ?? null,
        latencyMs: event?.latencyMs ?? null,
        memberComment: commentByRequest.get(flag.requestId)?.comment ?? null,
      };
    }),
  };
}

/**
 * Close out a flag.
 *
 * Marks the feedback rows behind it as reviewed too, so the same complaint does not
 * reappear in an unreviewed list after triage.
 */
export async function resolveFlag(
  flagId: string,
  reviewer: string,
  status: Extract<ReviewStatus, "resolved" | "dismissed" | "in_review">
): Promise<boolean> {
  const [updated] = await AiFlag.update(
    { reviewStatus: status, reviewedBy: reviewer, reviewedAt: new Date() },
    { where: { id: flagId } }
  );

  if (updated === 0) return false;

  const flag = await AiFlag.findByPk(flagId, { attributes: ["requestId"] });
  if (flag) {
    await AiFeedback.update(
      { reviewed: true, reviewedAt: new Date() },
      { where: { requestId: flag.requestId } }
    );
  }

  feedbackLog.info(`AI flag ${flagId} moved to ${status} by ${reviewer}`);
  return true;
}

/** Counts for the queue header: how bad is it, and how much is left. */
export async function reviewQueueSummary(): Promise<{
  open: number;
  inReview: number;
  highSeverity: number;
  resolved: number;
  dismissed: number;
}> {
  const [open, inReview, highSeverity, resolved, dismissed] = await Promise.all([
    AiFlag.count({ where: { reviewStatus: "open" } }),
    AiFlag.count({ where: { reviewStatus: "in_review" } }),
    AiFlag.count({
      where: { reviewStatus: { [Op.in]: ["open", "in_review"] }, severity: "high" },
    }),
    AiFlag.count({ where: { reviewStatus: "resolved" } }),
    AiFlag.count({ where: { reviewStatus: "dismissed" } }),
  ]);

  return { open, inReview, highSeverity, resolved, dismissed };
}
