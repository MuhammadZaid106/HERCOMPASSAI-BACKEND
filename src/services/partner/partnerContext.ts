import { getEvidenceById } from "../../ai/evidence/approvedEvidence.js";
import { ACTIVITY_SUGGESTIONS, type ActivitySuggestion } from "./activityCatalog.js";
import type { SavedDigestSections } from "../../models/PartnerDigest.js";
import type { ShareScope } from "./partnerAccess.js";

/**
 * The only member fields a partner guide may carry.
 * Logs, scores, symptoms, and notes are not part of this shape.
 */
export interface PartnerContext {
  memberFirstName: string;
  authorizedScope: ShareScope[];
  evidenceIds: string[];
}

const HIDDEN_KEYS = ["symptoms", "logs", "scores", "notes", "moodEntries", "sleepEntries"] as const;

export function contextHasHiddenFields(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  return HIDDEN_KEYS.some((key) => key in (value as Record<string, unknown>));
}

export function buildPartnerContext(input: {
  memberFirstName: string;
  authorizedScope: ShareScope[];
  evidenceIds: string[];
}): PartnerContext {
  return {
    memberFirstName: input.memberFirstName,
    authorizedScope: [...input.authorizedScope],
    evidenceIds: [...input.evidenceIds],
  };
}

function sourceLine(evidenceId: string): string | null {
  const record = getEvidenceById(evidenceId);
  if (!record) return null;
  return record.sourceName;
}

export function supportGuide(context: PartnerContext): { lines: string[]; evidenceIds: string[] } | null {
  if (!context.authorizedScope.includes("general_support")) return null;
  return {
    lines: [
      "Ask what would be welcome today, then follow that answer.",
      "Take one practical task if she wants that help.",
      "Keep the plan small enough to change.",
    ],
    evidenceIds: ["ev-nams-001", "ev-act-012"],
  };
}

export function conversationGuide(context: PartnerContext): { lines: string[]; evidenceIds: string[] } | null {
  if (!context.authorizedScope.includes("communication_guidance")) return null;
  return {
    lines: [
      "How can I support you this week?",
      "What would be useful today, and what can wait?",
      "I can listen without trying to fix it. Would that help?",
    ],
    evidenceIds: ["ev-act-012", "ev-cbt-010"],
  };
}

export function activityGuide(context: PartnerContext): ActivitySuggestion[] | null {
  if (!context.authorizedScope.includes("shared_activities")) return null;
  return ACTIVITY_SUGGESTIONS;
}

/** Weekly guide parts. A topic that is off contributes no lines. */
export function composeDigest(context: PartnerContext): SavedDigestSections {
  const support = context.authorizedScope.includes("general_support");
  const talk = context.authorizedScope.includes("communication_guidance");
  const together = context.authorizedScope.includes("shared_activities");
  const evidenceIds = [
    ...(support ? ["ev-nams-001"] : []),
    ...(talk ? ["ev-act-012"] : []),
    ...(together ? ["ev-mbsr-011"] : []),
  ];
  return {
    whatSheMayBeExperiencing: support
      ? "Midlife can bring changes in sleep, energy, or mood. This note does not describe her private logs."
      : null,
    whatMayHelp: support
      ? ["Ask what would help today.", "Offer one practical task, then stop there."]
      : [],
    howToCommunicate: talk ? ["How can I support you this week?"] : [],
    whatToAvoid: talk
      ? ["Do not guess a cause.", "Do not treat this guide as a medical report."]
      : [],
    oneSimpleSupportAction: support || talk ? "Ask how you can support her this week, then follow her answer." : null,
    evidenceIds,
  };
}

export function evidenceSources(ids: string[]): string[] {
  return ids.map(sourceLine).filter((name): name is string => Boolean(name));
}

/** Monday of the UTC week, as YYYY-MM-DD. Software owns the week boundary. */
export function weekStartIso(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}
