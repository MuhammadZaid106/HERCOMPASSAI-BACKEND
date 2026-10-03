import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { PartnerLessonProgress } from "../../models/PartnerLessonProgress.js";
import { getEvidenceById } from "../../ai/evidence/approvedEvidence.js";
import { ACADEMY_LESSONS, lessonBySlug } from "../../services/partner/academyCatalog.js";
import {
  PLUS_LINE,
  loadPartnerGate,
  topicAllowed,
  type PartnerGrant,
} from "../../services/partner/partnerAccess.js";
import { writePartnerAudit, type PartnerAuditAction } from "../../services/partner/partnerAudit.js";
import {
  activityGuide,
  buildPartnerContext,
  conversationGuide,
  evidenceSources,
  supportGuide,
} from "../../services/partner/partnerContext.js";
import { loadWeeklyDigest } from "../../services/partner/partnerDigestService.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";

async function openGate(req: AuthenticatedRequest, res: Response, action: PartnerAuditAction, topic: string) {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  const gate = await loadPartnerGate(req.user.userId, req.user.role);
  if (!gate.ok) {
    await writePartnerAudit({
      partnerUserId: req.user.userId,
      memberUserId: gate.memberUserId,
      action,
      topicAsked: topic,
      topicsAllowed: gate.topicsAllowed,
      result: gate.result,
    });
    sendError(res, gate.httpStatus, gate.message);
    return null;
  }
  return { partnerUserId: req.user.userId, gate };
}

function refuseTopic(
  res: Response,
  partnerUserId: string,
  gate: PartnerGrant,
  action: PartnerAuditAction,
  topic: string,
) {
  return writePartnerAudit({
    partnerUserId,
    memberUserId: gate.memberUserId,
    action,
    topicAsked: topic,
    topicsAllowed: gate.topicsAllowed,
    result: "refused",
  }).then(() => {
    sendError(res, 403, "That topic is not shared.");
  });
}

