export const memberPlanIds = ["free", "plus", "premium"] as const;
export type MemberPlanId = (typeof memberPlanIds)[number];
export type PlanAccess = "included" | "limited" | "not_included";

export interface PlanSummary {
  id: MemberPlanId;
  label: string;
  summary: string;
  description: string;
}

export interface PlanComparisonRow {
  id: string;
  label: string;
  access: Record<MemberPlanId, PlanAccess>;
}

export const planSummaries: PlanSummary[] = [
  {
    id: "free",
    label: "Free",
    summary: "Basic recommendations.",
    description:
      "Your Personal Snapshot, basic tracking, and foundational guidance.",
  },
  {
    id: "plus",
    label: "Plus",
    summary: "Personalized wellness plans.",
    description:
      "Expanded insights, deeper patterns, and personalized support.",
  },
  {
    id: "premium",
    label: "Premium",
    summary: "Multi-week adaptive plans.",
    description:
      "Advanced personalization, plans, and partner intelligence.",
  },
];

/** Entitlements from the UX comparison. Prices stay out of this catalog. */
export const planComparison: PlanComparisonRow[] = [
  row("snapshot", "Personal Snapshot", "included", "included", "included"),
  row("tracking", "Basic tracking", "included", "included", "included"),
  row("recommendations", "Basic recommendations", "included", "included", "included"),
  row("insights", "Expanded AI Insights", "not_included", "included", "included"),
  row("patterns", "Deeper patterns", "not_included", "included", "included"),
  row("wellness-plans", "Wellness plans", "not_included", "included", "included"),
  row("partner", "Partner Support", "limited", "included", "included"),
  row("digest", "Partner Digest", "not_included", "included", "included"),
  row("academy", "Men's Academy", "not_included", "included", "included"),
  row("reports", "Advanced reports", "not_included", "included", "included"),
  row("personalization", "Advanced personalization", "not_included", "not_included", "included"),
  row("partner-intelligence", "Advanced partner intelligence", "not_included", "not_included", "included"),
  row("multi-week", "Multi-week plans", "not_included", "not_included", "included"),
  row("trends", "Advanced trend analysis", "not_included", "not_included", "included"),
  row("support", "Priority support", "not_included", "not_included", "included"),
];

function row(
  id: string,
  label: string,
  free: PlanAccess,
  plus: PlanAccess,
  premium: PlanAccess,
): PlanComparisonRow {
  return { id, label, access: { free, plus, premium } };
}

export function resolveMemberPlan(value: string | null | undefined): MemberPlanId {
  return value === "plus" || value === "premium" ? value : "free";
}

export function planSummary(id: MemberPlanId): PlanSummary {
  const summary = planSummaries.find((plan) => plan.id === id);
  if (!summary) return planSummaries[0];
  return summary;
}
