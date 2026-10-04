import { ENTITLEMENTS } from "../../config/entitlements.js";
import { OnboardingProfile, PartnerInvite, User } from "../../models/index.js";
import { resolveMemberPlan, type MemberPlanId } from "../member/planCatalog.js";

export const SHARE_SCOPES = ["general_support", "shared_activities", "communication_guidance"] as const;
export type ShareScope = (typeof SHARE_SCOPES)[number];

/**
 * Partner-facing plan note.
 * The signed-in badge is the partner's own plan. These guides follow the member.
 */
export function partnerPlanMessage(memberFirstName: string): string {
  const name = memberFirstName.trim();
  const who = name.length > 0 && name.toLowerCase() !== "your partner" ? name : "The member you support";
  return `${who} needs HerCompass Plus or Premium to open this.`;
}

export interface PartnerGateInput {
  role: string | undefined;
  inviteStatus: "sent" | "accepted" | "declined" | "revoked" | null;
  sharingOn: boolean;
  scopes: string[];
  memberName: string;
  memberPlan: string | null;
  memberUserId: string | null;
}

export interface PartnerGrant {
  ok: true;
  result: "allowed";
  memberUserId: string;
  memberFirstName: string;
  topicsAllowed: ShareScope[];
  plan: MemberPlanId;
  digestIncluded: boolean;
  academyIncluded: boolean;
  supportIncluded: boolean;
  advancedIncluded: boolean;
}

export interface PartnerRefusal {
  ok: false;
  httpStatus: 403 | 404;
  result: "refused" | "empty";
  message: string;
  memberUserId: string | null;
  topicsAllowed: ShareScope[];
}

export type PartnerGate = PartnerGrant | PartnerRefusal;

function firstName(name: string): string {
  const word = name.trim().split(/\s+/)[0];
  return word && word.length > 0 ? word : "your partner";
}

function allowedScopes(scopes: string[]): ShareScope[] {
  return SHARE_SCOPES.filter((scope) => scopes.includes(scope));
}

/**
 * Consent and scope are decided here, before any guide text is built.
 * A refusal carries no member name.
 */
export function decidePartnerGate(input: PartnerGateInput): PartnerGate {
  if (input.role !== "partner") {
    return {
      ok: false,
      httpStatus: 403,
      result: "refused",
      message: "Only partner accounts can open Partner Support",
      memberUserId: null,
      topicsAllowed: [],
    };
  }

  const topicsAllowed = allowedScopes(input.scopes);
  const open =
    input.inviteStatus === "accepted" && input.sharingOn && input.memberUserId && topicsAllowed.length > 0;

  if (!open || !input.memberUserId) {
    return {
      ok: false,
      httpStatus: 404,
      result: "empty",
      message: "Nothing here yet.",
      memberUserId: null,
      topicsAllowed: [],
    };
  }

  const plan = resolveMemberPlan(input.memberPlan);
  const features = ENTITLEMENTS[plan].features;
  return {
    ok: true,
    result: "allowed",
    memberUserId: input.memberUserId,
    memberFirstName: firstName(input.memberName),
    topicsAllowed,
    plan,
    digestIncluded: features.partner_digest,
    academyIncluded: features.academy,
    supportIncluded: features.partner_support,
    advancedIncluded: features.advanced_partner_intelligence,
  };
}

/**
 * A partner may read only the member they are connected to, and only a topic
 * that member left on. A refusal carries no name and no guide.
 */
export function assessPartnerRequest(input: {
  role: string | undefined;
  requestedMemberUserId: string | null;
  connectedMemberUserId: string | null;
  topic: string;
  topicsAllowed: ShareScope[];
  memberFirstName: string;
}): { result: "allowed" | "refused"; memberFirstName: string | null; guide: null } {
  const knownTopic = (SHARE_SCOPES as readonly string[]).includes(input.topic);
  const topicOff = knownTopic && !input.topicsAllowed.includes(input.topic as ShareScope);
  const otherMember =
    input.requestedMemberUserId !== null && input.requestedMemberUserId !== input.connectedMemberUserId;
  if (input.role !== "partner" || otherMember || topicOff || !input.connectedMemberUserId) {
    return { result: "refused", memberFirstName: null, guide: null };
  }
  return { result: "allowed", memberFirstName: input.memberFirstName, guide: null };
}

export function topicAllowed(gate: PartnerGrant, topic: ShareScope): boolean {
  return gate.topicsAllowed.includes(topic);
}

export async function loadPartnerGate(partnerUserId: string, role: string | undefined): Promise<PartnerGate> {
  const invite = await PartnerInvite.findOne({
    where: { partnerUserId, status: "accepted" },
    order: [["updatedAt", "DESC"]],
  });
  if (!invite) {
    return decidePartnerGate({
      role,
      inviteStatus: null,
      sharingOn: false,
      scopes: [],
      memberName: "",
      memberPlan: null,
      memberUserId: null,
    });
  }
  const [member, profile] = await Promise.all([
    User.findByPk(invite.memberUserId),
    OnboardingProfile.findOne({ where: { userId: invite.memberUserId } }),
  ]);
  return decidePartnerGate({
    role,
    inviteStatus: invite.status,
    sharingOn: Boolean(profile?.partnerConsent),
    scopes: profile?.partnerSharingScopes ?? [],
    memberName: member?.name ?? "",
    memberPlan: member?.plan ?? null,
    memberUserId: invite.memberUserId,
  });
}
