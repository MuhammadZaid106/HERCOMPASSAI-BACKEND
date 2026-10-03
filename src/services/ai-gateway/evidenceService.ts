import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { APPROVED_EVIDENCE, EVIDENCE_CATALOG_VERSION } from "../../ai/evidence/approvedEvidence.js";
import type { EvidenceRecord, RetrievedEvidence } from "../../ai/types/index.js";

/**
 * Evidence retrieval (RAG foundation, M1 scope).
 *
 * Directive: "Do not allow the model to independently select arbitrary internet
 * sources." Retrieval therefore only ever returns records from the approved
 * Clinical Knowledge Folder.
 *
 * Scoring is fully deterministic — lexical overlap weighted by evidence quality
 * metadata. This is the seam where pgvector semantic retrieval drops in later:
 * replace `scoreRecord` and keep the rest of the Gateway unchanged. Ranking logic
 * is configuration, not application code.
 */

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "are",
  "was",
  "you",
  "your",
  "our",
  "her",
  "she",
  "his",
  "him",
  "not",
  "but",
  "has",
  "have",
  "had",
  "been",
  "will",
  "would",
  "could",
  "should",
  "can",
  "may",
  "might",
  "into",
  "more",
  "than",
  "then",
  "them",
  "they",
  "some",
  "such",
  "also",
  "about",
  "over",
  "when",
  "what",
  "which",
  "while",
  "help",
  "want",
  "need",
  "feel",
  "feeling",
  "experiencing",
  "experience",
  "recently",
  "current",
  "currently",
]);

/**
 * Conservative plural folding.
 *
 * Deliberately minimal: it only removes a trailing "s"/"es" so that a query for
 * "hot flashes" can reach the "hot flash" keyword. It is not a stemmer, and it is
 * applied to both the query and the catalog so the two can never disagree. A
 * missed fold costs one keyword match; an aggressive stemmer risks matching
 * unrelated clinical terms, which is far more expensive here.
 */
function foldPlural(token: string): string {
  if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
    .map(foldPlural);
}

export interface EvidenceQuery {
  /** Deterministic focus area, e.g. "Restorative Sleep & Evening Wind-Down". */
  focusArea?: string | null;
  goals?: string[];
  reportedAreas?: string[];
  /** Optional topic hint derived from the feature being served. */
  topicHints?: string[];
}

interface ScoreResult {
  relevance: number;
  matched: string[];
}

/** A record with no source name or publication year cannot be cited. */
export function isCitableRecord(record: EvidenceRecord): boolean {
  const year = Number.parseInt(record.publicationDate.slice(0, 4), 10);
  const pendingLabel = record.reviewedBy === "pending-named-clinician";
  const reviewOk =
    record.clinicianReview === "pending"
      ? pendingLabel
      : record.clinicianReview === "signed" && !pendingLabel && record.reviewedBy.trim().length > 0;
  return (
    record.sourceName.trim().length > 0 &&
    record.title.trim().length > 0 &&
    Number.isInteger(year) &&
    year >= 1990 &&
    year <= 2100 &&
    reviewOk
  );
}

function qualityFactor(record: EvidenceRecord): number {
  // Authority dominates, then consensus, then recency. Weights are declared in
  // config so Evidence Governance can tune them without a code change.
  const authority = record.authorityLevel / 5;
  const consensus = record.consensusLevel / 5;
  const recency = Math.min(Math.max(record.recencyScore, 0), 1);
  return authority * 0.5 + consensus * 0.3 + recency * 0.2;
}

function scoreRecord(record: EvidenceRecord, queryTokens: Set<string>, topicTokens: Set<string>): ScoreResult {
  if (queryTokens.size === 0) return { relevance: 0, matched: [] };

  // Catalog keywords are phrases, not single words ("hot flash", "night sweats",
  // "bone health"). A phrase matches when every one of its tokens is present, so
  // a multi-word keyword is reachable instead of permanently dead weight.
  const keywordTokens = record.keywords.map((keyword) => tokenize(keyword));
  const matched: string[] = [];
  let matchedWeight = 0;

  for (let index = 0; index < record.keywords.length; index += 1) {
    const tokens = keywordTokens[index];
    if (tokens.length === 0) continue;
    if (tokens.every((token) => queryTokens.has(token))) {
      matched.push(record.keywords[index]);
      // A phrase match is a stronger signal than an incidental single word.
      matchedWeight += tokens.length > 1 ? 1.35 : 1;
    }
  }

  if (matched.length === 0) return { relevance: 0, matched: [] };

  const recordTopics = record.topicAreas.map((topic) => topic.toLowerCase());
  const topicOverlap = recordTopics.filter((topic) => topicTokens.has(topic)).length;
  const topicBoost = recordTopics.length === 0 ? 1 : 1 + Math.min(topicOverlap / recordTopics.length, 1) * 0.15;

  // Relevance blends two independent signals:
  //   absolute  - how much real evidence the query hit (one solid hit is a lot)
  //   coverage  - how much of this record the query accounted for
  // Normalising `absolute` by the *query* length, as an earlier version did,
  // made a natural-language query with a dozen incidental tokens score near zero
  // even on a direct clinical match, which starved retrieval for the most
  // common focus areas.
  const absolute = Math.min(1, matched.length / 2);
  const coverage = Math.min(1, matchedWeight / Math.max(1, record.keywords.length));
  const lexical = 0.65 * absolute + 0.35 * coverage;

  const relevance = Math.min(lexical * qualityFactor(record) * topicBoost, 1);
  return { relevance, matched };
}

