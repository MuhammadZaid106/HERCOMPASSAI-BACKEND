import type { Response, NextFunction } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { CommunityNote, User } from "../../models/index.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import { firstNameFrom, type CommunityNoteStatus } from "../../services/member/communityBoard.js";

const communityLog = logger.module("COMMUNITY");

const reviewSchema = z.object({
  status: z.enum(["approved", "hidden"]),
});

const queueFilter = z.enum(["pending", "approved", "hidden", "all"]);

function staffNote(row: CommunityNote, authorName: string | null) {
  return {
    id: row.id,
    topic: row.topic,
    body: row.body,
    status: row.status,
    firstName: firstNameFrom(authorName),
    createdAt: row.createdAt,
    reviewedAt: row.reviewedAt,
  };
}

export async function listCommunityNotes(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const parsed = queueFilter.safeParse(typeof req.query.status === "string" ? req.query.status : "pending");
    const status: CommunityNoteStatus | "all" = parsed.success ? parsed.data : "pending";
    const rows = await CommunityNote.findAll({
      where: status === "all" ? {} : { status },
      include: [{ model: User, as: "author", attributes: ["name"] }],
      order: [["createdAt", "DESC"]],
    });
    sendSuccess(res, 200, "Community review", {
      notes: rows.map((row) => {
        const author = row.get("author") as { name?: string } | undefined;
        return staffNote(row, author?.name ?? null);
      }),
    });
  } catch (error) {
    next(error);
  }
}

export async function reviewCommunityNote(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  try {
    const staffId = req.user?.userId;
    if (!staffId) {
      sendError(res, 401, "Authentication required");
      return;
    }
    const parsed = reviewSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 400, "Choose approve or hide");
      return;
    }
    const row = await CommunityNote.findByPk(String(req.params.id ?? ""), {
      include: [{ model: User, as: "author", attributes: ["name"] }],
    });
    if (!row) {
      sendError(res, 404, "This note is not in the queue");
      return;
    }
    await row.update({
      status: parsed.data.status,
      reviewedBy: staffId,
      reviewedAt: new Date(),
    });
    communityLog.info(`Community note ${parsed.data.status} id: ${row.id} staffId: ${staffId}`);
    const author = row.get("author") as { name?: string } | undefined;
    sendSuccess(res, 200, parsed.data.status === "approved" ? "Note approved" : "Note hidden", {
      note: staffNote(row, author?.name ?? null),
    });
  } catch (error) {
    next(error);
  }
}
