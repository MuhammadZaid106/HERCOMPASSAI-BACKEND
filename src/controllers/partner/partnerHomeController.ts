import type { NextFunction, Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { loadPartnerHome, partnerHomeAllowed } from "../../services/partner/partnerHome.js";
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
