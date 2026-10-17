import { cacheDelPrefix } from "../../config/redis.js";

/**
 * Member view cache keys.
 *
 * The dashboard, progress, and insights endpoints run several parallel
 * `findAll`s and a full trend calculation on every load, and a member often
 * opens two or three of them in quick succession. A short TTL removes that
 * repeat work without the views going visibly stale, and every write to a
 * tracking row clears the member's views immediately.
 */

const MEMBER_VIEW_TTL_SECONDS = 30;

export { MEMBER_VIEW_TTL_SECONDS };

export function memberViewKey(userId: string, view: string, suffix = ""): string {
  return `member:${userId}:${view}${suffix ? `:${suffix}` : ""}`;
}

/**
 * Drops every cached view for one member. Called after a write that changes
 * what a view would show (a new check-in, a deleted entry, a completed
 * onboarding), so the next read recomputes instead of serving the old shape.
 */
export async function invalidateMemberViews(userId: string): Promise<void> {
  await cacheDelPrefix(`member:${userId}:`);
}
