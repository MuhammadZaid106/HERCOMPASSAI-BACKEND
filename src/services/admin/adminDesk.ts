import { Op, QueryTypes } from "sequelize";
import { sequelize } from "../../config/db.js";
import { ENTITLEMENTS, type EntitlementFeature } from "../../config/entitlements.js";
import {
  OnboardingProfile,
  PartnerInvite,
  PersonalSnapshot,
  SupportRequest,
  User,
} from "../../models/index.js";
import { planSummaries } from "../member/planCatalog.js";
import {
  accountStatus,
  asCount,
  countsForInvites,
  countsForPlans,
  fillDayCounts,
  firstName,
  likePattern,
  partnerStateForUser,
  scopeList,
  utcDayKeys,
  utcWindowStart,
  type InviteState,
  type PlanId,
} from "./adminPresent.js";

const DAY_WINDOW = 14;
const USER_LIMIT = 25;
const INVITE_LIMIT = 100;

const USER_FIELDS = ["id", "name", "email", "role", "plan", "emailVerified", "createdAt"] as const;

const FEATURE_LABEL: Record<EntitlementFeature, string> = {
  snapshot: "Personal Snapshot",
  tracking: "Tracking",
  recommendations: "Recommendations",
  insights: "Insights",
  patterns: "Patterns",
  wellness_plans: "Wellness plans",
  partner_support: "Partner support",
  partner_digest: "Partner digest",
  academy: "Men's Academy",
  advanced_reports: "Advanced reports",
  advanced_personalization: "Advanced personalization",
  advanced_partner_intelligence: "Advanced partner intelligence",
  multi_week_plans: "Multi-week plans",
  advanced_trends: "Advanced trends",
  priority_support: "Priority support",
  evidence_inspection: "Evidence inspection",
};

export interface AdminMetrics {
  members: number;
  snapshots: number;
  openAiFlags: number;
  acceptedPartnerConnections: number;
  /** Null until a measured duration is stored. */
  medianTtfv: null;
  signupsByDay: Array<{ day: string; count: number }>;
  membersByPlan: Array<{ plan: PlanId; count: number }>;
  invitesByState: Array<{ status: InviteState; count: number }>;
  /** Null when no flag rows exist, so the screen does not read as "no problems". */
  flagSeverity: { low: number; medium: number; high: number } | null;
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "member" | "partner" | "admin" | "developer";
  plan: "free" | "plus" | "premium";
  accountStatus: "confirmed" | "unconfirmed";
  hasSnapshot: boolean;
  partnerState: InviteState | "none";
  createdAt: string;
}

export interface AdminUserDetail extends AdminUserRow {
  consent: "on" | "off" | "unknown";
  supportTickets: number;
}

