/**
 * Shapes staff responses.
 *
 * These functions never read the database and never accept a health log. The
 * query layer calls them after it has already selected the columns staff are
 * allowed to see.
 */

export const INVITE_STATES = ["sent", "accepted", "declined", "revoked"] as const;
export type InviteState = (typeof INVITE_STATES)[number];

export const PLAN_IDS = ["free", "plus", "premium"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

const KNOWN_SCOPES = [
  "general_support",
  "shared_activities",
  "communication_guidance",
] as const;

export function firstName(name: string): string {
  const part = name.trim().split(/\s+/)[0];
  return part && part.length > 0 ? part : "Member";
}

export function accountStatus(emailVerified: boolean): "confirmed" | "unconfirmed" {
  return emailVerified ? "confirmed" : "unconfirmed";
}

/** Escapes LIKE wildcards so a search for "%" cannot match every row. */
export function likePattern(raw: string): string {
  const escaped = raw.replace(/[\\%_]/g, (char) => `\\${char}`);
  return `%${escaped}%`;
}

export function utcDayKeys(days: number, now = new Date()): string[] {
  const keys: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - offset),
    );
    keys.push(day.toISOString().slice(0, 10));
  }
  return keys;
}

export function utcWindowStart(days: number, now = new Date()): Date {
  const keys = utcDayKeys(days, now);
  return new Date(`${keys[0]}T00:00:00.000Z`);
}

export function fillDayCounts(
  keys: string[],
  rows: Array<{ day: string; count: number }>,
): Array<{ day: string; count: number }> {
  const byDay = new Map(rows.map((row) => [row.day, row.count]));
  return keys.map((day) => ({ day, count: byDay.get(day) ?? 0 }));
}

export function countsForPlans(
  rows: Array<{ plan: string; count: number }>,
): Array<{ plan: PlanId; count: number }> {
  const byPlan = new Map(rows.map((row) => [row.plan, row.count]));
  return PLAN_IDS.map((plan) => ({ plan, count: byPlan.get(plan) ?? 0 }));
}

export function countsForInvites(
  rows: Array<{ status: string; count: number }>,
): Array<{ status: InviteState; count: number }> {
  const byStatus = new Map(rows.map((row) => [row.status, row.count]));
  return INVITE_STATES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
}

export function asCount(value: unknown): number {
  const count = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(count) || count < 0) return 0;
  return Math.trunc(count);
}

export function scopeList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const scopes: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const scope = item === "digest_summary" ? "general_support" : item;
    if (seen.has(scope)) continue;
    if (!(KNOWN_SCOPES as readonly string[]).includes(scope)) continue;
    seen.add(scope);
    scopes.push(scope);
  }
  return scopes;
}

export function partnerStateForUser(
  userId: string,
  invites: Array<{
    memberUserId: string;
    partnerUserId: string | null;
    status: string;
    updatedAt: Date;
  }>,
): InviteState | "none" {
  const latest = invites
    .filter((invite) => invite.memberUserId === userId || invite.partnerUserId === userId)
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())[0];
  if (!latest) return "none";
  if (
    latest.status === "sent" ||
    latest.status === "accepted" ||
    latest.status === "declined" ||
    latest.status === "revoked"
  ) {
    return latest.status;
  }
  return "none";
}
