import { isCitableRecord } from "./evidenceService.js";
import { buildApprovedPatternBlock, finiteScore } from "./approvedPhrases.js";
import { recommendationsFromEvidence } from "./fallbackService.js";
import { NUMERIC_TOKEN_PATTERN } from "../../ai/guardrails/languagePatterns.js";
import { collectPermittedNumbers } from "../../ai/guardrails/guardrailService.js";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import type {
  GatewayCitation,
  GatewayContext,
  GatewayPatternBlock,
  GatewayRecommendation,
  RetrievedEvidence,
  SciFinding,
} from "../../ai/types/index.js";
import type {
  PartnerDigestModelOutput,
  PersonalSnapshotModelOutput,
} from "../../ai/schemas/outputSchemas.js";

/**
 * Citation verification and claim repair (spec Step 23).
 *
 *   AI claim -> citation id -> Citation Registry -> evidence source -> verify
 *
 * When a claim cannot be supported the spec allows three responses: remove the
 * claim, rewrite it, or block the response. A recommendation with no retrieved
 * citation id is removed. If that empties the list and this request did retrieve
 * evidence, the list is rewritten from those cards. SCI still blocks when nothing
 * citable remains.
 *
 * Every model-authored string in the payload also passes through the numeric-grounding
 * check. A figure the engine never produced is removed wherever it appears.
 */

export interface VerificationResult {
  repaired: PersonalSnapshotModelOutput | PartnerDigestModelOutput;
  citations: GatewayCitation[];
  usedCitationIds: string[];
  findings: SciFinding[];
  /** True when every claim-bearing item was removed and the response cannot be used. */
  unsupportable: boolean;
}

function toCitation(item: RetrievedEvidence): GatewayCitation {
  const record = item.record;
  return {
    citationId: record.citationId,
    evidenceId: record.evidenceId,
    sourceName: record.sourceName,
    sourceCategory: record.sourceCategory,
    title: record.title,
    publisher: record.publisher,
    publicationDate: record.publicationDate,
    urlOrIdentifier: record.urlOrIdentifier,
    authorityLevel: record.authorityLevel,
    consensusLevel: record.consensusLevel,
    recencyScore: record.recencyScore,
    relevanceScore: item.relevanceScore,
    verified: record.status === "approved" && isCitableRecord(record),
    clinicianReview: record.clinicianReview,
  };
}

function containsUntraceableNumber(text: string, permitted: Set<string>): boolean {
  const tokens = text.match(NUMERIC_TOKEN_PATTERN) ?? [];
  return tokens.some((token) => !permitted.has(token));
}

/**
 * The four pattern sections, with the deterministic score each one describes.
 *
 * The labels and score keys match `fallbackService` exactly, so a section
 * replaced here reads identically to the same section in the whole-payload
 * fallback. A member must not be able to tell which layer discarded the model's
 * wording, because that difference would itself imply something about their data.
 */
const PATTERN_FIELDS: ReadonlyArray<{
  key: "symptomPattern" | "moodPattern" | "sleepPattern" | "energyPattern";
  label: string;
  scoreKey: string;
}> = [
    { key: "symptomPattern", label: "your symptom pattern", scoreKey: "symptomBurdenScore" },
    { key: "moodPattern", label: "your emotional wellbeing", scoreKey: "emotionalBalanceScore" },
    { key: "sleepPattern", label: "your sleep experience", scoreKey: "sleepDisturbanceScore" },
    { key: "energyPattern", label: "your energy levels", scoreKey: "vitalityIndex" },
  ];

/**
 * Every model-authored string in a pattern block, not just the summary.
 *
 * `reportedAreas` and `impact` are model-authored too, and a figure can hide in
 * either. They are short enough that one ungrounded figure invalidates the whole
 * block, which is why the block is replaced rather than patched.
 */
function patternBlockIsGrounded(
  block: GatewayPatternBlock,
  permitted: Set<string>
): boolean {
  return !containsUntraceableNumber(
    `${block.summary} ${block.impact ?? ""} ${block.reportedAreas.join(" ")}`,
    permitted
  );
}

/**
 * Rewrites the pattern sections the model filled with untraceable figures.
 *
 * The summary is a required section — SCI blocks a Snapshot without all four —
 * so an ungrounded figure cannot simply be deleted from it, and excising the
 * number alone leaves broken prose ("improved by % over the last month") that
 * still reads as a claim. The section is therefore replaced wholesale with the
 * approved deterministic description of the same verified score, which is the
 * spec's "rewrite it" response.
 *
 * Only the affected section is replaced. The other three keep the model's
 * wording, so one hallucinated figure costs one section rather than the Snapshot.
 */
