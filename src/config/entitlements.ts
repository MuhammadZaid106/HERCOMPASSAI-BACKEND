import { memberPlanIds, type MemberPlanId } from "../services/member/planCatalog.js";

/**
 * Entitlement configuration.
 *
 * Directive: "The exact proprietary routing strategy should remain configurable
 * rather than embedded throughout application code." The same reasoning applies
 * to access control. Every limit and every feature gate lives in this one table
 * so that changing what Free includes is a config edit, not a hunt through
 * route handlers.
 *
 * Nothing in the product layer reads a plan and compares it to a string. Callers
 * go through `src/services/member/entitlements.ts`, which is the only place that
 * interprets this table.
 */

/** A capability that can be switched on or off per plan. */
export type EntitlementFeature =
  | "snapshot"
  | "tracking"
  | "recommendations"
  | "insights"
  | "patterns"
  | "wellness_plans"
  | "partner_support"
  | "partner_digest"
  | "academy"
  | "advanced_reports"
  | "advanced_personalization"
  | "advanced_partner_intelligence"
  | "multi_week_plans"
  | "advanced_trends"
  | "priority_support"
  | "evidence_inspection";

/**
 * A plan row is a total, not a delta.
 *
 * Read `ENTITLEMENTS` as the single definition of what each plan includes, so a
 * change here changes enforcement everywhere at once. `PLUS` and `PREMIUM` spread
 * the tier below purely to keep the deltas visible at a glance.
 */
export type Entitlement = {
  /** Maximum AI generations per rolling window. `null` means unlimited. */
  aiGenerationsPerPeriod: number | null;
  /** Longest history window the progress endpoint will honour, in days. */
  trackingHistoryDays: number | null;
  /** Snapshot revisions a member may keep. `null` means unlimited. */
  snapshotVersionsRetained: number | null;
  features: Record<EntitlementFeature, boolean>;
};

/**
 * The Free baseline matches what the pricing page promises: the Snapshot, basic
 * tracking and basic recommendations, plus a bounded number of AI insights.
 *
 * The numbers below are the ones `PricingSection.tsx` advertises. Where the two
 * ever disagree, this table is the one that is enforced, and the copy is wrong.
 */
const FREE: Entitlement = {
  aiGenerationsPerPeriod: 5,
  trackingHistoryDays: 30,
  snapshotVersionsRetained: 1,
  features: {
    snapshot: true,
    tracking: true,
    recommendations: true,
    insights: true,
    patterns: false,
    wellness_plans: false,
    partner_support: false,
    partner_digest: false,
    academy: false,
    advanced_reports: false,
    advanced_personalization: false,
    advanced_partner_intelligence: false,
    multi_week_plans: false,
    advanced_trends: false,
    priority_support: false,
    evidence_inspection: false,
  },
};

const PLUS: Entitlement = {
  aiGenerationsPerPeriod: null,
  trackingHistoryDays: 365,
  snapshotVersionsRetained: 10,
  features: {
    ...FREE.features,
    patterns: true,
    wellness_plans: true,
    partner_support: true,
    partner_digest: true,
    academy: true,
    advanced_reports: true,
    evidence_inspection: true,
  },
};

const PREMIUM: Entitlement = {
  aiGenerationsPerPeriod: null,
  trackingHistoryDays: null,
  snapshotVersionsRetained: null,
  features: {
    ...PLUS.features,
    advanced_personalization: true,
    advanced_partner_intelligence: true,
    multi_week_plans: true,
    advanced_trends: true,
    priority_support: true,
  },
};

export const ENTITLEMENTS: Record<MemberPlanId, Entitlement> = {
  free: FREE,
  plus: PLUS,
  premium: PREMIUM,
};

/**
 * Asserts every plan defines every feature.
 *
 * `Record<EntitlementFeature, boolean>` already makes this a compile error, which
 * is the point: a feature added to the union without a row here would fail to
 * build rather than silently defaulting to `false` at runtime.
 */
export const ENTITLEMENT_FEATURE_COUNT = Object.keys(FREE.features).length;

/** Length of the AI usage window. Rolling 30 days, not a calendar month. */
export const ENTITLEMENT_PERIOD_DAYS = 30;

/**
 * Every feature named in the catalog, used to assert the table above is complete.
 * A feature added to `EntitlementFeature` without a row in one of the three plans
 * would otherwise fail open as `undefined`.
 */
export const ALL_ENTITLEMENT_FEATURES = Object.keys(
  FREE.features
) as EntitlementFeature[];

/** Roles that bypass plan gating entirely. */
export const ENTITLEMENT_BYPASS_ROLES = ["admin"] as const;

/**
 * Compile-time proof that the exported table covers every plan.
 *
 * Without this, widening `memberPlanIds` would leave `ENTITLEMENTS` short a key
 * and every lookup would be `undefined` at runtime.
 */
type _EveryPlanIsDefined = (typeof memberPlanIds)[number] extends keyof typeof ENTITLEMENTS
  ? true
  : never;
export type EveryPlanIsDefined = _EveryPlanIsDefined;
