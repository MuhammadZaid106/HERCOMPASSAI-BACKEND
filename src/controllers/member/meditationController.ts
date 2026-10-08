import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { OnboardingProfile, SavedContent, SnapshotVersion, User } from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { resolveMemberPlan } from "../../services/member/planCatalog.js";
import {
  MEDITATION_SOURCE,
  PLUS_MEDITATION_LINE,
  meditationIncluded,
  orderedSessions,
  suggestionFor,
  type MeditationSession,
} from "../../services/member/meditationCatalog.js";
import { meditationLibrary } from "../../services/member/publishedLibrary.js";

const saveSchema = z.object({
  saved: z.boolean(),
  started: z.boolean(),
});

function memberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  if (req.user.role !== "member") {
    sendError(res, 403, "This library is for member accounts");
    return null;
  }
  return req.user.userId;
}

async function practiceContext(userId: string) {
  const user = await User.findByPk(userId);
  const profile = await OnboardingProfile.findOne({ where: { userId } });
  const version = await SnapshotVersion.findOne({
    where: { userId },
    order: [["versionNumber", "DESC"]],
  });
  return {
    plan: resolveMemberPlan(user?.plan),
    meditationFrequency: profile?.meditationFrequency ?? null,
    focus: version?.dominantFocusArea || profile?.primaryGoal || "",
  };
}

function publicSession(
  item: MeditationSession,
  plan: string,
  suggestionSlug: string,
  suggestion: string,
  row: SavedContent | null,
  withSteps: boolean,
) {
  const included = meditationIncluded(plan, item);
  return {
    slug: item.slug,
    title: item.title,
    focus: item.focus,
    minutes: item.minutes,
    included,
    saved: Boolean(row?.saved),
    started: Boolean(row?.started),
    why: item.slug === suggestionSlug ? suggestion : item.why,
    steps: included && withSteps ? item.steps : null,
    sourceName: MEDITATION_SOURCE.name,
    sourceYear: MEDITATION_SOURCE.year,
    sourceNote: MEDITATION_SOURCE.note,
    plusMessage: included ? null : PLUS_MEDITATION_LINE,
  };
}

export async function listMeditations(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const context = await practiceContext(userId);
    const sessions = await meditationLibrary();
    const suggestion = suggestionFor(context, sessions);
    const rows = await SavedContent.findAll({ where: { userId, kind: "meditation" } });
    sendSuccess(res, 200, "Meditation", {
      suggestion: suggestion.sentence,
      suggestedSlug: suggestion.slug,
      items: orderedSessions(context, sessions).map((item) =>
        publicSession(
          item,
          context.plan,
          suggestion.slug,
          suggestion.sentence,
          rows.find((row) => row.slug === item.slug) ?? null,
          false,
        ),
      ),
    });
  } catch (error) {
    next(error);
  }
}

export async function getMeditation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const item = (await meditationLibrary()).find((entry) => entry.slug === String(req.params.slug ?? ""));
    if (!item) {
      sendError(res, 404, "This session is not in the library");
      return;
    }
    const context = await practiceContext(userId);
    const sessions = await meditationLibrary();
    const suggestion = suggestionFor(context, sessions);
    const row = await SavedContent.findOne({ where: { userId, kind: "meditation", slug: item.slug } });
    sendSuccess(res, 200, "Meditation", publicSession(item, context.plan, suggestion.slug, suggestion.sentence, row, true));
  } catch (error) {
    next(error);
  }
}

export async function saveMeditation(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const sessions = await meditationLibrary();
    const item = sessions.find((entry) => entry.slug === String(req.params.slug ?? ""));
    if (!item) {
      sendError(res, 404, "This session is not in the library");
      return;
    }
    const context = await practiceContext(userId);
    if (!meditationIncluded(context.plan, item)) {
      sendError(res, 403, PLUS_MEDITATION_LINE);
      return;
    }
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Choose whether to save this session");
      return;
    }
    const [row] = await SavedContent.findOrCreate({
      where: { userId, kind: "meditation", slug: item.slug },
      defaults: { userId, kind: "meditation", slug: item.slug },
    });
    await row.update({ saved: parsed.data.saved, started: parsed.data.started });
    const suggestion = suggestionFor(context, sessions);
    sendSuccess(res, 200, "Session updated", publicSession(item, context.plan, suggestion.slug, suggestion.sentence, row, true));
  } catch (error) {
    next(error);
  }
}
