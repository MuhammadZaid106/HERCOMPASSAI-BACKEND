import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { CommunityNote, User } from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import {
  COMMUNITY_TOPICS,
  communityPostAllowed,
  parseCommunityNote,
  presentMemberNote,
  type CommunityNoteStatus,
  type CommunityTopicId,
} from "../../services/member/communityBoard.js";

const communityLog = logger.module("COMMUNITY");

function memberId(req: AuthenticatedRequest, res: Response): string | null {
  if (!req.user?.userId) {
    sendError(res, 401, "Authentication required");
    return null;
  }
  if (!communityPostAllowed(req.user.role)) {
    sendError(res, 403, "Community notes are for member accounts");
    return null;
  }
  return req.user.userId;
}

export async function listCommunity(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const rows = await CommunityNote.findAll({
      include: [{ model: User, as: "author", attributes: ["name"] }],
      order: [["createdAt", "DESC"]],
    });
    const notes = rows.flatMap((row) => {
      const author = row.get("author") as { name?: string } | undefined;
      const view = presentMemberNote(
        {
          id: row.id,
          userId: row.userId,
          topic: row.topic,
          body: row.body,
          status: row.status,
          authorName: author?.name ?? null,
        },
        userId,
      );
      return view ? [view] : [];
    });
    sendSuccess(res, 200, "Community", {
      notice:
        "These notes are member experiences, and a clinician is the right person for a medical question.",
      topics: COMMUNITY_TOPICS,
      notes,
    });
  } catch (error) {
    next(error);
  }
}

export async function createCommunityNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = memberId(req, res);
    if (!userId) return;
    const parsed = parseCommunityNote(req.body);
    if (!parsed.ok) {
      sendError(res, 400, parsed.message);
      return;
    }
    const row = await CommunityNote.create({
      userId,
      topic: parsed.topic,
      body: parsed.body,
      status: "pending",
    });
    const author = await User.findByPk(userId, { attributes: ["name"] });
    communityLog.info(`Community note created by userId: ${userId} topic: ${parsed.topic}`);
    const view = presentMemberNote(
      {
        id: row.id,
        userId,
        topic: parsed.topic,
        body: parsed.body,
        status: "pending",
        authorName: author?.name ?? null,
      },
      userId,
    );
    sendSuccess(res, 201, "Your note is waiting for review", { note: view });
  } catch (error) {
    next(error);
  }
}

export function isCommunityStatus(value: string): value is CommunityNoteStatus {
  return value === "pending" || value === "approved" || value === "hidden";
}

export function isCommunityTopic(value: string): value is CommunityTopicId {
  return COMMUNITY_TOPICS.some((topic) => topic.id === value);
}
