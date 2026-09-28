import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { HttpChatProvider } from "./httpChatProvider.js";
import type { AITaskType, ModelProviderName } from "../types/index.js";

/**
 * Llama 3 adapter.
 *
 * The model is a replaceable engine. Nothing outside the Gateway references this
 * class, and the model id is configuration, not code.
 */

const LLAMA_TASK_TYPES: AITaskType[] = [
  "structured_generation",
  "interpretation",
  "classification",
  "summarization",
];

export const llamaProvider: HttpChatProvider = new HttpChatProvider({
  name: "llama" as ModelProviderName,
  baseUrl: AI_GATEWAY_CONFIG.providers.llama.url,
  apiKey: AI_GATEWAY_CONFIG.providers.llama.apiKey,
  model: AI_GATEWAY_CONFIG.providers.llama.model,
  modelVersion: AI_GATEWAY_CONFIG.providers.llama.modelVersion,
  domain: "general",
  taskTypes: LLAMA_TASK_TYPES,
  maxContextTokens: 12800,
  maxOutputTokens: 4096,
  defaultTemperature: 0.3,
  deployment: "llama-3",
  region: "self-hosted",
  supportsJsonMode: true,
});
