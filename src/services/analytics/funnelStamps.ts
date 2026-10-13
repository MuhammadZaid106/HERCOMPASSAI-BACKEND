import { QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { logger } from "../../utils/logger.js";

const log = logger.module("FUNNEL");

export const FUNNEL_STAMP_NAMES = [
  "onboarding_started",
  "onboarding_completed",
  "snapshot_generated",
  "snapshot_displayed",
] as const;

export type FunnelStampName = (typeof FUNNEL_STAMP_NAMES)[number];

const COLUMN_SQL: Record<FunnelStampName, string> = {
  onboarding_started: "onboarding_started_at",
  onboarding_completed: "onboarding_completed_at",
  snapshot_generated: "snapshot_generated_at",
  snapshot_displayed: "snapshot_displayed_at",
};

/**
 * Idempotent first-write for a funnel stamp.
 * Never throws to product paths — a failed stamp must not block Snapshot or onboarding.
 */
export async function stampFunnelFirstWrite(
  userId: string,
  stamp: FunnelStampName,
): Promise<void> {
  const column = COLUMN_SQL[stamp];
  try {
    await sequelize.query(
      `
      INSERT INTO user_funnel_stamps (user_id, ${column}, created_at, updated_at)
      VALUES (:userId, NOW(), NOW(), NOW())
      ON CONFLICT (user_id) DO UPDATE
      SET ${column} = COALESCE(user_funnel_stamps.${column}, EXCLUDED.${column}),
          updated_at = NOW()
      `,
      { replacements: { userId } },
    );
  } catch (error) {
    log.error(`Failed to stamp ${stamp} for ${userId}`, error);
  }
}

export type FunnelIntervalId =
  | "signup_to_onboarding_started"
  | "onboarding_started_to_completed"
  | "onboarding_completed_to_snapshot_generated"
  | "snapshot_generated_to_displayed"
  | "signup_to_snapshot_displayed";

export interface FunnelIntervalCard {
  id: FunnelIntervalId;
  label: string;
  /** Formatted median duration, or null when nobody has both stamps yet. */
  median: string | null;
  sampleSize: number;
}

const INTERVAL_DEFS: Array<{
  id: FunnelIntervalId;
  label: string;
  sql: string;
}> = [
  {
    id: "signup_to_onboarding_started",
    label: "Signup → onboarding started",
    sql: `SELECT EXTRACT(EPOCH FROM (f.onboarding_started_at - u.created_at)) AS seconds
          FROM user_funnel_stamps f
          INNER JOIN users u ON u.id = f.user_id
          WHERE u.role = 'member'
            AND f.onboarding_started_at IS NOT NULL
            AND f.onboarding_started_at >= u.created_at`,
  },
  {
    id: "onboarding_started_to_completed",
    label: "Onboarding started → completed",
    sql: `SELECT EXTRACT(EPOCH FROM (f.onboarding_completed_at - f.onboarding_started_at)) AS seconds
          FROM user_funnel_stamps f
          INNER JOIN users u ON u.id = f.user_id
          WHERE u.role = 'member'
            AND f.onboarding_started_at IS NOT NULL
            AND f.onboarding_completed_at IS NOT NULL
            AND f.onboarding_completed_at >= f.onboarding_started_at`,
  },
  {
    id: "onboarding_completed_to_snapshot_generated",
    label: "Onboarding completed → snapshot generated",
    sql: `SELECT EXTRACT(EPOCH FROM (f.snapshot_generated_at - f.onboarding_completed_at)) AS seconds
          FROM user_funnel_stamps f
          INNER JOIN users u ON u.id = f.user_id
          WHERE u.role = 'member'
            AND f.onboarding_completed_at IS NOT NULL
            AND f.snapshot_generated_at IS NOT NULL
            AND f.snapshot_generated_at >= f.onboarding_completed_at`,
  },
  {
    id: "snapshot_generated_to_displayed",
    label: "Snapshot generated → displayed",
    sql: `SELECT EXTRACT(EPOCH FROM (f.snapshot_displayed_at - f.snapshot_generated_at)) AS seconds
          FROM user_funnel_stamps f
          INNER JOIN users u ON u.id = f.user_id
          WHERE u.role = 'member'
            AND f.snapshot_generated_at IS NOT NULL
            AND f.snapshot_displayed_at IS NOT NULL
            AND f.snapshot_displayed_at >= f.snapshot_generated_at`,
  },
  {
    id: "signup_to_snapshot_displayed",
    label: "Signup → snapshot displayed",
    sql: `SELECT EXTRACT(EPOCH FROM (f.snapshot_displayed_at - u.created_at)) AS seconds
          FROM user_funnel_stamps f
          INNER JOIN users u ON u.id = f.user_id
          WHERE u.role = 'member'
            AND f.snapshot_displayed_at IS NOT NULL
            AND f.snapshot_displayed_at >= u.created_at`,
  },
];

export async function loadFunnelIntervalCards(
  formatDuration: (seconds: number) => string,
  medianSeconds: (values: number[]) => number | null,
): Promise<FunnelIntervalCard[]> {
  const cards: FunnelIntervalCard[] = [];
  for (const def of INTERVAL_DEFS) {
    try {
      const rows = await sequelize.query<{ seconds: number }>(def.sql, {
        type: QueryTypes.SELECT,
      });
      const values = rows.map((row) => Number(row.seconds));
      const median = medianSeconds(values);
      cards.push({
        id: def.id,
        label: def.label,
        median: median === null ? null : formatDuration(median),
        sampleSize: values.filter((value) => Number.isFinite(value) && value >= 0).length,
      });
    } catch (error) {
      log.error(`Failed to load funnel interval ${def.id}`, error);
      cards.push({
        id: def.id,
        label: def.label,
        median: null,
        sampleSize: 0,
      });
    }
  }
  return cards;
}
