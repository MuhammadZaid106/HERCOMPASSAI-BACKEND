import type { Request, Response, NextFunction } from "express";
import { listAcademyLessons } from "../../services/partner/academyCatalog.js";
import { listApprovedEvidence, clinicianReviewSummary } from "../../services/ai-gateway/evidenceService.js";
import { sendSuccess } from "../../utils/apiResponse.js";
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
