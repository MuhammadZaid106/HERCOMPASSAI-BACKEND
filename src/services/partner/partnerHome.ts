import { OnboardingProfile, PartnerInvite, User } from "../../models/index.js";
import { resolveMemberPlan } from "../member/planCatalog.js";

const SHARE_SCOPES = ["general_support", "shared_activities", "communication_guidance"] as const;

export interface PartnerHomeOff {
  connected: false;
  access?: "off";
}

export interface PartnerHomeOn {
  connected: true;
  access: "on";
  memberFirstName: string;
  memberEmail: string;
  joinedAt: string;
  scopes: string[];
  generalSupport: boolean;
  sharedActivities: boolean;
  communicationGuidance: boolean;
  digestIncluded: boolean;
  academyIncluded: boolean;
  supportIncluded: boolean;
}

export type PartnerHomeView = PartnerHomeOff | PartnerHomeOn;

export interface PartnerHomeInput {
  inviteStatus: "sent" | "accepted" | "declined" | "revoked" | null;
  sharingOn: boolean;
  scopes: string[];
  memberName: string;
  memberEmail?: string;
  joinedAt?: string | null;
  memberPlan: string | null;
}

/** A member token must not read this view. */
export function partnerHomeAllowed(role: string | undefined): boolean {
  return role === "partner";
}

function firstName(name: string): string {
  const word = name.trim().split(/\s+/)[0];
  return word && word.length > 0 ? word : "your partner";
}

/**
 * What a signed-in partner may see.
 *
 * The invite link expiry applies only before acceptance. An accepted
 * relationship stays until the member turns sharing off. The partner sees the
 * member's name, account email, and join date. The payload never includes a
 * score, a symptom, or a note.
 */
export function presentPartnerHome(input: PartnerHomeInput): PartnerHomeView {
  if (input.inviteStatus === "declined" || input.inviteStatus === "revoked") {
    return { connected: false, access: "off" };
  }

  if (input.inviteStatus !== "accepted") {
    return { connected: false };
  }

  if (!input.sharingOn) {
    return { connected: false, access: "off" };
  }

  const scopes = SHARE_SCOPES.filter((scope) => input.scopes.includes(scope));
  const plan = resolveMemberPlan(input.memberPlan);

  return {
    connected: true,
    access: "on",
    memberFirstName: firstName(input.memberName),
    memberEmail: input.memberEmail?.trim() ?? "",
    joinedAt: input.joinedAt ?? "",
    scopes: [...scopes],
    generalSupport: scopes.includes("general_support"),
    sharedActivities: scopes.includes("shared_activities"),
    communicationGuidance: scopes.includes("communication_guidance"),
    digestIncluded: plan === "plus" || plan === "premium",
    academyIncluded: plan === "plus" || plan === "premium",
    supportIncluded: plan === "plus" || plan === "premium",
  };
}

export async function loadPartnerHome(partnerUserId: string): Promise<PartnerHomeView> {
  const invite = await PartnerInvite.findOne({
    where: { partnerUserId },
    order: [["updatedAt", "DESC"]],
  });

  if (!invite) {
    return presentPartnerHome({
      inviteStatus: null,
      sharingOn: false,
      scopes: [],
      memberName: "",
      memberEmail: "",
      joinedAt: null,
      memberPlan: null,
    });
  }

  const [member, profile] = await Promise.all([
    User.findByPk(invite.memberUserId),
    OnboardingProfile.findOne({ where: { userId: invite.memberUserId } }),
  ]);

  return presentPartnerHome({
    inviteStatus: invite.status,
    sharingOn: Boolean(profile?.partnerConsent),
    scopes: profile?.partnerSharingScopes ?? [],
    memberName: member?.name ?? "",
    memberEmail: member?.email ?? "",
    joinedAt: invite.updatedAt ? invite.updatedAt.toISOString() : null,
    memberPlan: member?.plan ?? null,
  });
}
