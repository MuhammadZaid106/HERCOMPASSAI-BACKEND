import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { HttpChatProvider } from "./httpChatProvider.js";
import type { AITaskType, ModelProviderName } from "../types/index.js";

/**
 * OpenAI-compatible fallback engine.
 *
 * Exists so a future provider can be introduced by configuration alone, proving
 * the abstraction holds: "Future providers must be addable without rewriting the product."
 */

const FALLBACK_TASK_TYPES: AITaskType[] = [
  "structured_generation",
  "interpretation",
  "classification",
  "summarization",
];

export const openAiCompatibleProvider: HttpChatProvider = new HttpChatProvider({
  name: "openai_compatible" as ModelProviderName,
  baseUrl: AI_GATEWAY_CONFIG.providers.openai_compatible.url,
  apiKey: AI_GATEWAY_CONFIG.providers.openai_compatible.apiKey,
  model: AI_GATEWAY_CONFIG.providers.openai_compatible.model,
  modelVersion: AI_GATEWAY_CONFIG.providers.openai_compatible.modelVersion,
  domain: "general",
  taskTypes: FALLBACK_TASK_TYPES,
  maxContextTokens: 12800,
  maxOutputTokens: 4096,
  defaultTemperature: 0.3,
  deployment: "openai-compatible",
  region: "external",
  supportsJsonMode: true,
});
