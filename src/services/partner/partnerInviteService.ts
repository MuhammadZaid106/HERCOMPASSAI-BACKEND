import crypto from "crypto";
import { Op } from "sequelize";
import { PartnerInvite } from "../../models/PartnerInvite.js";
import { Notification } from "../../models/Notification.js";
import { OnboardingProfile } from "../../models/OnboardingProfile.js";
import { User } from "../../models/User.js";
import { logger } from "../../utils/logger.js";
import { buildPartnerInviteUrl, partnerInviteEmail } from "../mail/partnerInviteEmail.js";
import { appBaseUrl, sendMail } from "../mail/sendMail.js";

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
  /** A new link replaces any invitation that has not been accepted yet. */
  rotate?: boolean;
  sendEmail?: boolean;
}): Promise<{ inviteSent: boolean; inviteUrl: string | null }> {
  if (!input.consent || !input.partnerEmail) {
    await PartnerInvite.update(
      { status: "revoked" },
      { where: { memberUserId: input.memberUserId, status: "sent" } },
    );
    return { inviteSent: false, inviteUrl: null };
  }

  if (!input.rotate) {
    const openInvite = await PartnerInvite.findOne({
      where: { memberUserId: input.memberUserId, status: "sent" },
      order: [["updatedAt", "DESC"]],
    });
    if (openInvite) {
      await openInvite.update({ scopes: input.scopes });
      return { inviteSent: false, inviteUrl: null };
    }
  }

  await PartnerInvite.update(
    { status: "revoked" },
    { where: { memberUserId: input.memberUserId, status: "sent" } },
  );

  const rawToken = crypto.randomBytes(32).toString("hex");
  const inviteUrl = buildPartnerInviteUrl(appBaseUrl(), rawToken);
  await PartnerInvite.create({
    memberUserId: input.memberUserId,
    partnerEmail: input.partnerEmail.toLowerCase(),
    tokenHash: hashInviteToken(rawToken),
    scopes: input.scopes,
    status: "sent",
    expiresAt: new Date(Date.now() + INVITE_MS),
  });

  if (!input.sendEmail) {
    return { inviteSent: false, inviteUrl };
  }

  const message = partnerInviteEmail(rawToken, input.scopes);
  try {
    const sent = await sendMail({ to: input.partnerEmail, ...message });
    if (!sent) inviteLog.warn(`Invite stored for member ${input.memberUserId} but mail is not configured`);
    return { inviteSent: sent, inviteUrl };
  } catch (error) {
    inviteLog.error(`Invite email failed for member ${input.memberUserId}`, error);
    return { inviteSent: false, inviteUrl };
  }
}

/**
 * A copyable invitation for a member who already saved a partner email.
 * An accepted partner does not need a new link.
 */
export async function issuePartnerInviteLink(memberUserId: string): Promise<
  | { ok: true; inviteUrl: string }
  | { ok: false; status: number; message: string }
> {
  const profile = await OnboardingProfile.findOne({ where: { userId: memberUserId } });
  if (!profile?.partnerConsent || !profile.partnerEmail?.trim()) {
    return { ok: false, status: 400, message: "Turn sharing on and save a partner email first." };
  }
  const accepted = await PartnerInvite.findOne({
    where: { memberUserId, status: "accepted" },
  });
  if (accepted) {
    return { ok: false, status: 409, message: "Your partner already joined. A new link is not needed." };
  }
  const invite = await syncPartnerInvite({
    memberUserId,
    partnerEmail: profile.partnerEmail,
    consent: true,
    scopes: profile.partnerSharingScopes ?? [],
    rotate: true,
    sendEmail: false,
  });
  if (!invite.inviteUrl) {
    return { ok: false, status: 500, message: "We couldn't prepare that invitation link." };
  }
  return { ok: true, inviteUrl: invite.inviteUrl };
}

export interface ConnectedPartnerView {
  firstName: string;
  email: string;
  joinedAt: string;
  sharingOn: boolean;
  scopes: string[];
}

function firstNameFrom(name: string | null | undefined, email: string): string {
  const first = name?.trim().split(/\s+/)[0];
  if (first) return first;
  const local = email.split("@")[0]?.trim();
  return local || "Partner";
}

