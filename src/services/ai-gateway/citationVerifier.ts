import { isCitableRecord } from "./evidenceService.js";
import { NUMERIC_TOKEN_PATTERN } from "../../ai/guardrails/languagePatterns.js";
import { collectPermittedNumbers } from "../../ai/guardrails/guardrailService.js";
import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import type {
  GatewayCitation,
  GatewayContext,
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
 * claim, rewrite it, or block the response. We implement removal here (deterministic
 * and auditable); blocking happens in SCI if nothing survives.
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

export function verifyAndRepair(
  payload: PersonalSnapshotModelOutput | PartnerDigestModelOutput,
  context: GatewayContext
): VerificationResult {
  const findings: SciFinding[] = [];
  const permitted = collectPermittedNumbers(context);

  const allowed = new Map(context.evidence.map((item) => [item.record.citationId, item]));

  const resolveCitations = (ids: string[]): { valid: string[]; invalid: string[] } => {
    const valid: string[] = [];
    const invalid: string[] = [];
    for (const id of ids) {
      const match = allowed.get(id);
      if (match && match.record.status === "approved" && isCitableRecord(match.record)) valid.push(id);
      else invalid.push(id);
    }
    return { valid, invalid };
  };

  if ("personalizedRecommendations" in payload) {
    const kept: GatewayRecommendation[] = [];
    let removedUnsupported = 0;
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
        removedUnsupported += 1;
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

    const repaired: PersonalSnapshotModelOutput = {
      ...payload,
      lifestyleObservations: trimmedObservations,
      personalizedRecommendations: kept.slice(0, AI_GATEWAY_CONFIG.limits.maxRecommendations),
      suggestedNextSteps: nextSteps,
      partnerSupportOpportunity: partnerSupport,
    };

    return {
      repaired,
      citations: buildCitations(context, collectUsedCitationIds(repaired)),
      usedCitationIds: collectUsedCitationIds(repaired),
      findings,
      unsupportable:
        repaired.personalizedRecommendations.length === 0 ||
        (removedUnsupported > 0 && repaired.personalizedRecommendations.length === 0),
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
