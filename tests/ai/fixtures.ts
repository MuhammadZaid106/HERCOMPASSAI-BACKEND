import type { ModelProvider, ModelProviderName } from "../../src/ai/types/index.js";
import type { ContextSource } from "../../src/services/ai-gateway/contextAssembler.js";
import type { OnboardingProfile } from "../../src/models/OnboardingProfile.js";
import { personalSnapshotModelOutputSchema } from "../../src/ai/schemas/outputSchemas.js";
import type {
  AITaskType,
  ModelCapabilities,
  ModelGenerationRequest,
  ModelGenerationResponse,
  ModelMetadata,
  ProviderHealth,
} from "../../src/ai/types/index.js";

/**
 * Shared test fixtures.
 *
 * `makeProfile` returns a structurally valid OnboardingProfile without touching
 * the database, so service tests stay fast and hermetic.
 */

interface ProfileOverrides {
  deterministicScores?: Record<string, unknown>;
  primaryHealthConcerns?: string[];
  moodPatterns?: string[];
  sleepChallenges?: string[];
  lifestyleFocus?: string[];
  partnerSupportNeeds?: string[];
  primaryGoals?: string[];
  primaryGoal?: string | null;
  menopausePhase?: string | null;
  partnerSupportInterest?: string | null;
  partnerSharingScopes?: string[];
}

export function makeProfile(overrides: ProfileOverrides = {}): OnboardingProfile {
  return {
    deterministicScores: {
      symptomBurdenScore: 62,
      sleepDisturbanceScore: 71,
      vitalityIndex: 48,
      emotionalBalanceScore: 44,
      dominantFocusArea: "Restorative Sleep & Evening Wind-Down",
      ...overrides.deterministicScores,
    },
    primaryHealthConcerns: overrides.primaryHealthConcerns ?? ["Sleep difficulties", "Fatigue"],
    moodPatterns: overrides.moodPatterns ?? ["increased stress"],
    sleepChallenges: overrides.sleepChallenges ?? ["Staying asleep"],
    lifestyleFocus: overrides.lifestyleFocus ?? [],
    partnerSupportNeeds: overrides.partnerSupportNeeds ?? [],
    primaryGoals: overrides.primaryGoals ?? ["Improve sleep"],
    // An explicit null must clear the default, so these cannot use `??`.
    primaryGoal: "primaryGoal" in overrides ? (overrides.primaryGoal ?? null) : "Improve sleep",
    menopausePhase:
      "menopausePhase" in overrides ? (overrides.menopausePhase ?? null) : "perimenopause",
    partnerSupportInterest: overrides.partnerSupportInterest ?? "not_now",
    partnerSharingScopes: overrides.partnerSharingScopes ?? ["digest_summary"],
  } as unknown as OnboardingProfile;
}

export function makeContextSource(overrides: ProfileOverrides = {}): ContextSource {
  return { profile: makeProfile(overrides), userName: "Test Member" };
}

export const GRANTED_CONSENT = {
  consentId: "wellness_personalization:1.0",
  consentType: "wellness_personalization",
  consentVersion: "1.0",
  status: "granted" as const,
};

/** Minimal, schema-valid snapshot payload with real citation references. */
export function validSnapshotPayload(citationId: string) {
  return personalSnapshotModelOutputSchema.parse({
    symptomPattern: {
      summary: "Your responses suggest your symptom pattern is one of the areas you highlighted.",
      reportedAreas: ["Sleep difficulties"],
      impact: null,
    },
    moodPattern: {
      summary: "Your responses suggest emotional wellbeing is an area you may want to explore.",
      reportedAreas: [],
      impact: null,
    },
    sleepPattern: {
      summary: "Your responses suggest sleep is currently an area you would like to improve.",
      reportedAreas: ["Staying asleep"],
      impact: null,
    },
    energyPattern: {
      summary: "Your responses suggest your energy levels are worth monitoring day to day.",
      reportedAreas: [],
      impact: null,
    },
    lifestyleObservations: ["Only the information you supplied was used for these observations."],
    personalizedRecommendations: [
      {
        what: "Keep a consistent wake time and protect a short wind-down window.",
        why: "It matches the focus area identified from your own entries.",
        start: "Pick one wake time and repeat it for five days.",
        category: "Sleep & Rest",
        citationIds: [citationId],
      },
    ],
    suggestedNextSteps: [
      { horizon: "today", action: "Log one entry today." },
      { horizon: "this_week", action: "Repeat your check-in for five days." },
      { horizon: "track", action: "Watch your energy level." },
    ],
    partnerSupportOpportunity: null,
  });
}

/** Citation id of the seed record that a default sleep profile retrieves. */
export const SLEEP_CITATION_ID = "NAMS-MENO-001";

/**
 * A stub payload that satisfies the output contract but carries caller-supplied
 * text, so guardrail paths (unsafe language, crisis disclosure) are reached rather
 * than being short-circuited by schema validation.
 */
export function stubSnapshotPayload(
  symptomSummary: string,
  citationId = SLEEP_CITATION_ID
) {
  return JSON.stringify({
    symptomPattern: { summary: symptomSummary, reportedAreas: [], impact: null },
    moodPattern: { summary: "Mood observation only.", reportedAreas: [], impact: null },
    sleepPattern: { summary: "Sleep observation only.", reportedAreas: [], impact: null },
    energyPattern: { summary: "Energy observation only.", reportedAreas: [], impact: null },
    lifestyleObservations: ["Only your own entries were used."],
    personalizedRecommendations: [
      {
        what: "Keep a consistent wake time.",
        why: "It matches the focus area from your entries.",
        start: "Repeat one wake time for five days.",
        category: "Sleep & Rest",
        citationIds: [citationId],
      },
    ],
    suggestedNextSteps: [{ horizon: "today", action: "Log one entry." }],
    partnerSupportOpportunity: null,
  });
}

/** A provider stub whose response the test controls completely. */
export class StubProvider implements ModelProvider {
  constructor(
    readonly name: ModelProviderName,
    private readonly handler: (request: ModelGenerationRequest) => Promise<string>
  ) {}

  async generate(request: ModelGenerationRequest): Promise<ModelGenerationResponse> {
    const content = await this.handler(request);
    return {
      provider: this.name,
      model: `stub-${this.name}`,
      modelVersion: "0.0.1",
      content,
      finishReason: "stop",
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      latencyMs: 5,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      provider: this.name,
      status: "healthy",
      latencyMs: 1,
      detail: null,
      checkedAt: new Date().toISOString(),
    };
  }

  getCapabilities(): ModelCapabilities {
    return {
      provider: this.name,
      domain: "general",
      taskTypes: ["structured_generation" as AITaskType],
      supports: ["json_mode", "system_role"],
      maxContextTokens: 8192,
      maxOutputTokens: 2048,
    };
  }

  getModelMetadata(): ModelMetadata {
    return {
      provider: this.name,
      model: `stub-${this.name}`,
      modelVersion: "0.0.1",
      deployment: "test",
      region: "test",
    };
  }
}
