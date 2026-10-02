import type { GatewayPatternBlock } from "../../ai/types/index.js";

/**
 * Approved deterministic phrases.
 *
 * Every string in this module is a reviewed constant or a direct restatement of
 * a value the deterministic engine already calculated. None of it is
 * model-authored, which is what makes it safe to substitute into a response
 * when the model's own wording has to be discarded.
 *
 * It exists as a shared module because two layers legitimately need to produce
 * this text: the fallback builder, which uses it when no model output survives,
 * and the citation verifier, which uses it when a single model-authored section
 * carries a figure that cannot be traced to approved context. Duplicating the
 * wording would let the two drift, and a member would then see two different
 * descriptions of the same verified score depending on which layer replaced the
 * model's text.
 */

/** Narrowing helper: only a finite number may be rendered as a score. */
export function finiteScore(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Descriptive band for a 0-100 deterministic score.
 *
 * "is one of the areas your responses most highlighted" rather than "you are at
 * high risk" — the score is a description of what a member reported, never a
 * clinical judgement.
 */
export function scoreBand(score: number | null): string {
  if (score === null) return "has not been calculated yet";
  if (score >= 70) return "is one of the areas your responses most highlighted";
  if (score >= 40) return "is an area you may want to explore";
  return "is currently among the steadier areas in your responses";
}

/**
 * A pattern section written entirely from the deterministic context.
 *
 * Used wherever model-authored summary text cannot be shipped — either because
 * no model output survived, or because that specific summary stated a figure the
 * engine never produced.
 */
export function buildApprovedPatternBlock(
  label: string,
  score: number | null,
  reportedAreas: string[]
): GatewayPatternBlock {
  const areas =
    reportedAreas.length > 0
      ? ` You reported: ${reportedAreas.slice(0, 5).join(", ")}.`
      : "";

  return {
    summary: `Based on what you shared, ${label} ${scoreBand(score)}.${areas} This is an observation, not a diagnosis.`,
    reportedAreas: reportedAreas.slice(0, 8),
    impact: null,
  };
}