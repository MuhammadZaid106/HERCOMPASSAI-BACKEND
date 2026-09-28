import { AI_GATEWAY_CONFIG } from "../../config/aiGateway.js";
import { HttpChatProvider } from "./httpChatProvider.js";
import type { AITaskType, ModelProviderName } from "../types/index.js";

/**
 * Med42 adapter.
 *
 * Med42 is a medical-domain engine, so the router prefers it for clinically
 * framed routes. Application code must never call it directly — features reach it
 * only through the Gateway, per the model-strategy rule in the spec.
 */

const MED42_TASK_TYPES: AITaskType[] = [
  "structured_generation",
  "interpretation",
  "summarization",
];

export const med42Provider: HttpChatProvider = new HttpChatProvider({
  name: "med42" as ModelProviderName,
  baseUrl: AI_GATEWAY_CONFIG.providers.med42.url,
  apiKey: AI_GATEWAY_CONFIG.providers.med42.apiKey,
  model: AI_GATEWAY_CONFIG.providers.med42.model,
  modelVersion: AI_GATEWAY_CONFIG.providers.med42.modelVersion,
  domain: "clinical",
  taskTypes: MED42_TASK_TYPES,
  maxContextTokens: 16000,
  maxOutputTokens: 4096,
  defaultTemperature: 0.2,
  deployment: "med42",
  region: "self-hosted",
  supportsJsonMode: true,
});
