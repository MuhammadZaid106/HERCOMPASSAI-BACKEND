import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { llamaProvider } from "./llama.provider.js";
import { med42Provider } from "./med42.provider.js";
import { openAiCompatibleProvider } from "./openaiCompatible.provider.js";
import type { ModelProvider, ModelProviderName, ProviderHealth } from "../types/index.js";

/**
 * Provider registry.
 *
 * Adding an engine means adding one entry here plus one config block — no feature
 * module and no router logic changes.
 */

const registryLog = logger.module("AI-PROVIDERS");

const providers = new Map<ModelProviderName, ModelProvider>();

providers.set(llamaProvider.name, llamaProvider);
providers.set(med42Provider.name, med42Provider);
providers.set(openAiCompatibleProvider.name, openAiCompatibleProvider);

export function getProvider(name: ModelProviderName): ModelProvider | undefined {
  return providers.get(name);
}

/**
 * Test seam.
 *
 * Replaces a registered engine so failure paths (bad JSON, ungrounded output,
 * transport errors) can be exercised end to end. Guarded to non-production and to
 * the test environment so it can never be used to influence live output.
 */
export function overrideProviderForTests(
  name: ModelProviderName,
  provider: ModelProvider
): void {
  if (env.NODE_ENV !== "test") {
    registryLog.error(`Refusing to override provider "${name}" outside the test environment.`);
    return;
  }
  providers.set(name, provider);
}

export function listProviderNames(): ModelProviderName[] {
  return Array.from(providers.keys());
}

/**
 * Reports engine reachability without exposing URLs, model ids or credentials.
 * Safe to surface on an internal health endpoint.
 */
export async function getProviderHealth(): Promise<ProviderHealth[]> {
  const entries = Array.from(providers.values());
  return Promise.all(entries.map((provider) => provider.healthCheck()));
}
