import { Op, QueryTypes } from "sequelize";
import {
  ENTITLEMENTS,
  ENTITLEMENT_BYPASS_ROLES,
  ENTITLEMENT_PERIOD_DAYS,
  type Entitlement,
  type EntitlementFeature,
} from "../../config/entitlements.js";
import { resolveMemberPlan, type MemberPlanId } from "./planCatalog.js";
import { EntitlementUsage } from "../../models/EntitlementUsage.js";
import { User } from "../../models/User.js";
import { sequelize } from "../../config/db.js";
import { logger } from "../../utils/logger.js";

/**
 * Entitlement resolution and enforcement.
 *
 * This is the only module that interprets `config/entitlements.ts`. Every server
 * route that gates a paid capability calls `checkFeature` or
 * `consumeAiGeneration` from here, so a route cannot invent its own idea of what
 * a plan includes.
 *
 * The client also reads entitlements, to decide what to *show*. That is
 * presentation only. Hiding a button is not enforcement, which is why the gates
 * below live on the server and re-read the plan from the database rather than
 * trusting the plan claim inside the access token.
 */

const entitlementLog = logger.module("ENTITLEMENTS");

export interface EntitlementVerdict {
  allowed: boolean;
  /** Machine-readable reason, for the 402 body and for tests. */
  reason: "allowed" | "feature_locked" | "quota_exhausted" | "unknown_plan";
  /** The plan that was evaluated. */
  plan: MemberPlanId;
  feature?: EntitlementFeature;
  /** Member-facing upgrade message, present only when not allowed. */
  message?: string;
  /** Generations left in the current window, when quota-based. */
  remaining?: number | null;
  /** When the quota window resets, when quota-based. */
  resetsAt?: string;
}

export interface ActorLike {
  userId: string;
  role?: string | null;
}

const UPGRADE_PROMPT = "Upgrade your plan to unlock this.";

export function entitlementsFor(plan: string | null | undefined): Entitlement {
  return ENTITLEMENTS[resolveMemberPlan(plan)];
}

function bypassesPlan(role: string | null | undefined): boolean {
  return !!role && (ENTITLEMENT_BYPASS_ROLES as readonly string[]).includes(role);
}

/**
 * An unrecognised plan must fail closed.
 *
 * `resolveMemberPlan` coerces unknown values to `free`, which is right for a
 * display label. For an access decision it would silently downgrade an account
 * whose plan was somehow invalid — better to refuse and ask a human.
 */
function isKnownPlan(plan: string | null | undefined): plan is MemberPlanId {
  return plan === "free" || plan === "plus" || plan === "premium";
}

/** Start of the rolling window that `now` falls in. */
export function currentWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - ENTITLEMENT_PERIOD_DAYS * 24 * 60 * 60 * 1000);
}

/** When the current quota window ends. */
export function windowResetsAt(now: Date = new Date()): string {
  return new Date(
    now.getTime() + ENTITLEMENT_PERIOD_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
}

/**
 * Feature gate.
 *
 * Reads the plan from the database rather than from the access token. A token
 * issued before a downgrade stays valid for its lifetime, so trusting the claim
 * would keep granting the old tier until the token expired.
 */
export async function checkFeature(
  actor: ActorLike,
  feature: EntitlementFeature
): Promise<EntitlementVerdict> {
  const storedPlan = await readPlan(actor.userId);

  if (!isKnownPlan(storedPlan)) {
    entitlementLog.error(`Unknown plan "${storedPlan}" for userId: ${actor.userId}`);
    return {
      allowed: false,
      reason: "unknown_plan",
      plan: "free",
      feature,
      message: "We could not confirm your plan. Please contact support.",
    };
  }

  if (bypassesPlan(actor.role)) {
    return { allowed: true, reason: "allowed", plan: storedPlan, feature };
  }

  if (ENTITLEMENTS[storedPlan].features[feature]) {
    return { allowed: true, reason: "allowed", plan: storedPlan, feature };
  }

  return {
    allowed: false,
    reason: "feature_locked",
    plan: storedPlan,
    feature,
    message: `${featureLabel(feature)} is included from the Plus plan. ${UPGRADE_PROMPT}`,
  };
}

/**
 * AI generation meter.
 *
 * Called before the model runs, and it consumes the budget. Refunding on a failed
 * generation would let a member burn attempts against a broken provider for free,
 * and would leave the counter disagreeing with the audit log.
 */
export async function consumeAiGeneration(
  actor: ActorLike,
  now: Date = new Date()
): Promise<EntitlementVerdict> {
  const storedPlan = await readPlan(actor.userId);

  if (!isKnownPlan(storedPlan)) {
    entitlementLog.error(`Unknown plan "${storedPlan}" for userId: ${actor.userId}`);
    return {
      allowed: false,
      reason: "unknown_plan",
      plan: "free",
      message: "We could not confirm your plan. Please contact support.",
    };
  }

  const plan = storedPlan;
  const resetsAt = windowResetsAt(now);

  if (bypassesPlan(actor.role)) {
    return { allowed: true, reason: "allowed", plan, remaining: null, resetsAt };
  }

  const limit = ENTITLEMENTS[plan].aiGenerationsPerPeriod;
  if (limit === null) {
    return { allowed: true, reason: "allowed", plan, remaining: null, resetsAt };
  }

  // Read first only so the rejection message can quote the real count. The
  // decision itself is made by `tryConsumeGeneration`, which cannot be talked out
  // of the limit by a race between this read and that write.
  const used = await countGenerations(actor.userId, currentWindowStart(now));
  if (used >= limit) {
    return {
      allowed: false,
      reason: "quota_exhausted",
      plan,
      remaining: 0,
      resetsAt,
      message: `You have used all ${limit} AI insights included on the Free plan this month. ${UPGRADE_PROMPT}`,
    };
  }

  const consumed = await tryConsumeGeneration(actor.userId, limit, now);

  if (consumed === null) {
    // Lost the race against a concurrent request that took the last slot. Refusing
    // here is the point: an allowance that can be over-spent by sending two
    // requests at once is not an allowance.
    entitlementLog.info(
      `Concurrent generation over the allowance limit for user ${actor.userId}; refused the second.`
    );
    return {
      allowed: false,
      reason: "quota_exhausted",
      plan,
      remaining: 0,
      resetsAt,
      message: `You have used all ${limit} AI insights included on the Free plan this month. ${UPGRADE_PROMPT}`,
    };
  }

  return {
    allowed: true,
    reason: "allowed",
    plan,
    remaining: Math.max(0, limit - consumed),
    resetsAt,
  };
}

/**
 * Read a member's usage without consuming any.
 *
 * The progress page and the subscription view need to say "3 of 5 used", which
 * requires the count but must not spend a generation.
 */
export async function readAiUsage(
  actor: ActorLike,
  now: Date = new Date()
): Promise<{
  used: number;
  limit: number | null;
  remaining: number | null;
  resetsAt: string;
  plan: MemberPlanId;
}> {
  const plan = resolveMemberPlan(await readPlan(actor.userId));
  const limit = ENTITLEMENTS[plan].aiGenerationsPerPeriod;
  const used = await countGenerations(actor.userId, currentWindowStart(now));

  return {
    used,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - used),
    resetsAt: windowResetsAt(now),
    plan,
  };
}

