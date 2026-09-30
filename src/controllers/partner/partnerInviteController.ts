import type { Response, NextFunction } from "express";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { readPartnerInvite, respondToPartnerInvite } from "../../services/partner/partnerInviteService.js";

export async function getPartnerInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = String(req.params.token ?? "");
    const invite = await readPartnerInvite(token);
    if (!invite) {
      sendError(res, 404, "This invitation is no longer open.");
      return;
    }
    sendSuccess(res, 200, "Invitation", invite);
  } catch (error) {
    next(error);
  }
}

export async function acceptPartnerInvite(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const result = await respondToPartnerInvite({
      rawToken: String(req.params.token ?? ""),
      decision: "accepted",
      partnerUserId: req.user?.userId,
      partnerEmail: req.user?.email,
    });
    if (!result.ok) {
      sendError(res, result.status, result.message);
      return;
    }
    sendSuccess(res, 200, "Welcome to HerCompassAI Partner Support.", { accepted: true });
  } catch (error) {
    next(error);
  }
}

export async function declinePartnerInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await respondToPartnerInvite({
      rawToken: String(req.params.token ?? ""),
      decision: "declined",
    });
    if (!result.ok) {
      sendError(res, result.status, result.message);
      return;
    }
    sendSuccess(res, 200, "You declined Partner Support. Nothing was shared.", { declined: true });
  } catch (error) {
    next(error);
  }
}
