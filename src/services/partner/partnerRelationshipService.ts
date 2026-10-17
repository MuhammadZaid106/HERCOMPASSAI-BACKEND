import { Op } from "sequelize";
import {
  PartnerRelationship,
  PartnerConsent,
  PartnerPermission,
} from "../../models/index.js";
import { logger } from "../../utils/logger.js";

const log = logger.module("PARTNER-RELATIONSHIP");

export interface PartnerAuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export async function recordPartnerInvite(
  input: {
    memberUserId: string;
    partnerEmail: string;
    scopes: string[];
  },
  audit?: PartnerAuditContext,
): Promise<PartnerRelationship> {
  const email = input.partnerEmail.trim().toLowerCase();

  // Find or create the relationship
  let [rel] = await PartnerRelationship.findOrCreate({
    where: {
      memberUserId: input.memberUserId,
      partnerEmail: email,
    },
    defaults: {
      memberUserId: input.memberUserId,
      partnerEmail: email,
      status: "pending",
    },
  });

  // If it was revoked or declined earlier, reset to pending
  if (rel.status !== "active") {
    await rel.update({
      status: "pending",
      revokedAt: null,
      revokedBy: null,
    });
  }

  // Update permissions
  await PartnerPermission.update(
    { enabled: false, revokedAt: new Date() },
    { where: { relationshipId: rel.id, enabled: true } },
  );

  for (const scope of input.scopes) {
    await PartnerPermission.create({
      relationshipId: rel.id,
      scope,
      enabled: true,
      grantedAt: new Date(),
    });
  }

  // Record audit consent
  await PartnerConsent.create({
    relationshipId: rel.id,
    memberUserId: input.memberUserId,
    consentType: "partner_sharing",
    action: "granted",
    consentVersion: "1.0",
    ipAddress: audit?.ipAddress ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  log.info(`Recorded partner invite relationship for member ${input.memberUserId} -> ${email}`);
  return rel;
}

export async function recordPartnerAcceptance(
  input: {
    memberUserId: string;
    partnerUserId: string;
    partnerEmail: string;
  },
  audit?: PartnerAuditContext,
): Promise<PartnerRelationship | null> {
  const email = input.partnerEmail.trim().toLowerCase();
  const rel = await PartnerRelationship.findOne({
    where: {
      memberUserId: input.memberUserId,
      partnerEmail: email,
      status: { [Op.in]: ["pending", "active"] },
    },
  });

  if (!rel) return null;

  await rel.update({
    partnerUserId: input.partnerUserId,
    status: "active",
    acceptedAt: new Date(),
    revokedAt: null,
    revokedBy: null,
  });

  await PartnerConsent.create({
    relationshipId: rel.id,
    memberUserId: input.memberUserId,
    consentType: "partner_sharing_accepted",
    action: "granted",
    consentVersion: "1.0",
    ipAddress: audit?.ipAddress ?? null,
    userAgent: audit?.userAgent ?? null,
  });

  log.info(`Partner ${input.partnerUserId} activated relationship with member ${input.memberUserId}`);
  return rel;
}

export async function recordPartnerRevocation(
  input: {
    memberUserId?: string;
    partnerUserId?: string;
    revoker: "member" | "partner";
    reason?: string;
  },
  audit?: PartnerAuditContext,
): Promise<{ revokedCount: number }> {
  const whereClause: Record<string, unknown> = {
    status: { [Op.in]: ["active", "pending"] },
  };

  if (input.memberUserId) {
    whereClause.memberUserId = input.memberUserId;
  } else if (input.partnerUserId) {
    whereClause.partnerUserId = input.partnerUserId;
  } else {
    return { revokedCount: 0 };
  }

  const relationships = await PartnerRelationship.findAll({ where: whereClause });
  const now = new Date();

  for (const rel of relationships) {
    await rel.update({
      status: "revoked",
      revokedAt: now,
      revokedBy: input.revoker,
    });

    await PartnerPermission.update(
      { enabled: false, revokedAt: now },
      { where: { relationshipId: rel.id, enabled: true } },
    );

    await PartnerConsent.create({
      relationshipId: rel.id,
      memberUserId: rel.memberUserId,
      consentType: "partner_sharing",
      action: "revoked",
      consentVersion: "1.0",
      revokedAt: now,
      revocationReason: input.reason ?? `${input.revoker} revoked sharing`,
      ipAddress: audit?.ipAddress ?? null,
      userAgent: audit?.userAgent ?? null,
    });
  }

  log.info(`Revoked ${relationships.length} partner relationship(s) by ${input.revoker}`);
  return { revokedCount: relationships.length };
}

export async function getActiveRelationshipForPartner(
  partnerUserId: string,
): Promise<{
  relationship: PartnerRelationship;
  scopes: string[];
} | null> {
  const rel = await PartnerRelationship.findOne({
    where: { partnerUserId, status: "active" },
    include: [{ model: PartnerPermission, as: "permissions", where: { enabled: true }, required: false }],
    order: [["updatedAt", "DESC"]],
  });

  if (!rel) return null;

  const permissions = (rel.get("permissions") as PartnerPermission[] | undefined) ?? [];
  const scopes = permissions.map((p) => p.scope);

  return { relationship: rel, scopes };
}
