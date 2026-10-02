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
  generalSupport: boolean;
  sharedActivities: boolean;
  communicationGuidance: boolean;
  digestIncluded: boolean;
}

export type PartnerHomeView = PartnerHomeOff | PartnerHomeOn;

export interface PartnerHomeInput {
  inviteStatus: "sent" | "accepted" | "declined" | "revoked" | null;
  sharingOn: boolean;
  scopes: string[];
  memberName: string;
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
 * relationship stays until the member turns sharing off. The payload never
 * includes an email, a score, a symptom, or a note.
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

  const scopes = new Set(input.scopes.filter((scope) => SHARE_SCOPES.includes(scope as (typeof SHARE_SCOPES)[number])));
  const plan = resolveMemberPlan(input.memberPlan);

  return {
    connected: true,
    access: "on",
    memberFirstName: firstName(input.memberName),
    generalSupport: scopes.has("general_support"),
    sharedActivities: scopes.has("shared_activities"),
    communicationGuidance: scopes.has("communication_guidance"),
    digestIncluded: plan === "plus" || plan === "premium",
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
    memberPlan: member?.plan ?? null,
  });
}