async function scalar(sql: string, replacements?: Record<string, unknown>): Promise<number> {
  const rows = await sequelize.query<{ count: number }>(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return asCount(rows[0]?.count);
}

export async function loadAdminMetrics(now = new Date()): Promise<AdminMetrics> {
  const start = utcWindowStart(DAY_WINDOW, now);
  const [members, snapshots, openAiFlags, acceptedPartnerConnections, signupRows, planRows, inviteRows, severityRows, flagTotal] =
    await Promise.all([
      scalar(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'member'`),
      scalar(`SELECT COUNT(*)::int AS count FROM personal_snapshots`),
      scalar(
        `SELECT COUNT(*)::int AS count FROM ai_flags WHERE review_status IN ('open', 'in_review')`,
      ),
      scalar(`SELECT COUNT(*)::int AS count FROM partner_invites WHERE status = 'accepted'`),
      sequelize.query<{ day: string; count: number }>(
        `SELECT to_char(timezone('UTC', created_at), 'YYYY-MM-DD') AS day,
                COUNT(*)::int AS count
         FROM users
         WHERE role = 'member' AND created_at >= :start
         GROUP BY 1`,
        { replacements: { start }, type: QueryTypes.SELECT },
      ),
      sequelize.query<{ plan: string; count: number }>(
        `SELECT plan, COUNT(*)::int AS count
         FROM users
         WHERE role = 'member'
         GROUP BY plan`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query<{ status: string; count: number }>(
        `SELECT status, COUNT(*)::int AS count FROM partner_invites GROUP BY status`,
        { type: QueryTypes.SELECT },
      ),
      sequelize.query<{ severity: string; count: number }>(
        `SELECT severity, COUNT(*)::int AS count FROM ai_flags GROUP BY severity`,
        { type: QueryTypes.SELECT },
      ),
      scalar(`SELECT COUNT(*)::int AS count FROM ai_flags`),
    ]);

  const severity = new Map(severityRows.map((row) => [row.severity, asCount(row.count)]));

  return {
    members,
    snapshots,
    openAiFlags,
    acceptedPartnerConnections,
    medianTtfv: null,
    signupsByDay: fillDayCounts(
      utcDayKeys(DAY_WINDOW, now),
      signupRows.map((row) => ({ day: row.day, count: asCount(row.count) })),
    ),
    membersByPlan: countsForPlans(
      planRows.map((row) => ({ plan: row.plan, count: asCount(row.count) })),
    ),
    invitesByState: countsForInvites(
      inviteRows.map((row) => ({ status: row.status, count: asCount(row.count) })),
    ),
    flagSeverity:
      flagTotal === 0
        ? null
        : {
            low: severity.get("low") ?? 0,
            medium: severity.get("medium") ?? 0,
            high: severity.get("high") ?? 0,
          },
  };
}

async function presentUsers(users: User[]): Promise<AdminUserRow[]> {
  if (users.length === 0) return [];
  const ids = users.map((user) => user.id);
  const [snapshots, invites] = await Promise.all([
    PersonalSnapshot.findAll({
      where: { userId: { [Op.in]: ids } },
      attributes: ["userId"],
    }),
    PartnerInvite.findAll({
      where: {
        [Op.or]: [{ memberUserId: { [Op.in]: ids } }, { partnerUserId: { [Op.in]: ids } }],
      },
      attributes: ["memberUserId", "partnerUserId", "status", "updatedAt"],
    }),
  ]);
  const withSnapshot = new Set(snapshots.map((row) => row.userId));
  const inviteRows = invites.map((invite) => ({
    memberUserId: invite.memberUserId,
    partnerUserId: invite.partnerUserId,
    status: invite.status,
    updatedAt: invite.updatedAt,
  }));

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    plan: user.plan,
    accountStatus: accountStatus(user.emailVerified),
    hasSnapshot: withSnapshot.has(user.id),
    partnerState: partnerStateForUser(user.id, inviteRows),
    createdAt: user.createdAt.toISOString(),
  }));
}

export async function searchAdminUsers(
  query: string,
  page: number,
): Promise<{ users: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const trimmed = query.trim();
  const where =
    trimmed.length === 0
      ? {}
      : {
          [Op.or]: [
            { name: { [Op.iLike]: likePattern(trimmed) } },
            { email: { [Op.iLike]: likePattern(trimmed) } },
          ],
        };

  const total = await User.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / USER_LIMIT));
  const safePage = Math.min(page, pageCount);
  const users = await User.findAll({
    where,
    attributes: [...USER_FIELDS],
    order: [["createdAt", "DESC"]],
    limit: USER_LIMIT,
    offset: (safePage - 1) * USER_LIMIT,
  });

  return {
    users: await presentUsers(users),
    total,
    page: safePage,
    pageSize: USER_LIMIT,
  };
}

export async function loadAdminUser(userId: string): Promise<AdminUserDetail | null> {
  const user = await User.findByPk(userId, { attributes: [...USER_FIELDS] });
  if (!user) return null;
  const [row] = await presentUsers([user]);
  const [profile, supportTickets] = await Promise.all([
    OnboardingProfile.findOne({
      where: { userId },
      attributes: ["partnerConsent"],
    }),
    SupportRequest.count({ where: { userId } }),
  ]);
  return {
    ...row,
    consent: profile ? (profile.partnerConsent ? "on" : "off") : "unknown",
    supportTickets,
  };
}

export interface AdminPartnerRow {
  id: string;
  memberFirstName: string;
  partnerEmail: string;
  status: InviteState;
  scopes: string[];
  createdAt: string;
}

export async function loadAdminPartners(): Promise<{
  invitesByState: Array<{ status: InviteState; count: number }>;
  invites: AdminPartnerRow[];
}> {
  const [inviteRows, invites] = await Promise.all([
    sequelize.query<{ status: string; count: number }>(
      `SELECT status, COUNT(*)::int AS count FROM partner_invites GROUP BY status`,
      { type: QueryTypes.SELECT },
    ),
    PartnerInvite.findAll({
      attributes: ["id", "partnerEmail", "status", "scopes", "createdAt"],
      include: [{ model: User, as: "member", attributes: ["name"] }],
      order: [["createdAt", "DESC"]],
      limit: INVITE_LIMIT,
    }),
  ]);

  return {
    invitesByState: countsForInvites(
      inviteRows.map((row) => ({ status: row.status, count: asCount(row.count) })),
    ),
    invites: invites.flatMap((invite) => {
      const status = invite.status;
      if (
        status !== "sent" &&
        status !== "accepted" &&
        status !== "declined" &&
        status !== "revoked"
      ) {
        return [];
      }
      const member = invite.get("member") as { name?: string } | undefined;
      return [
        {
          id: invite.id,
          memberFirstName: firstName(member?.name ?? ""),
          partnerEmail: invite.partnerEmail,
          status,
          scopes: scopeList(invite.scopes),
          createdAt: invite.createdAt.toISOString(),
        },
      ];
    }),
  };
}

export interface AdminPlanCard {
  id: PlanId;
  label: string;
  summary: string;
  memberCount: number;
  included: string[];
}

export async function loadAdminPlans(): Promise<{ billingConnected: false; plans: AdminPlanCard[] }> {
  const planRows = await sequelize.query<{ plan: string; count: number }>(
    `SELECT plan, COUNT(*)::int AS count FROM users WHERE role = 'member' GROUP BY plan`,
    { type: QueryTypes.SELECT },
  );
  const counts = countsForPlans(planRows.map((row) => ({ plan: row.plan, count: asCount(row.count) })));
  const countByPlan = new Map(counts.map((row) => [row.plan, row.count]));

  return {
    billingConnected: false,
    plans: planSummaries.map((plan) => {
      const entitlement = ENTITLEMENTS[plan.id];
      const included = (Object.keys(entitlement.features) as EntitlementFeature[])
        .filter((feature) => entitlement.features[feature])
        .map((feature) => FEATURE_LABEL[feature]);
      return {
        id: plan.id,
        label: plan.label,
        summary: plan.summary,
        memberCount: countByPlan.get(plan.id) ?? 0,
        included,
      };
    }),
  };
}
