import { createHash } from "node:crypto";
import { AI_GATEWAY_CONFIG, getFeaturePolicy } from "../../config/aiGateway.js";
import { getPromptBundle } from "../../ai/prompts/index.js";
import { PersonalSnapshot, SnapshotVersion, User } from "../../models/index.js";
import {
  loadContextSource,
  partnerSupportIsRelevant,
  presentSnapshot,
  presentDeterministicMetrics,
  deterministicMetricsFor,
  runGateway,
  type ContextSource,
} from "../ai-gateway/index.js";
import type {
  ConsentScope,
  GatewayActorRole,
  PersonalSnapshotOutput,
} from "../../ai/types/index.js";
import { logger } from "../../utils/logger.js";

const snapshotLog = logger.module("SNAPSHOT");

/**
 * Personal Menopause Snapshot™ generation.
 *
 * This is the seam that makes the Snapshot an AI feature rather than a
 * hardcoded page. Before it existed, `GET /api/onboarding/snapshot` assembled
 * its eight sections as string literals in the controller: the Gateway was
 * fully built, and the one screen a member actually reads never called it. That
 * is the exact failure the architecture exists to prevent, so the read path now
 * runs the same `runGateway` invocation the test bench uses, and everything
 * downstream of approval is presentation.
 */

/**
 * Consent types that authorise personalised AI processing.
 *
 * Kept in step with the AI Gateway controller: the database default
 * `legacy_assessment` predates versioned consent and is treated as revoked.
 * Adding a type is an evidence-governance decision, not a code shortcut.
 */
const EXPLICIT_CONSENT_TYPES = new Set(["wellness_personalization"]);

/**
 * The prompt a Snapshot is generated from, resolved from the same feature
 * policy the Gateway uses. Read once so the cache key and the generation call
 * can never disagree about which prompt version is in play.
 */
const snapshotPromptKey =
  getFeaturePolicy("personal_snapshot")?.promptKey ?? "snapshot";
const snapshotPromptVersion =
  getFeaturePolicy("personal_snapshot")?.defaultPromptVersion ?? "v1";

export interface SnapshotFailure {
  ok: false;
  statusCode: number;
  /** Client-safe message. Never contains a provider error, hostname or key. */
  message: string;
  /** Lets the client tell "finish onboarding" apart from "try again later". */
  reason:
    | "unauthenticated"
    | "forbidden_role"
    | "not_completed"
    | "consent_required"
    | "ai_unavailable";
}

export type SnapshotOutcome =
  | {
      ok: true;
      /** False when the stored artifact was replayed instead of regenerated. */
      generated: boolean;
      snapshot: Record<string, unknown>;
      requestId: string;
    }
  | SnapshotFailure;

function consentFromProfile(profile: {
  consentVersion: string;
  consentType: string;
  consentTimestamp: Date;
}): ConsentScope {
  const granted = EXPLICIT_CONSENT_TYPES.has(profile.consentType);

  return {
    consentId: `${profile.consentType}:${profile.consentVersion}`,
    consentType: profile.consentType,
    consentVersion: profile.consentVersion,
    status: granted ? "granted" : "revoked",
  };
}

/**
 * The invalidation key for a stored Snapshot.
 *
 * Covers everything that could change what the Snapshot says: the deterministic
 * baseline, the consent that authorised generation, the profile version, the
 * verified Trend Engine values, and the gateway config/prompt versions that
 * shaped the response. A member who re-submits onboarding, keeps logging, or
 * receives a snapshot under a new prompt version all get a different
 * fingerprint, and a different fingerprint means regeneration rather than a
 * stale artifact served as current.
 */
function fingerprintFor(
  source: ContextSource,
  consent: ConsentScope,
  profileVersion: string
): string {
  // The prompt is part of the input, so its version *and* its content checksum
  // belong in the invalidation key. Without the checksum, editing a prompt
  // template would leave every stored Snapshot looking current and no member
  // would ever see the improved wording. This previously carried the evidence
  // version under the name `promptVersion`, so a policy change could not
  // invalidate a Snapshot and an evidence update could.
  const prompt = getPromptBundle(snapshotPromptKey, snapshotPromptVersion);

  return createHash("sha256")
    .update(
      JSON.stringify({
        profileVersion,
        completedAt: source.profile.completedAt instanceof Date
          ? source.profile.completedAt.toISOString()
          : source.profile.completedAt,
        consent,
        scores: source.profile.deterministicScores ?? {},
        concerns: source.profile.primaryHealthConcerns ?? [],
        goals: source.profile.primaryGoals ?? [],
        trends: source.trends,
        trendWindow: {
          rangeDays: AI_GATEWAY_CONFIG.trendEngine.rangeDays,
          minimumDaysForPatterns: AI_GATEWAY_CONFIG.trendEngine.minimumDaysForPatterns,
        },
        configVersion: AI_GATEWAY_CONFIG.versions.config,
        evidenceVersion: AI_GATEWAY_CONFIG.versions.evidence,
        sciVersion: AI_GATEWAY_CONFIG.versions.sci,
        promptKey: snapshotPromptKey,
        promptVersion: snapshotPromptVersion,
        promptChecksum: prompt?.checksum ?? null,
        presentation: "1.0",
      })
    )
    .digest("hex");
}

