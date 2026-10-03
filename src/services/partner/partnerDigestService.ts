import { PartnerDigest, type SavedDigestSections } from "../../models/PartnerDigest.js";
import { buildPartnerContext, composeDigest, weekStartIso } from "./partnerContext.js";
import type { ShareScope } from "./partnerAccess.js";

export async function loadWeeklyDigest(input: {
  memberUserId: string;
  partnerUserId: string;
  memberFirstName: string;
  topicsAllowed: ShareScope[];
}): Promise<{ weekStart: string; sections: SavedDigestSections; replayed: boolean }> {
  const weekStart = weekStartIso();
  const existing = await PartnerDigest.findOne({
    where: { memberUserId: input.memberUserId, partnerUserId: input.partnerUserId, weekStart },
  });
  if (existing) {
    return { weekStart, sections: existing.sections, replayed: true };
  }
  const context = buildPartnerContext({
    memberFirstName: input.memberFirstName,
    authorizedScope: input.topicsAllowed,
    evidenceIds: [],
  });
  const sections = composeDigest(context);
  const saved = await PartnerDigest.create({
    memberUserId: input.memberUserId,
    partnerUserId: input.partnerUserId,
    weekStart,
    scopes: [...input.topicsAllowed],
    sections,
  });
  return { weekStart, sections: saved.sections, replayed: false };
}
