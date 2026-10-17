import { EvaluationCase } from "../../models/index.js";
import { APPROVED_EVIDENCE } from "../../ai/evidence/approvedEvidence.js";
import { GOLD_CASE_SEED } from "../admin/adminEvaluation.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

const ftLog = logger.module("FINE-TUNING");

export interface FineTuningExample {
  claim: string;
  source: string;
  confidence: "High" | "Moderate";
  messages: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

export interface LoraTrainingConfig {
  baseModel: string;
  architecture: "llama-3" | "med42";
  loraRank: number;
  loraAlpha: number;
  targetModules: string[];
  learningRate: number;
  batchSize: number;
  epochs: number;
  warmupRatio: number;
  evaluationStrategy: "steps";
  saveSteps: number;
  datasetFormat: "chat_template";
}

/**
 * System prompt enforced on all fine-tuning training instances
 * (Spec: Maria's Story Sec 2.3, Build Manual Step 64-67).
 */
const SYSTEM_PROMPT_TEMPLATE = `You are HerCompassAI, an evidence-grounded wellness intelligence assistant.
Rules:
1. Never diagnose medical conditions or prescribe medications or dosages.
2. Ground all explanations in approved clinical evidence (NAMS, ACOG, NIH, WHO).
3. Always maintain an empathetic, non-judgmental, observational tone.
4. Recommend speaking with a clinician if symptoms worsen.`;

export class FineTuningService {
  /**
   * Exports clinician-verified evaluation cases and approved clinical guidance
   * into standard JSONL format for controlled fine-tuning (Spec: Maria's Story Sec 2.2).
   *
   * Enforces strict data separation (Build Manual Step 66): Member production data
   * is NEVER included; only clinician-approved evaluation fixtures and verified evidence.
   */
  async exportClinicianDataset(): Promise<{
    count: number;
    jsonl: string;
    examples: FineTuningExample[];
  }> {
    const examples: FineTuningExample[] = [];
    const hasDb = Boolean(env.DATABASE_URL && env.DATABASE_URL.trim() !== "");

    // 1. Convert active evaluation cases
    let fixtures: Array<{ title: string; feature: string; fixtureOutput: string; mustIncludeCitationHint?: boolean }> = [];
    if (hasDb) {
      try {
        fixtures = await EvaluationCase.findAll({
          where: { active: true, expectPass: true },
        });
      } catch {
        fixtures = GOLD_CASE_SEED.filter((c) => c.expectPass);
      }
    } else {
      fixtures = GOLD_CASE_SEED.filter((c) => c.expectPass);
    }

    for (const item of fixtures) {
      examples.push({
        claim: item.title,
        source: item.mustIncludeCitationHint ? "NAMS / ACOG Clinical Guidelines" : "HerCompass Clinical Knowledge Base",
        confidence: "High",
        messages: [
          { role: "system", content: SYSTEM_PROMPT_TEMPLATE },
          {
            role: "user",
            content: `Explain the wellness context for ${item.feature.replace(/_/g, " ")}.`,
          },
          { role: "assistant", content: item.fixtureOutput },
        ],
      });
    }

    // 2. Synthesize clinician-verified evidence training pairs from Approved Evidence
    for (const record of APPROVED_EVIDENCE) {
      examples.push({
        claim: `${record.title}: ${record.summary}`,
        source: `${record.sourceName} (${record.publicationDate.slice(0, 4)})`,
        confidence: record.authorityLevel >= 4 ? "High" : "Moderate",
        messages: [
          { role: "system", content: SYSTEM_PROMPT_TEMPLATE },
          {
            role: "user",
            content: `What does clinical research say regarding ${record.topicAreas.join(", ")} during midlife transitions?`,
          },
          {
            role: "assistant",
            content: `${record.summary} According to ${record.sourceName} guidance, these lifestyle and nutritional strategies can be discussed alongside clinician care. This is not a diagnosis.`,
          },
        ],
      });
    }

    const jsonlLines = examples.map((ex) => JSON.stringify(ex));
    const jsonl = jsonlLines.join("\n");

    ftLog.info(`Exported ${examples.length} clinician-verified fine-tuning examples`);
    return {
      count: examples.length,
      jsonl,
      examples,
    };
  }

  /**
   * Generates standard LoRA fine-tuning hyperparameters for Llama 3 / Med42.
   */
  getLoraConfig(modelType: "llama-3" | "med42" = "llama-3"): LoraTrainingConfig {
    return {
      baseModel:
        modelType === "med42" ? "med42/med42-70b" : "meta-llama/Meta-Llama-3-8B-Instruct",
      architecture: modelType,
      loraRank: 16,
      loraAlpha: 32,
      targetModules: ["q_proj", "k_proj", "v_proj", "o_proj", "gate_proj", "up_proj", "down_proj"],
      learningRate: 2e-4,
      batchSize: 4,
      epochs: 3,
      warmupRatio: 0.05,
      evaluationStrategy: "steps",
      saveSteps: 100,
      datasetFormat: "chat_template",
    };
  }
}

export const fineTuningService = new FineTuningService();