interface StoredSnapshotRow {
  requestId: string;
  contextFingerprint: string;
  payload: Record<string, unknown>;
}

/**
 * Replays a stored Snapshot when the member's state has not moved on.
 *
 * A failed lookup is not an error — the Snapshot is regenerable from the same
 * inputs, so the cache is an optimisation and must never be load-bearing.
 */
async function findReusableSnapshot(
  userId: string,
  fingerprint: string
): Promise<StoredSnapshotRow | null> {
  try {
    const stored = await PersonalSnapshot.findOne({ where: { userId, contextFingerprint: fingerprint } });
    if (!stored) return null;
    return { requestId: stored.requestId, contextFingerprint: stored.contextFingerprint, payload: stored.payload };
  } catch (error) {
    snapshotLog.warn(
      `Stored Snapshot lookup failed for user ${userId}. Regenerating.`,
      error instanceof Error ? error.message : undefined
    );
    return null;
  }
}

/**
 * Persists the artifact.
 *
 * Storage is a convenience, so a write failure is logged and swallowed: a
 * member who has just been shown an approved Snapshot must not be handed an
 * error because the row could not be written.
 */
async function storeSnapshot(
  userId: string,
  fingerprint: string,
  version: string,
  consent: ConsentScope,
  provenance: Awaited<ReturnType<typeof runGateway>>["provenance"],
  output: PersonalSnapshotOutput,
  payload: Record<string, unknown>
): Promise<void> {
  // A successful gateway result cannot be "blocked" — that status only appears
  // on a failure, which returns earlier. The guard makes that invariant
  // explicit rather than relying on a cast to satisfy the column's enum.
  if (provenance.resultStatus === "blocked") {
    snapshotLog.warn(
      `Refused to store a blocked Snapshot result for user ${userId} (request ${provenance.requestId}).`
    );
    return;
  }

  try {
    const fields = {
      userId,
      version,
      requestId: provenance.requestId,
      resultStatus: provenance.resultStatus,
      confidence: provenance.confidence,
      confidenceScore: output.confidence.confidenceScore,
      safetyStatus: provenance.safetyStatus,
      promptVersion: provenance.promptVersion,
      evidenceVersion: provenance.evidenceVersion,
      sciVersion: provenance.sciVersion,
      modelVersion: provenance.modelVersion,
      consentVersion: consent.consentVersion,
      consentType: consent.consentType,
      contextFingerprint: fingerprint,
      payload,
      generatedAt: new Date(),
    };

    const existing = await PersonalSnapshot.findOne({ where: { userId } });
    if (existing) {
      await existing.update(fields);
    } else {
      await PersonalSnapshot.create(fields);
    }
  } catch (error) {
    snapshotLog.error(
      `Failed to store the Snapshot for user ${userId}. The member still sees their result.`,
      error instanceof Error ? error.message : undefined
    );
  }
}

/**
 * Attaches the generated narrative to the member's newest Snapshot version.
 *
 * A version row is written when the assessment is submitted, which is *before*
 * any AI has run — the narrative does not exist yet at that point. So the two
 * writes cannot be one: the version records the scores, and the narrative is
 * pinned to the same version once the Gateway has approved it.
 *
 * Only the newest version with no narrative is filled. That keeps a replay from
 * overwriting the text a member already read with a newer rewrite, and it means a
 * second generation for the same version cannot silently rewrite history.
 *
 * Best-effort, like `storeSnapshot`: history completeness is not worth failing a
 * response over, and a missing narrative is visible as an honest gap rather than
 * as a wrong number.
 */
