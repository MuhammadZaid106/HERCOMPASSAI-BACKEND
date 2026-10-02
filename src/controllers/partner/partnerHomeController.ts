import type { NextFunction, Response } from "express";
import { z } from "zod";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { User } from "../../models/User.js";
import { loadPartnerHome, partnerHomeAllowed } from "../../services/partner/partnerHome.js";
import { leavePartnerSupport } from "../../services/partner/partnerInviteService.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";

const homeLog = logger.module("PARTNER-HOME");

export async function getPartnerHome(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.userId) {
      sendError(res, 401, "Authentication required");
      return;
    }
    if (!partnerHomeAllowed(req.user.role)) {
      sendError(res, 403, "Only partner accounts can open Partner Support");
      return;
    }

    const home = await loadPartnerHome(req.user.userId);
    homeLog.info(`Partner home for ${req.user.userId}: connected=${home.connected}`);
    sendSuccess(res, 200, "Partner home", home);
  } catch (error) {
    next(error);
  }
}

export async function postPartnerLeave(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.userId) {
      sendError(res, 401, "Authentication required");
      return;
    }
    if (!partnerHomeAllowed(req.user.role)) {
      sendError(res, 403, "Only partner accounts can open Partner Support");
      return;
    }
    const left = await leavePartnerSupport(req.user.userId);
    if (!left.ok) {
      sendError(res, left.status, left.message);
      return;
    }
    homeLog.info(`Partner ${req.user.userId} left Partner Support`);
    sendSuccess(res, 200, "You left Partner Support. Nothing further is shared.", { access: "off" });
  } catch (error) {
    next(error);
  }
}

const partnerNameSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(100),
});

export async function updatePartnerName(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user?.userId) {
      sendError(res, 401, "Authentication required");
      return;
    }
    if (!partnerHomeAllowed(req.user.role)) {
      sendError(res, 403, "Only partner accounts can open Partner Support");
      return;
    }
    const parsed = partnerNameSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 422, "Check the name and try again");
      return;
    }
    const user = await User.findByPk(req.user.userId);
    if (!user) {
      sendError(res, 404, "Partner account not found");
      return;
    }
    await user.update({ name: parsed.data.name });
    homeLog.info(`Partner name updated for ${req.user.userId}`);
    sendSuccess(res, 200, "Name updated", {
      name: user.name,
      email: user.email,
      role: user.role,
      plan: user.plan,
      createdAt: user.createdAt,
    });
  } catch (error) {
    next(error);
  }
}
