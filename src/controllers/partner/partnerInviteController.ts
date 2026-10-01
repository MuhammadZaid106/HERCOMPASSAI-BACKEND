import type { Response, NextFunction } from "express";
import type { Request } from "express";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { sendError, sendSuccess } from "../../utils/apiResponse.js";
import { readPartnerInvite, respondToPartnerInvite } from "../../services/partner/partnerInviteService.js";
import { User } from "../../models/index.js";
import { issueSession } from "../auth/authController.js";

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

    // Accepting grants the partner role on the user row, but the access token this
    // request arrived with still carries role "member". Every role-gated route
    // checks the token, so the caller would be refused partner features until that
    // token expired. A fresh pair here means the new role takes effect now.
    const userId = req.user?.userId;
    const user = userId ? await User.findByPk(userId) : null;
    if (!user) {
      sendError(res, 401, "Sign in to join Partner Support.");
      return;
    }
    const { accessToken, refreshToken } = await issueSession(user);

    sendSuccess(res, 200, "Welcome to HerCompassAI Partner Support.", {
      accepted: true,
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
      },
    });
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
