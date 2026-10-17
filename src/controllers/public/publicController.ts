import type { Request, Response, NextFunction } from "express";
import { listAcademyLessons } from "../../services/partner/academyCatalog.js";
import { listApprovedEvidence, clinicianReviewSummary } from "../../services/ai-gateway/evidenceService.js";
import { createGuestSnapshot } from "../../services/onboarding/guestSnapshotService.js";
import { guestSnapshotPayloadSchema } from "../onboarding/onboardingSchemas.js";
import { env } from "../../config/env.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

const publicLog = logger.module("PUBLIC_API");

/**
 * GET /api/public/academy/episodes
 * Public Men's Academy track list for marketing hub and unauthenticated visitors.
 * DB-first with fallback to ACADEMY_LESSONS.
 */
export async function getPublicAcademyEpisodes(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const lessons = await listAcademyLessons();
    const episodes = lessons.map((lesson, index) => {
      const trackNum = lesson.trackNumber ?? String(index + 1).padStart(2, "0");
      return {
        slug: lesson.slug,
        title: lesson.title,
        category: lesson.category,
        trackNumber: trackNum,
        duration: lesson.duration ?? "3:00",
        description: lesson.summary,
        summary: lesson.summary,
        takeaway: lesson.takeaway ?? (lesson.paragraphs[1] || lesson.summary),
        listenContext: lesson.listenContext ?? "Recommended for supportive partner listening.",
        paragraphs: lesson.paragraphs,
        evidenceId: lesson.evidenceId,
        read: false,
      };
    });

    publicLog.info(`Public academy episodes retrieved (${episodes.length} items)`);
    sendSuccess(res, 200, "Academy curriculum", { episodes });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/public/evidence/summary
 * Dynamic evidence and authority body proof for homepage and public evidence pages.
 * Aggregates live approved evidence records and authority bodies.
 */
export async function getPublicEvidenceSummary(
  _req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const approved = listApprovedEvidence();
    const reviewStats = clinicianReviewSummary();

    // Group authorities dynamically
    const publisherMap = new Map<string, { name: string; count: number; category: string }>();
    for (const record of approved) {
      const pub = record.publisher || record.sourceName;
      const existing = publisherMap.get(pub);
      if (existing) {
        existing.count += 1;
      } else {
        publisherMap.set(pub, {
          name: pub,
          count: 1,
          category: record.sourceCategory,
        });
      }
    }

    const authorities = Array.from(publisherMap.values());
    const topicAreas = Array.from(new Set(approved.flatMap((item) => item.topicAreas)));

    const summary = {
      totalApprovedRecords: approved.length,
      authorities,
      topicAreas,
      clinicianReviewStatus: reviewStats.fullyClinicianReviewed ? "signed" : "pending_named_clinician",
      citations: approved.map((rec) => ({
        evidenceId: rec.evidenceId,
        citationId: rec.citationId,
        sourceName: rec.sourceName,
        title: rec.title,
        publisher: rec.publisher,
        publicationDate: rec.publicationDate,
        authorityLevel: rec.authorityLevel,
        consensusLevel: rec.consensusLevel,
      })),
    };

    publicLog.info(`Public evidence summary retrieved (${authorities.length} authorities, ${approved.length} records)`);
    sendSuccess(res, 200, "Evidence summary", summary);
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/public/snapshot
 * The one free, no-signup Personal Menopause Snapshot.
 *
 * Unauthenticated by design — that is the feature — so it is rate-limited and
 * the one-free rule is enforced server-side inside the service. A repeat request
 * from the same hashed subject is refused with `guest_limit_reached`, which is
 * the signal the frontend turns into "create a free account to continue".
 */
export async function postGuestSnapshot(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!env.GUEST_SNAPSHOT_ENABLED) {
      sendError(res, 404, "The free Snapshot preview is not available right now.");
      return;
    }

    const validation = guestSnapshotPayloadSchema.safeParse(req.body);
    if (!validation.success) {
      sendError(res, 400, "Invalid Snapshot data", validation.error.flatten().fieldErrors);
      return;
    }

    const ip =
      req.ip ||
      (typeof req.headers["x-forwarded-for"] === "string"
        ? req.headers["x-forwarded-for"].split(",")[0]?.trim()
        : null) ||
      null;
    const userAgent = (req.headers["user-agent"] as string) || null;

    const outcome = await createGuestSnapshot({
      payload: validation.data,
      fingerprint: validation.data.fingerprint,
      ip,
      userAgent,
    });

    if (!outcome.ok) {
      sendError(res, outcome.statusCode, outcome.message, { reason: outcome.reason });
      return;
    }

    publicLog.info(`Guest Snapshot served (request ${outcome.requestId}).`);
    sendSuccess(res, 200, "Free Personal Menopause Snapshot", {
      snapshot: outcome.snapshot,
      generated: outcome.generated,
      requestId: outcome.requestId,
      // The browser keeps this to claim the guest account if they sign up.
      claimToken: outcome.claimToken,
      expiresAt: outcome.expiresAt,
    });
  } catch (error) {
    next(error);
  }
}
