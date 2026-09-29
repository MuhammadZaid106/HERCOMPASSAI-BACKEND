import type { DomainTrend, TrendEngineOutput } from "../intelligence/trendTypes.js";

export type InsightLogSignals = Record<string, string | number | boolean>;

function domainSignals(prefix: string, domain: DomainTrend): InsightLogSignals {
  if (!domain.sufficientData || domain.changePercent === null) {
    return {
      [`${prefix}Trend`]: "not_enough_logs",
      [`${prefix}ChangePercent`]: "not_enough_logs",
    };
  }
  return {
    [`${prefix}Trend`]: domain.trend,
    [`${prefix}ChangePercent`]: domain.changePercent,
  };
}

/** Scalars only. The model may interpret these. It must not be asked to calculate them. */
export function insightLogSignalsFromTrends(trends: TrendEngineOutput): InsightLogSignals {
  return {
    logRangeDays: trends.rangeDays,
    logDaysWithAnyEntry: trends.daysWithAnyEntry,
    logDataSufficient: !trends.insufficientData,
    ...domainSignals("symptom", trends.symptoms),
    ...domainSignals("mood", trends.mood),
    ...domainSignals("sleep", trends.sleep),
    ...domainSignals("energy", trends.energy),
  };
}
