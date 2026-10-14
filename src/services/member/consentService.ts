import { Consent, type ConsentType, type ConsentAction } from "../../models/Consent.js";
import { OnboardingProfile } from "../../models/OnboardingProfile.js";
import { logger } from "../../utils/logger.js";

const consentLog = logger.module("CONSENT_SERVICE");

export interface RecordConsentInput {
  userId: string;
  consentType: ConsentType;
  action: ConsentAction;
  consentVersion?: string;
  scopes?: string[];
  ipAddress?: string | null;
  userAgent?: string | null;
  revocationReason?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function recordConsent(input: RecordConsentInput): Promise<Consent> {
  const version = input.consentVersion?.trim() || "1.0";
  const scopes = input.scopes || [];
  const now = new Date();

  const consent = await Consent.create({
    userId: input.userId,
    consentType: input.consentType,
    action: input.action,
    consentVersion: version,
    scopes,
    ipAddress: input.ipAddress ?? null,
    userAgent: input.userAgent ? input.userAgent.slice(0, 255) : null,
    revokedAt: input.action === "revoked" ? now : null,
    revocationReason: input.revocationReason ?? null,
    metadata: input.metadata ?? null,
  });

  consentLog.info(`Consent recorded [${input.action}] for user ${input.userId}: ${input.consentType} (v${version})`);

  // Sync OnboardingProfile for backward compatibility with existing product gates
  try {
    const profile = await OnboardingProfile.findOne({ where: { userId: input.userId } });
    if (profile) {
      if (input.consentType === "wellness_personalization") {
        if (input.action === "granted") {
          await profile.update({
            consentType: "wellness_personalization",
            consentVersion: version,
            consentTimestamp: now,
          });
        } else {
          await profile.update({
            consentType: "assessment_only",
            consentVersion: version,
            consentTimestamp: now,
          });
        }
      } else if (input.consentType === "partner_sharing") {
        await profile.update({
          partnerConsent: input.action === "granted",
          partnerSharingScopes: input.action === "granted" ? scopes : [],
        });
      }
    }
  } catch (err) {
    consentLog.warn("Failed to sync profile compatibility on consent write", err);
  }

  return consent;
}

export async function getLatestConsent(
  userId: string,
  consentType: ConsentType,
): Promise<Consent | null> {
  return Consent.findOne({
    where: { userId, consentType },
    order: [["createdAt", "DESC"]],
  });
}

export async function listConsentHistory(userId: string): Promise<Consent[]> {
  return Consent.findAll({
    where: { userId },
    order: [["createdAt", "DESC"]],
  });
}
