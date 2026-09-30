import crypto from "crypto";
import { PartnerInvite } from "../../models/PartnerInvite.js";
import { Notification } from "../../models/Notification.js";
import { logger } from "../../utils/logger.js";
import { partnerInviteEmail } from "../mail/partnerInviteEmail.js";
import { sendMail } from "../mail/sendMail.js";

const inviteLog = logger.module("PARTNER-INVITE");
const INVITE_MS = 7 * 24 * 60 * 60 * 1000;

export function hashInviteToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function syncPartnerInvite(input: {
  memberUserId: string;
  partnerEmail: string | null;
  consent: boolean;
  scopes: string[];
}): Promise<{ inviteSent: boolean }> {
  if (!input.consent || !input.partnerEmail) {
    await PartnerInvite.update(
      { status: "revoked" },
      { where: { memberUserId: input.memberUserId, status: "sent" } },
    );
    return { inviteSent: false };
  }

  await PartnerInvite.update(
    { status: "revoked" },
    { where: { memberUserId: input.memberUserId, status: "sent" } },
  );

  const rawToken = crypto.randomBytes(32).toString("hex");
  await PartnerInvite.create({
    memberUserId: input.memberUserId,
    partnerEmail: input.partnerEmail.toLowerCase(),
    tokenHash: hashInviteToken(rawToken),
    scopes: input.scopes,
    status: "sent",
    expiresAt: new Date(Date.now() + INVITE_MS),
  });

  const message = partnerInviteEmail(rawToken, input.scopes);
  try {
    const sent = await sendMail({ to: input.partnerEmail, ...message });
    if (!sent) inviteLog.warn(`Invite stored for member ${input.memberUserId} but mail is not configured`);
    return { inviteSent: sent };
  } catch (error) {
    inviteLog.error(`Invite email failed for member ${input.memberUserId}`, error);
    return { inviteSent: false };
  }
}

const SCOPE_COPY: Record<string, string> = {
  general_support: "General support recommendations",
  shared_activities: "Shared activities",
  communication_guidance: "Communication guidance",
};

export async function readPartnerInvite(rawToken: string) {
  const invite = await PartnerInvite.findOne({ where: { tokenHash: hashInviteToken(rawToken) } });
  if (!invite) return null;
  const expired = invite.expiresAt.getTime() < Date.now();
  const status = expired && invite.status === "sent" ? "expired" : invite.status;
  return {
    status,
    invitedEmail: invite.partnerEmail,
    mayShare: (invite.scopes ?? []).map((scope) => SCOPE_COPY[scope] ?? scope),
    notShared: ["Personal symptoms", "Raw tracking logs", "Private notes"],
  };
}

export async function respondToPartnerInvite(input: {
  rawToken: string;
  decision: "accepted" | "declined";
  partnerUserId?: string;
  partnerEmail?: string;
}): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const invite = await PartnerInvite.findOne({ where: { tokenHash: hashInviteToken(input.rawToken) } });
  if (!invite || invite.expiresAt.getTime() < Date.now() || invite.status !== "sent") {
    return { ok: false, status: 404, message: "This invitation is no longer open." };
  }

  if (input.decision === "accepted") {
    if (!input.partnerUserId || !input.partnerEmail) {
      return { ok: false, status: 401, message: "Sign in to join Partner Support." };
    }
    if (input.partnerEmail.toLowerCase() !== invite.partnerEmail.toLowerCase()) {
      return { ok: false, status: 403, message: "Sign in with the email this invitation was sent to." };
    }
    if (input.partnerUserId === invite.memberUserId) {
      return { ok: false, status: 403, message: "Use your partner's own account to join." };
    }
    await invite.update({ status: "accepted", partnerUserId: input.partnerUserId });
    await Notification.create({
      userId: invite.memberUserId,
      category: "partner",
      title: "Your partner joined",
      body: "Your partner accepted Partner Support. They still cannot see raw logs or private notes.",
    });
    return { ok: true };
  }

  await invite.update({ status: "declined" });
  return { ok: true };
}
