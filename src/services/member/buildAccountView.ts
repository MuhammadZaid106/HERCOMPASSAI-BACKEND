import type { MemberPlanId } from "./planCatalog.js";
import { planSummary, resolveMemberPlan } from "./planCatalog.js";

export interface AccountProfileSource {
  isCompleted: boolean;
  consentType: string;
  consentVersion: string;
  consentTimestamp: Date | string | null;
  dailyCheckinOptIn: boolean;
  preferredRecommendations: string[];
  partnerSupportInterest: string | null;
  partnerConsent: boolean;
  partnerSharingScopes: string[];
  partnerEmail: string | null;
}

export interface MemberAccountView {
  profile: {
    name: string;
    email: string;
    emailVerified: boolean;
    memberSince: string;
    plan: MemberPlanId;
    planLabel: string;
  };
  preferences: {
    snapshotComplete: boolean;
    dailyCheckIn: boolean;
    recommendations: string[];
  };
  consent: {
    type: string;
    typeLabel: string;
    version: string;
    recordedAt: string | null;
    allowsPersonalization: boolean;
  } | null;
  partner: {
    interest: string | null;
    interestLabel: string;
    sharingOn: boolean;
    scopes: string[];
    emailOnFile: boolean;
  } | null;
  notifications: {
    unreadCount: number;
  };
}

const INTEREST_LABELS: Record<string, string> = {
  yes: "Open to partner support",
  maybe: "Maybe later",
  not_now: "Not now",
  not_interested: "Not interested",
  no_partner: "No partner",
  prefer_not_to_say: "Prefer not to say",
};

function recordedAt(value: Date | string | null): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function buildAccountView(input: {
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date | string;
  plan: string | null | undefined;
  profile: AccountProfileSource | null;
  unreadCount: number;
}): MemberAccountView {
  const plan = resolveMemberPlan(input.plan);
  const profile = input.profile;
  const allowsPersonalization = profile?.consentType === "wellness_personalization";

  return {
    profile: {
      name: input.name,
      email: input.email,
      emailVerified: input.emailVerified,
      memberSince: recordedAt(input.createdAt) ?? new Date(0).toISOString(),
      plan,
      planLabel: planSummary(plan).label,
    },
    preferences: {
      snapshotComplete: Boolean(profile?.isCompleted),
      dailyCheckIn: Boolean(profile?.dailyCheckinOptIn),
      recommendations: profile?.preferredRecommendations ?? [],
    },
    consent: profile
      ? {
          type: profile.consentType,
          typeLabel: allowsPersonalization
            ? "Wellness personalization"
            : "Assessment only",
          version: profile.consentVersion,
          recordedAt: recordedAt(profile.consentTimestamp),
          allowsPersonalization,
        }
      : null,
    partner: profile
      ? {
          interest: profile.partnerSupportInterest,
          interestLabel: profile.partnerSupportInterest
            ? (INTEREST_LABELS[profile.partnerSupportInterest] ??
              profile.partnerSupportInterest)
            : "Not chosen yet",
          sharingOn: profile.partnerConsent,
          scopes: profile.partnerSharingScopes,
          emailOnFile: Boolean(profile.partnerEmail?.trim()),
        }
      : null,
    notifications: {
      unreadCount: input.unreadCount,
    },
  };
}
