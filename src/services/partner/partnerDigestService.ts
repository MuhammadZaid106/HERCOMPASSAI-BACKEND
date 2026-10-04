import { UniqueConstraintError } from "sequelize";
import type { PartnerDigestOutput } from "../../ai/types/index.js";
import { PartnerDigest, type SavedDigestSections } from "../../models/PartnerDigest.js";
import { runGateway } from "../ai-gateway/gateway.js";
import { logger } from "../../utils/logger.js";
import type { ShareScope } from "./partnerAccess.js";
import {
  PARTNER_SAFE_LINE,
  applyTopicFilter,
  buildPartnerContext,
  buildPartnerGatewayRequest,
  composeDigest,
  evidenceIdsForTopics,
  weekStartIso,
} from "./partnerContext.js";

const digestLog = logger.module("PARTNER-DIGEST");

const WEEKLY_TASK =
  "Write the weekly partner digest from the authorized topics and the approved evidence cards only.";
const LESSON_TASK =
  "Write one short paragraph about how to use this lesson inside the authorized topics. Put that paragraph in oneSimpleSupportAction. Do not mention private logs, scores, or symptoms.";

const PREMIUM_FALLBACK =
  "This week’s closer look stays with the topics she shared. It does not add private logs or a medical reading.";

export async function loadWeeklyDigest(input: {
  memberUserId: string;
  partnerUserId: string;
  memberFirstName: string;
  topicsAllowed: ShareScope[];
  advanced: boolean;
}): Promise<{ weekStart: string; sections: SavedDigestSections; replayed: boolean; safeLine: string | null }> {
  const { row, replayed } = await ensureWeek(input);
  return {
    weekStart: row.weekStart,
    sections: applyTopicFilter(row.sections, input.topicsAllowed, input.advanced),
    replayed,
    safeLine: row.sections.safeLine ?? null,
  };
}

export async function loadLessonNote(input: {
  memberUserId: string;
  partnerUserId: string;
  memberFirstName: string;
  topicsAllowed: ShareScope[];
  advanced: boolean;
  lessonSlug: string;
  evidenceId: string;
}): Promise<{ paragraph: string | null; safeLine: string | null }> {
  const { row } = await ensureWeek(input);
  const saved = row.sections.lessonNotes?.[input.lessonSlug];
  if (saved) return saved;

  const context = buildPartnerContext({
    memberFirstName: input.memberFirstName,
    authorizedScope: input.topicsAllowed,
    evidenceIds: [input.evidenceId],
  });
  const generated = await askGateway(context, input.partnerUserId, false, LESSON_TASK);
  const note = generated?.oneSimpleSupportAction.trim()
    ? { paragraph: generated.oneSimpleSupportAction.trim(), safeLine: null }
    : { paragraph: null, safeLine: PARTNER_SAFE_LINE };

  row.sections = {
    ...row.sections,
    lessonNotes: { ...(row.sections.lessonNotes ?? {}), [input.lessonSlug]: note },
  };
  row.changed("sections", true);
  await row.save();
  digestLog.info(`Saved academy note ${input.lessonSlug} for week ${row.weekStart}.`);
  return note;
}

async function ensureWeek(input: {
  memberUserId: string;
  partnerUserId: string;
  memberFirstName: string;
  topicsAllowed: ShareScope[];
  advanced: boolean;
}): Promise<{ row: PartnerDigest; replayed: boolean }> {
  const weekStart = weekStartIso();
  const where = {
    memberUserId: input.memberUserId,
    partnerUserId: input.partnerUserId,
    weekStart,
  };
  const existing = await PartnerDigest.findOne({ where });
  if (existing?.sections.writtenBy) return { row: existing, replayed: true };

  const sections = await writeDigestSections(input);
  if (existing) {
    existing.sections = { ...sections, lessonNotes: existing.sections.lessonNotes ?? {} };
    existing.scopes = [...input.topicsAllowed];
    existing.changed("sections", true);
    await existing.save();
    digestLog.info(`Updated the weekly partner digest for ${weekStart} via ${sections.writtenBy ?? "fallback"}.`);
    return { row: existing, replayed: false };
  }

  try {
    const saved = await PartnerDigest.create({
      memberUserId: input.memberUserId,
      partnerUserId: input.partnerUserId,
      weekStart,
      scopes: [...input.topicsAllowed],
      sections,
    });
    digestLog.info(`Saved the weekly partner digest for ${weekStart} via ${sections.writtenBy ?? "fallback"}.`);
    return { row: saved, replayed: false };
  } catch (error) {
    if (!(error instanceof UniqueConstraintError)) throw error;
    const winner = await PartnerDigest.findOne({ where });
    if (!winner) throw error;
    return { row: winner, replayed: true };
  }
}

async function writeDigestSections(input: {
  memberFirstName: string;
  topicsAllowed: ShareScope[];
  partnerUserId: string;
  advanced: boolean;
}): Promise<SavedDigestSections> {
  const context = buildPartnerContext({
    memberFirstName: input.memberFirstName,
    authorizedScope: input.topicsAllowed,
    evidenceIds: evidenceIdsForTopics(input.topicsAllowed),
  });
  const generated = await askGateway(context, input.partnerUserId, input.advanced, WEEKLY_TASK);
  if (!generated) {
    return {
      ...composeDigest(context),
      writtenBy: "fallback",
      safeLine: PARTNER_SAFE_LINE,
      advancedObservation: null,
    };
  }
  const observation = generated.advancedObservation?.trim() ?? "";
  return {
    whatSheMayBeExperiencing: generated.whatSheMayBeExperiencing,
    whatMayHelp: generated.whatMayHelp,
    howToCommunicate: generated.howToCommunicate,
    whatToAvoid: generated.whatToAvoid,
    oneSimpleSupportAction: generated.oneSimpleSupportAction,
    evidenceIds: generated.evidence.map((item) => item.evidenceId),
    writtenBy: "gateway",
    safeLine: null,
    advancedObservation: input.advanced ? observation || PREMIUM_FALLBACK : null,
  };
}

async function askGateway(
  context: ReturnType<typeof buildPartnerContext>,
  partnerUserId: string,
  premium: boolean,
  partnerTask: string,
): Promise<PartnerDigestOutput | null> {
  try {
    const result = await runGateway(
      buildPartnerGatewayRequest({ context, partnerUserId, partnerTask, premium }),
    );
    if (!result.ok || result.provenance.fallbackUsed) return null;
    if (!("whatSheMayBeExperiencing" in result.output)) return null;
    return result.output;
  } catch (error) {
    digestLog.error(
      `Partner gateway call failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
    return null;
  }
}
