import { AnalyticsEvent } from "../../models/AnalyticsEvent.js";
import { logger } from "../../utils/logger.js";

const log = logger.module("ANALYTICS");

/** Required product events for Milestone gap Feature 4. */
export const PRODUCT_EVENT_NAMES = [
  "onboarding_started",
  "onboarding_completed",
  "snapshot_generated",
  "snapshot_viewed",
  "checkout_started",
  "checkout_completed",
] as const;

export type ProductEventName = (typeof PRODUCT_EVENT_NAMES)[number];

/**
 * Records a product event. Never throws to the caller — analytics must not
 * break onboarding, Snapshot, or checkout if the insert fails.
 */
export async function trackEvent(
  eventName: ProductEventName | string,
  input: {
    userId?: string | null;
    properties?: Record<string, unknown>;
  } = {},
): Promise<void> {
  try {
    await AnalyticsEvent.create({
      userId: input.userId ?? null,
      eventName,
      properties: input.properties ?? {},
    });
  } catch (error) {
    log.error(`Failed to record event ${eventName}`, error);
  }
}

export async function countProductEventsByName(
  days: 14 | 30,
  now = new Date(),
): Promise<Array<{ eventName: string; count: number }>> {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - (days - 1));

  const { sequelize } = await import("../../config/db.js");
  const { QueryTypes } = await import("sequelize");

  const rows = await sequelize.query<{ event_name: string; count: number }>(
    `SELECT event_name, COUNT(*)::int AS count
     FROM analytics_events
     WHERE created_at >= :start
     GROUP BY event_name
     ORDER BY event_name ASC`,
    { replacements: { start }, type: QueryTypes.SELECT },
  );

  const byName = new Map(rows.map((row) => [row.event_name, Number(row.count) || 0]));
  return PRODUCT_EVENT_NAMES.map((eventName) => ({
    eventName,
    count: byName.get(eventName) ?? 0,
  }));
}