/** The partner who accepted, with only the details the member already chose to share. */
export async function connectedPartnerFor(memberUserId: string): Promise<ConnectedPartnerView | null> {
  const invite = await PartnerInvite.findOne({
    where: { memberUserId, status: "accepted" },
    order: [["updatedAt", "DESC"]],
  });
  if (!invite) return null;
  const profile = await OnboardingProfile.findOne({ where: { userId: memberUserId } });
  const account = invite.partnerUserId
    ? await User.findByPk(invite.partnerUserId, { attributes: ["name"] })
    : null;
  return {
    firstName: firstNameFrom(account?.name, invite.partnerEmail),
    email: invite.partnerEmail,
    joinedAt: invite.updatedAt.toISOString(),
    sharingOn: Boolean(profile?.partnerConsent),
    scopes: profile?.partnerSharingScopes ?? [],
  };
}

/**
 * Ends the connection so the member can invite someone else.
 * The accepted invitation is revoked. Raw logs are not part of this step.
 */
export async function revokeConnectedPartner(memberUserId: string): Promise<{ ok: true }> {
  const invite = await PartnerInvite.findOne({
    where: { memberUserId, status: "accepted" },
    order: [["updatedAt", "DESC"]],
  });
  const profile = await OnboardingProfile.findOne({ where: { userId: memberUserId } });
  if (profile) {
    await profile.update({
      partnerConsent: false,
      partnerSharingScopes: [],
      partnerEmail: null,
    });
  }
  await PartnerInvite.update(
    { status: "revoked" },
    { where: { memberUserId, status: { [Op.in]: ["accepted", "sent"] } } },
  );
  if (invite?.partnerUserId) {
    await Notification.create({
      userId: invite.partnerUserId,
      category: "partner",
      title: "Partner access has been revoked",
      body: "Sharing is off. You no longer receive Partner Support from this account.",
      targetUrl: "/partner",
    });
  }
  await Notification.create({
    userId: memberUserId,
    category: "partner",
    title: "Partner access revoked",
    body: "That partner can no longer receive anything from this account. You can invite someone else.",
    targetUrl: "/app/partner",
  });
  inviteLog.info(`Member ${memberUserId} revoked partner access`);
  return { ok: true };
}

/** The partner leaves. Sharing turns off the same way it does when the member revokes access. */
export async function leavePartnerSupport(partnerUserId: string): Promise<
  | { ok: true }
  | { ok: false; status: number; message: string }
> {
  const invite = await PartnerInvite.findOne({
    where: { partnerUserId, status: "accepted" },
    order: [["updatedAt", "DESC"]],
  });
  if (!invite) {
    return { ok: false, status: 404, message: "Nothing here yet." };
  }
  const profile = await OnboardingProfile.findOne({ where: { userId: invite.memberUserId } });
  if (profile?.partnerConsent) {
    await profile.update({ partnerConsent: false, partnerSharingScopes: [] });
  }
  await invite.update({ status: "revoked" });
  await Notification.create({
    userId: invite.memberUserId,
    category: "partner",
    title: "Partner sharing turned off",
    body: "Your partner left Partner Support. They can no longer receive anything from this account.",
    targetUrl: "/app/partner",
  });
  inviteLog.info(`Partner ${partnerUserId} left support for member ${invite.memberUserId}`);
  return { ok: true };
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

    // The partner role is granted HERE, not at registration.
    //
    // It used to arrive as `role: "partner"` in the sign-up body, which meant any
    // visitor could register as a partner by editing the request. A role that
    // grants access to partner features has to be earned from a valid invitation,
    // and this is the only place where one has been presented.
    //
    // The email check above is what makes this safe: the caller must already be
    // signed in as the address the invite was sent to, and that address came from
    // the member who chose to share.
    const user = await User.findByPk(input.partnerUserId, { attributes: ["id", "role"] });
    if (!user) {
      return { ok: false, status: 401, message: "Sign in to join Partner Support." };
    }
    if (user.role !== "partner") {
      await user.update({ role: "partner" });
      inviteLog.info(`User ${user.id} joined Partner Support as a partner`, {
        inviteFor: invite.memberUserId,
      });
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