async function pinVersionNarrative(
  userId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const newest = await SnapshotVersion.findOne({
      where: { userId, payload: null },
      order: [["versionNumber", "DESC"]],
    });
    if (!newest) return;
    await newest.update({ payload });
  } catch (error) {
    snapshotLog.warn(
      `Could not pin the Snapshot narrative to a version for user ${userId}. History will show scores only.`,
      error instanceof Error ? error.message : undefined
    );
  }
}

export interface GenerateSnapshotParams {
  userId: string;
  role: GatewayActorRole;
  /** Overrides the server default. `true` forces regeneration. */
  force?: boolean;
}

/**
 * Generates — or replays — the member's Snapshot through the AI Gateway.
 *
 * Every failure path returns a client-safe message and a reason. The reason
 * matters: the frontend shows "finish onboarding" for `not_completed` and
 * "we'll try again" for `ai_unavailable`, and collapsing them into one generic
 * error is what previously made an engine outage look like a member who had
 * not filled in the questionnaire.
 */
export async function generatePersonalSnapshot(
  params: GenerateSnapshotParams
): Promise<SnapshotOutcome> {
  const source = await loadContextSource(params.userId);
  if (!source) {
    return {
      ok: false,
      statusCode: 404,
      reason: "not_completed",
      message: "Complete your 5-minute onboarding assessment to unlock your Personal Snapshot.",
    };
  }

  const consent = consentFromProfile(source.profile);
  if (consent.status !== "granted") {
    return {
      ok: false,
      statusCode: 403,
      reason: "consent_required",
      message:
        "We need your current consent before we can build a personalised Snapshot. Your answers are saved — please review your privacy settings.",
    };
  }

  const profileVersion = source.profile.version || "1.0";
  const fingerprint = fingerprintFor(source, consent, profileVersion);

  if (!params.force) {
    const reusable = await findReusableSnapshot(params.userId, fingerprint);
    if (reusable) {
      // A replay is the first Snapshot read after onboarding in many cases, so it
      // is also the first chance to fill in the version's narrative.
      await pinVersionNarrative(params.userId, reusable.payload);
      snapshotLog.info(
        `Replayed the stored Snapshot for user ${params.userId} (request ${reusable.requestId}).`
      );
      return { ok: true, generated: false, snapshot: reusable.payload, requestId: reusable.requestId };
    }
  }

  const result = await runGateway({
    feature: "personal_snapshot",
    userId: params.userId,
    role: params.role,
    consent,
    source,
    promptVersion: snapshotPromptVersion,
    locale: "en-GB",
    // Partner relevance is advertised to the model only when the member said so.
    // Invitation never implies sharing.
    partnerScope: partnerSupportIsRelevant(source.profile)
      ? (source.profile.partnerSharingScopes ?? [])
      : [],
  });

  if (!result.ok) {
    // `result.message` is already client-safe: the Gateway derives it from the
    // failure kind and never propagates a provider error, hostname or key.
    return {
      ok: false,
      statusCode: result.statusCode,
      reason: "ai_unavailable",
      message: result.message,
    };
  }

  const output = result.output as PersonalSnapshotOutput;
  const user = await User.findByPk(params.userId, { attributes: ["name", "plan"] });

  const presented = presentSnapshot({
    output,
    provenance: result.provenance,
    member: { name: user?.name || "Member", plan: user?.plan || "free" },
    completedAt: source.profile.completedAt,
    profileVersion,
    trend: source.trends
      ? {
          symptoms: source.trends.symptoms,
          mood: source.trends.mood,
          sleep: source.trends.sleep,
          energy: source.trends.energy,
        }
      : null,
    // Carried through so the member view can state that it is showing verified
    // numbers rather than AI-written text, instead of implying the model answered.
    diagnostics: result.diagnostics,
  });

  const snapshot = {
    ...presented,
    // Read through the same assembly the Gateway used, so the cards and the
    // prompt can never disagree about a number — including the Trend Engine
    // values, which are merged into that bag rather than added separately.
    deterministicMetrics: presentDeterministicMetrics(deterministicMetricsFor(source)),
  };

  await storeSnapshot(
    params.userId,
    fingerprint,
    profileVersion,
    consent,
    result.provenance,
    output,
    snapshot
  );

  await pinVersionNarrative(params.userId, snapshot);

  snapshotLog.info(
    `Generated the Snapshot for user ${params.userId} (request ${result.provenance.requestId}, status ${result.provenance.resultStatus}, fallback ${result.provenance.fallbackUsed}).`
  );

  return { ok: true, generated: true, snapshot, requestId: result.provenance.requestId };
}