export interface EvidenceRetrievalResult {
  items: RetrievedEvidence[];
  evidenceVersion: string;
  /** Present when nothing cleared the relevance threshold. */
  insufficientEvidence: boolean;
}

export function retrieveEvidence(query: EvidenceQuery): EvidenceRetrievalResult {
  const queryParts: string[] = [];
  if (query.focusArea) queryParts.push(query.focusArea);
  for (const goal of query.goals ?? []) queryParts.push(goal);
  for (const area of query.reportedAreas ?? []) queryParts.push(area);

  const queryTokens = new Set(
    queryParts.flatMap((part) => tokenize(part))
  );

  // Topic hints only bias ranking; they never make a record retrievable on their
  // own, so a weak lexical match still fails the relevance threshold.
  const topicTokens = new Set(tokenize((query.topicHints ?? []).join(" ")));

  const scored: RetrievedEvidence[] = [];

  for (const record of APPROVED_EVIDENCE) {
    if (!AI_GATEWAY_CONFIG.evidence.allowedStatuses.includes(record.status)) continue;
    if (!isCitableRecord(record)) continue;

    const { relevance, matched } = scoreRecord(record, queryTokens, topicTokens);
    if (relevance < AI_GATEWAY_CONFIG.evidence.minRelevance) continue;

    scored.push({
      record,
      relevanceScore: Number(relevance.toFixed(4)),
      matchedKeywords: matched,
    });
  }

  scored.sort((a, b) => {
    if (b.relevanceScore !== a.relevanceScore) return b.relevanceScore - a.relevanceScore;
    if (b.record.authorityLevel !== a.record.authorityLevel) {
      return b.record.authorityLevel - a.record.authorityLevel;
    }
    return b.record.consensusLevel - a.record.consensusLevel;
  });

  const items = scored.slice(0, AI_GATEWAY_CONFIG.limits.maxEvidenceItems);

  return {
    items,
    evidenceVersion: `${EVIDENCE_CATALOG_VERSION}+${AI_GATEWAY_CONFIG.versions.evidence}`,
    insufficientEvidence: items.length === 0,
  };
}

export function listApprovedEvidence(): EvidenceRecord[] {
  return APPROVED_EVIDENCE.filter(
    (record) =>
      AI_GATEWAY_CONFIG.evidence.allowedStatuses.includes(record.status) &&
      isCitableRecord(record)
  );
}

/**
 * Clinician sign-off state of the catalog.
 *
 * `status: "approved"` and `clinicianReview: "signed"` are different facts, and
 * the seeded catalog is deliberately the first without the second: every record
 * carries `reviewedBy: "pending-named-clinician"` and `clinicianReview:
 * "pending"`. Those records are citable, because refusing to cite anything would
 * leave the product unable to produce a grounded Snapshot at all, but they are
 * *not* clinician-approved and nothing may describe them that way.
 *
 * This exists so that gap is reported rather than assumed. It is surfaced on the
 * admin health endpoint, so "the catalog is not yet clinician-reviewed" is a
 * fact an operator can see instead of a claim they have to remember not to
 * make. It cannot be closed by code: a named reviewer has to replace both
 * placeholder fields in `approvedEvidence.ts`.
 */
export interface ClinicianReviewSummary {
  catalogVersion: string;
  total: number;
  citable: number;
  clinicianSigned: number;
  pendingClinicianReview: number;
  /** False while any citable record is unsigned. */
  fullyClinicianReviewed: boolean;
  pendingCitationIds: string[];
}

export function clinicianReviewSummary(): ClinicianReviewSummary {
  const citable = listApprovedEvidence();
  const pending = citable.filter((record) => record.clinicianReview !== "signed");

  return {
    catalogVersion: EVIDENCE_CATALOG_VERSION,
    total: APPROVED_EVIDENCE.length,
    citable: citable.length,
    clinicianSigned: citable.length - pending.length,
    pendingClinicianReview: pending.length,
    fullyClinicianReviewed: pending.length === 0,
    pendingCitationIds: pending.map((record) => record.citationId),
  };
}