/**
 * Clamp a requested history window to what the plan covers.
 *
 * Returns the ceiling rather than throwing, so the progress page can ask for 90
 * days and receive 30. A member who has not decided about upgrading yet should
 * still see their own data, just the part their plan includes.
 */
export async function clampHistoryWindow(
  actor: ActorLike,
  requestedDays: number
): Promise<number> {
  if (bypassesPlan(actor.role)) return requestedDays;
  const plan = resolveMemberPlan(await readPlan(actor.userId));
  const max = ENTITLEMENTS[plan].trackingHistoryDays;
  return max === null ? requestedDays : Math.min(requestedDays, max);
}

// ─── internals ────────────────────────────────────────────────────────────────

async function readPlan(userId: string): Promise<string | null> {
  const user = await User.findByPk(userId, { attributes: ["plan"] });
  return user?.plan ?? null;
}

function countGenerations(userId: string, windowStart: Date): Promise<number> {
  return Promise.resolve(
    EntitlementUsage.sum("aiGenerations", {
      where: { userId, windowStartedAt: { [Op.gt]: windowStart } },
    })
  ).then((total) => Number(total ?? 0));
}

/**
 * Consume one generation, atomically, and report the new count.
 *
 * This is a single statement on purpose. The previous version read the count in
 * one query and incremented in another, which has two failure modes that both
 * matter for a metered allowance:
 *
 *  - The window key was recomputed per request (`now - 30 days`, to the
 *    millisecond), so `ON CONFLICT (user_id, window_started_at)` never matched.
 *    Every call inserted a new row and the "atomic" increment did nothing at all.
 *  - Even with a stable key, count-then-increment hands out N+1 under concurrency:
 *    two simultaneous requests both read `limit - 1`, both see a slot free, both
 *    are allowed, and the member goes over their allowance.
 *
 * The `WHERE` guard on the `DO UPDATE` is what fixes the second one: the row is
 * locked for the update and the condition re-evaluated against the locked row, so
 * the increment only lands while the count is still under the limit. A request
 * that loses the race gets back `null` and is treated as exhausted.
 *
 * Returns the new count on success, or `null` when the allowance was already
 * spent. `window_started_at` moves forward in the same statement when the window
 * has lapsed, which is what keeps this to one round trip.
 */
async function tryConsumeGeneration(
  userId: string,
  limit: number,
  now: Date
): Promise<number | null> {
  const rows = await sequelize.query<{ count: number }>(
    `INSERT INTO entitlement_usage (user_id, window_started_at, ai_generations, created_at, updated_at)
     VALUES (:userId, :now, 1, NOW(), NOW())
     ON CONFLICT (user_id) DO UPDATE
       SET ai_generations = CASE
             WHEN entitlement_usage.window_started_at <= :windowStart
               THEN 1
             ELSE entitlement_usage.ai_generations + 1
           END,
           window_started_at = CASE
             WHEN entitlement_usage.window_started_at <= :windowStart
               THEN :now
             ELSE entitlement_usage.window_started_at
           END,
           updated_at = NOW()
       WHERE entitlement_usage.window_started_at <= :windowStart
          OR entitlement_usage.ai_generations < :limit
     RETURNING ai_generations AS count`,
    {
      // `SELECT` so Sequelize returns the RETURNING rows as a plain array. A
      // write query with no explicit type comes back as the raw `[rows, meta]`
      // tuple, which is why the result was being read as `never`.
      type: QueryTypes.SELECT,
      replacements: {
        userId,
        now,
        windowStart: currentWindowStart(now),
        limit,
      },
    }
  );

  const count = rows?.[0]?.count;
  return typeof count === "number" ? count : null;
}

function featureLabel(feature: EntitlementFeature): string {
  return feature
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