export async function getPartnerActivities(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const opened = await openGate(req, res, "activities_read", "shared_activities");
    if (!opened) return;
    if (!topicAllowed(opened.gate, "shared_activities")) {
      await refuseTopic(res, opened.partnerUserId, opened.gate, "activities_read", "shared_activities");
      return;
    }
    const context = buildPartnerContext({
      memberFirstName: opened.gate.memberFirstName,
      authorizedScope: opened.gate.topicsAllowed,
      evidenceIds: [],
    });
    const activities = activityGuide(context) ?? [];
    await writePartnerAudit({
      partnerUserId: opened.partnerUserId,
      memberUserId: opened.gate.memberUserId,
      action: "activities_read",
      topicAsked: "shared_activities",
      topicsAllowed: opened.gate.topicsAllowed,
      result: "allowed",
    });
    sendSuccess(res, 200, "Shared activities", {
      memberFirstName: opened.gate.memberFirstName,
      activities: activities.map((item) => ({
        ...item,
        sourceName: getEvidenceById(item.evidenceId)?.sourceName ?? null,
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPartnerAcademy(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const opened = await openGate(req, res, "academy_read", "academy");
    if (!opened) return;
    if (!opened.gate.academyIncluded) {
      await writePartnerAudit({
        partnerUserId: opened.partnerUserId,
        memberUserId: opened.gate.memberUserId,
        action: "academy_read",
        topicAsked: "academy",
        topicsAllowed: opened.gate.topicsAllowed,
        result: "empty",
      });
      sendSuccess(res, 200, PLUS_LINE, { included: false, plusMessage: PLUS_LINE, lessons: [] });
      return;
    }
    const progress = await PartnerLessonProgress.findAll({
      where: { partnerUserId: opened.partnerUserId },
    });
    const read = new Set(progress.map((row) => row.lessonSlug));
    await writePartnerAudit({
      partnerUserId: opened.partnerUserId,
      memberUserId: opened.gate.memberUserId,
      action: "academy_read",
      topicAsked: "academy",
      topicsAllowed: opened.gate.topicsAllowed,
      result: "allowed",
    });
    sendSuccess(res, 200, "Men's Academy", {
      included: true,
      lessons: ACADEMY_LESSONS.map((lesson) => ({
        slug: lesson.slug,
        category: lesson.category,
        title: lesson.title,
        version: lesson.version,
        summary: lesson.summary,
        read: read.has(lesson.slug),
      })),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPartnerLesson(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = String(req.params.slug ?? "");
    const opened = await openGate(req, res, "lesson_read", slug);
    if (!opened) return;
    if (!opened.gate.academyIncluded) {
      sendSuccess(res, 200, PLUS_LINE, { included: false, plusMessage: PLUS_LINE });
      return;
    }
    const lesson = lessonBySlug(slug);
    if (!lesson) {
      sendError(res, 404, "That lesson is not in the academy.");
      return;
    }
    const progress = await PartnerLessonProgress.findOne({
      where: { partnerUserId: opened.partnerUserId, lessonSlug: lesson.slug },
    });
    await writePartnerAudit({
      partnerUserId: opened.partnerUserId,
      memberUserId: opened.gate.memberUserId,
      action: "lesson_read",
      topicAsked: lesson.slug,
      topicsAllowed: opened.gate.topicsAllowed,
      result: "allowed",
    });
    sendSuccess(res, 200, lesson.title, {
      included: true,
      lesson: {
        ...lesson,
        sourceName: getEvidenceById(lesson.evidenceId)?.sourceName ?? null,
        read: Boolean(progress),
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function markPartnerLessonRead(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const slug = String(req.params.slug ?? "");
    const opened = await openGate(req, res, "lesson_read", slug);
    if (!opened) return;
    if (!opened.gate.academyIncluded) {
      sendError(res, 403, PLUS_LINE);
      return;
    }
    const lesson = lessonBySlug(slug);
    if (!lesson) {
      sendError(res, 404, "That lesson is not in the academy.");
      return;
    }
    const [row] = await PartnerLessonProgress.findOrCreate({
      where: { partnerUserId: opened.partnerUserId, lessonSlug: lesson.slug },
      defaults: { partnerUserId: opened.partnerUserId, lessonSlug: lesson.slug },
    });
    sendSuccess(res, 200, "Lesson marked read", { slug: lesson.slug, readAt: row.readAt });
  } catch (error) {
    next(error);
  }
}

export async function getPartnerSupport(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const opened = await openGate(req, res, "support_read", "general_support");
    if (!opened) return;
    if (!opened.gate.supportIncluded) {
      sendSuccess(res, 200, PLUS_LINE, { included: false, plusMessage: PLUS_LINE });
      return;
    }
    if (!topicAllowed(opened.gate, "general_support")) {
      await refuseTopic(res, opened.partnerUserId, opened.gate, "support_read", "general_support");
      return;
    }
    const guide = supportGuide(
      buildPartnerContext({
        memberFirstName: opened.gate.memberFirstName,
        authorizedScope: opened.gate.topicsAllowed,
        evidenceIds: [],
      }),
    );
    await writePartnerAudit({
      partnerUserId: opened.partnerUserId,
      memberUserId: opened.gate.memberUserId,
      action: "support_read",
      topicAsked: "general_support",
      topicsAllowed: opened.gate.topicsAllowed,
      result: "allowed",
    });
    sendSuccess(res, 200, "Support ideas", {
      included: true,
      memberFirstName: opened.gate.memberFirstName,
      lines: guide?.lines ?? [],
      sources: evidenceSources(guide?.evidenceIds ?? []),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPartnerConversation(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const opened = await openGate(req, res, "conversation_read", "communication_guidance");
    if (!opened) return;
    if (!opened.gate.supportIncluded) {
      sendSuccess(res, 200, PLUS_LINE, { included: false, plusMessage: PLUS_LINE });
      return;
    }
    if (!topicAllowed(opened.gate, "communication_guidance")) {
      await refuseTopic(res, opened.partnerUserId, opened.gate, "conversation_read", "communication_guidance");
      return;
    }
    const guide = conversationGuide(
      buildPartnerContext({
        memberFirstName: opened.gate.memberFirstName,
        authorizedScope: opened.gate.topicsAllowed,
        evidenceIds: [],
      }),
    );
    await writePartnerAudit({
      partnerUserId: opened.partnerUserId,
      memberUserId: opened.gate.memberUserId,
      action: "conversation_read",
      topicAsked: "communication_guidance",
      topicsAllowed: opened.gate.topicsAllowed,
      result: "allowed",
    });
    sendSuccess(res, 200, "Conversation ideas", {
      included: true,
      memberFirstName: opened.gate.memberFirstName,
      lines: guide?.lines ?? [],
      sources: evidenceSources(guide?.evidenceIds ?? []),
    });
  } catch (error) {
    next(error);
  }
}

export async function getPartnerDigest(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const opened = await openGate(req, res, "digest_read", "partner_digest");
    if (!opened) return;
    if (!opened.gate.digestIncluded) {
      await writePartnerAudit({
        partnerUserId: opened.partnerUserId,
        memberUserId: opened.gate.memberUserId,
        action: "digest_read",
        topicAsked: "partner_digest",
        topicsAllowed: opened.gate.topicsAllowed,
        result: "empty",
      });
      sendSuccess(res, 200, PLUS_LINE, { included: false, plusMessage: PLUS_LINE });
      return;
    }
    const digest = await loadWeeklyDigest({
      memberUserId: opened.gate.memberUserId,
      partnerUserId: opened.partnerUserId,
      memberFirstName: opened.gate.memberFirstName,
      topicsAllowed: opened.gate.topicsAllowed,
    });
    await writePartnerAudit({
      partnerUserId: opened.partnerUserId,
      memberUserId: opened.gate.memberUserId,
      action: "digest_read",
      topicAsked: "partner_digest",
      topicsAllowed: opened.gate.topicsAllowed,
      result: "allowed",
    });
    sendSuccess(res, 200, "Weekly partner digest", {
      included: true,
      memberFirstName: opened.gate.memberFirstName,
      weekStart: digest.weekStart,
      replayed: digest.replayed,
      sections: digest.sections,
      sources: evidenceSources(digest.sections.evidenceIds),
    });
  } catch (error) {
    next(error);
  }
}