function repairPatternBlocks(
  payload: PersonalSnapshotModelOutput,
  context: GatewayContext,
  permitted: Set<string>,
  findings: SciFinding[]
): Record<string, GatewayPatternBlock> {
  const repaired: Record<string, GatewayPatternBlock> = {};

  for (const field of PATTERN_FIELDS) {
    const original = payload[field.key];

    if (patternBlockIsGrounded(original, permitted)) {
      repaired[field.key] = original;
      continue;
    }

    findings.push({
      check: "numeric_grounding",
      severity: "warn",
      message: `Replaced the "${field.key}" section: the model stated a figure that does not appear in the approved context.`,
      path: `${field.key}.summary`,
    });

    repaired[field.key] = buildApprovedPatternBlock(
      field.label,
      finiteScore(context.deterministic.metrics[field.scoreKey]),
      context.reportedAreas
    );
  }

  return repaired;
}

export function verifyAndRepair(
  payload: PersonalSnapshotModelOutput | PartnerDigestModelOutput,
  context: GatewayContext
): VerificationResult {
  const findings: SciFinding[] = [];
  const permitted = collectPermittedNumbers(context);

  const allowed = new Map(context.evidence.map((item) => [item.record.citationId, item]));

  const canonicalCitationId = (id: string): string | null => {
    const trimmed = id.trim();
    if (trimmed.length === 0) return null;

    const direct = allowed.get(trimmed);
    if (direct && direct.record.status === "approved" && isCitableRecord(direct.record)) {
      return direct.record.citationId;
    }

    const folded = trimmed.toLowerCase();
    for (const item of allowed.values()) {
      if (
        item.record.citationId.toLowerCase() === folded &&
        item.record.status === "approved" &&
        isCitableRecord(item.record)
      ) {
        return item.record.citationId;
      }
    }

    return null;
  };

  const resolveCitations = (ids: string[]): { valid: string[]; invalid: string[] } => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const id of ids) {
      const canonical = canonicalCitationId(id);
      if (canonical && !valid.includes(canonical)) valid.push(canonical);
      else if (!canonical) invalid.push(id);
    }
    return { valid, invalid };
  };

  if ("personalizedRecommendations" in payload) {
    const kept: GatewayRecommendation[] = [];
    let removedUngrounded = 0;

    for (const recommendation of payload.personalizedRecommendations) {
      const { valid, invalid } = resolveCitations(recommendation.citationIds);

      if (invalid.length > 0) {
        findings.push({
          check: "citation_validity",
          severity: "warn",
          message: `Removed ${invalid.length} unknown or unapproved citation reference(s).`,
          path: "personalizedRecommendations.citationIds",
        });
      }

      if (valid.length === 0) {
        findings.push({
          check: "evidence_support",
          severity: "warn",
          message: "Removed a recommendation that carried no verifiable evidence citation.",
          path: "personalizedRecommendations",
        });
        continue;
      }

      // Every figure in a recommendation must trace back to approved context.
      const claimText = `${recommendation.what} ${recommendation.why} ${recommendation.start}`;
      if (containsUntraceableNumber(claimText, permitted)) {
        removedUngrounded += 1;
        findings.push({
          check: "numeric_grounding",
          severity: "warn",
          message: "Removed a recommendation containing a figure not present in the approved context.",
          path: "personalizedRecommendations",
        });
        continue;
      }

      kept.push({
        what: recommendation.what,
        why: recommendation.why,
        start: recommendation.start,
        category: recommendation.category,
        citationIds: valid,
      });
    }

    if (kept.length === 0) {
      const filled = recommendationsFromEvidence(context);
      if (filled.length > 0) {
        kept.push(...filled);
        findings.push({
          check: "evidence_support",
          severity: "warn",
          message:
            "Replaced recommendations that had no verifiable citation with lines drawn from the sources retrieved for this request.",
          path: "personalizedRecommendations",
        });
      }
    }

    let partnerSupport = payload.partnerSupportOpportunity;
    if (partnerSupport) {
      const { valid, invalid } = resolveCitations(partnerSupport.citationIds);

      if (invalid.length > 0) {
        findings.push({
          check: "citation_validity",
          severity: "warn",
          message: `Removed ${invalid.length} unknown or unapproved partner-support citation reference(s).`,
          path: "partnerSupportOpportunity.citationIds",
        });
      }

      if (valid.length === 0) {
        partnerSupport = null;
        findings.push({
          check: "evidence_support",
          severity: "warn",
          message: "Removed the partner-support section because it carried no verifiable citation.",
          path: "partnerSupportOpportunity",
        });
      } else if (
        containsUntraceableNumber(
          `${partnerSupport.suggestedApproach} ${partnerSupport.shareIdea}`,
          permitted
        )
      ) {
        partnerSupport = null;
        findings.push({
          check: "numeric_grounding",
          severity: "warn",
          message: "Removed the partner-support section because it contained an ungrounded figure.",
          path: "partnerSupportOpportunity",
        });
      } else {
        partnerSupport = {
          suggestedApproach: partnerSupport.suggestedApproach,
          shareIdea: partnerSupport.shareIdea,
          citationIds: valid,
        };
      }
    }

    const nextSteps = payload.suggestedNextSteps.slice(0, AI_GATEWAY_CONFIG.limits.maxNextSteps);
    const trimmedObservations = payload.lifestyleObservations
      .filter((observation) => !containsUntraceableNumber(observation, permitted))
      .slice(0, 8);

    if (trimmedObservations.length < payload.lifestyleObservations.length) {
      findings.push({
        check: "numeric_grounding",
        severity: "warn",
        message: "Removed lifestyle observation(s) containing ungrounded figures.",
        path: "lifestyleObservations",
      });
    }

    // Next steps are removable in the same way lifestyle observations are. They
    // are actions rather than observations, so an ungrounded figure in one ("log
    // 87% more") is a fabricated target rather than a badly-worded remark.
    const groundedNextSteps = nextSteps.filter(
      (step) => !containsUntraceableNumber(step.action, permitted)
    );

    if (groundedNextSteps.length < nextSteps.length) {
      findings.push({
        check: "numeric_grounding",
        severity: "warn",
        message: "Removed next step(s) containing ungrounded figures.",
        path: "suggestedNextSteps",
      });
    }

    const patternBlocks = repairPatternBlocks(payload, context, permitted, findings);

    const repaired: PersonalSnapshotModelOutput = {
      ...payload,
      ...patternBlocks,
      lifestyleObservations: trimmedObservations,
      personalizedRecommendations: kept.slice(0, AI_GATEWAY_CONFIG.limits.maxRecommendations),
      suggestedNextSteps: groundedNextSteps,
      partnerSupportOpportunity: partnerSupport,
    };

    return {
      repaired,
      citations: buildCitations(context, collectUsedCitationIds(repaired)),
      usedCitationIds: collectUsedCitationIds(repaired),
      findings,
      // The recommendation list is the only claim-bearing section the spec
      // requires to be evidence-backed, so "nothing survived" means that list is
      // empty. The pattern sections are always repairable from the deterministic
      // context and therefore never make a response unsupportable on their own.
      unsupportable: repaired.personalizedRecommendations.length === 0,
    };
  }

  // ─── Partner digest ─────────────────────────────────────────────────────────
  const { valid, invalid } = resolveCitations(payload.citationIds);

  if (invalid.length > 0) {
    findings.push({
      check: "citation_validity",
      severity: "warn",
      message: `Removed ${invalid.length} unknown or unapproved citation reference(s) from the digest.`,
      path: "citationIds",
    });
  }

  const narrative = [
    payload.whatSheMayBeExperiencing,
    payload.oneSimpleSupportAction,
    ...(typeof payload.advancedObservation === "string" ? [payload.advancedObservation] : []),
    ...payload.whatMayHelp,
    ...payload.howToCommunicate,
    ...payload.whatToAvoid,
  ].join(" ");

  const repaired: PartnerDigestModelOutput = {
    ...payload,
    citationIds: valid,
  };

  return {
    repaired,
    citations: buildCitations(context, valid),
    usedCitationIds: valid,
    findings,
    unsupportable: valid.length === 0 || containsUntraceableNumber(narrative, permitted),
  };
}

function collectUsedCitationIds(
  payload: PersonalSnapshotModelOutput | PartnerDigestModelOutput
): string[] {
  const ids = new Set<string>();

  if ("personalizedRecommendations" in payload) {
    for (const recommendation of payload.personalizedRecommendations) {
      for (const id of recommendation.citationIds) ids.add(id);
    }
    for (const id of payload.partnerSupportOpportunity?.citationIds ?? []) ids.add(id);
  } else {
    for (const id of payload.citationIds) ids.add(id);
  }

  return Array.from(ids);
}

function buildCitations(context: GatewayContext, citationIds: string[]): GatewayCitation[] {
  return citationIds
    .map((id) => context.evidence.find((item) => item.record.citationId === id))
    .filter((item): item is RetrievedEvidence => item !== undefined)
    .map(toCitation);
}

/**
 * Every approved citation available for this request.
 *
 * Used by the deterministic fallback, which is produced when no model output
 * survives validation and therefore has no claim list to draw citations from.
 */
export function buildContextCitations(context: GatewayContext): GatewayCitation[] {
  return context.evidence
    .filter((item) => item.record.status === "approved" && isCitableRecord(item.record))
    .map(toCitation);
}
