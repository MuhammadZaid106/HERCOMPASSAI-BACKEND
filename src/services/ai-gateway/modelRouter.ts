import { AI_GATEWAY_CONFIG, getRouteRule } from "../../config/aiGateway.js";
import { getProvider, listProviderNames } from "../../ai/providers/index.js";
import { logger } from "../../utils/logger.js";
import type {
  AITaskType,
  GatewayFeature,
  ModelProvider,
  ModelProviderName,
} from "../../ai/types/index.js";

const routerLog = logger.module("AI-ROUTER");

/**
 * Model router.
 *
 * Directive: no feature module decides which model answers. The router reads the
 * declared routing policy, verifies the engine is actually registered, and
 * returns an ordered attempt plan. Routing is configuration, so a model swap is a
 * config change plus a deploy — not a code change.
 */

export interface RouteAttempt {
  provider: ModelProviderName;
  providerInstance: ModelProvider;
  /** Position in the chain: 0 is primary. */
  order: number;
  isFallback: boolean;
}

export interface RoutePlan {
  attempts: RouteAttempt[];
  temperature: number;
  maxOutputTokens: number;
  minCitations: number;
  taskType: AITaskType;
}

export function resolveRoute(feature: GatewayFeature, taskType: AITaskType): RoutePlan {
  const rule = getRouteRule(feature, taskType);

  if (!rule) {
    throw new Error(`No model routing rule registered for feature "${feature}" and task "${taskType}"`);
  }

  const registered = new Set(listProviderNames());
  const ordered = [rule.primary, ...rule.fallbackChain];

  const attempts: RouteAttempt[] = [];
  const seen = new Set<ModelProviderName>();
  /**
   * Endpoints already queued or tried, keyed by deployment + model.
   *
   * Two registered engines can point at the same weights on the same host, which
   * is exactly the current configuration: `med42` and `llama` are both configured
   * against the Hugging Face router with the same model. Attempting the identical
   * endpoint twice does not add a second chance of success — it doubles the time a
   * member waits before reaching the deterministic fallback, and it is why a
   * degraded Snapshot took 40s to say nothing useful.
   */
  const seenEndpoints = new Set<string>();

  for (const name of ordered) {
    if (seen.has(name)) continue;
    seen.add(name);

    if (!registered.has(name)) {
      routerLog.debug(`Skipping unregistered provider "${name}" for feature "${feature}".`);
      continue;
    }

    const providerInstance = getProvider(name);
    if (!providerInstance) continue;

    const endpointKey = endpointIdentity(providerInstance);
    if (endpointKey !== null && seenEndpoints.has(endpointKey)) {
      routerLog.debug(
        `Skipping provider "${name}" for feature "${feature}": it resolves to the same deployment and model as an earlier route.`
      );
      continue;
    }
    if (endpointKey !== null) seenEndpoints.add(endpointKey);

    attempts.push({
      provider: name,
      providerInstance,
      order: attempts.length,
      isFallback: attempts.length > 0,
    });
  }

  if (attempts.length === 0) {
    throw new Error(
      `No model provider is available for feature "${feature}". The AI Gateway cannot serve this request.`
    );
  }

  return {
    attempts: attempts.slice(0, 1 + AI_GATEWAY_CONFIG.limits.maxFallbackAttempts),
    temperature: rule.temperature,
    maxOutputTokens: rule.maxOutputTokens,
    minCitations: rule.minCitations,
    taskType,
  };
}

/**
 * Identity of the weights an engine will actually call, for deduplication.
 *
 * Prefers the engine's own opaque endpoint digest, because that reflects the real
 * host and model. Falls back to the deployment label and model id only for an
 * engine that does not implement it, and returns null when neither is available so
 * the dedupe stays a safe skip rather than a guess.
 */
function endpointIdentity(provider: ModelProvider): string | null {
  try {
    const digest = provider.getEndpointIdentity?.();
    if (typeof digest === "string" && digest.trim() !== "") return digest;

    const metadata = provider.getModelMetadata();
    if (!metadata.model.trim()) return null;
    return `${metadata.deployment}::${metadata.model}`;
  } catch {
    return null;
  }
}

/** Reporting view for the health endpoint. Never exposes URLs or credentials. */export function describeRouting(): Array<{
  feature: GatewayFeature;
  taskType: AITaskType;
  primary: ModelProviderName;
  fallback: ModelProviderName[];
  available: ModelProviderName[];
}> {
  return AI_GATEWAY_CONFIG.routing.map((rule) => ({
    feature: rule.feature,
    taskType: rule.taskType,
    primary: rule.primary,
    fallback: [...rule.fallbackChain],
    available: [rule.primary, ...rule.fallbackChain].filter((name) =>
      listProviderNames().includes(name)
    ),
  }));
}
