import { Op, QueryTypes, type WhereOptions } from "sequelize";
import { sequelize } from "../../config/db.js";
import { ENTITLEMENTS, type EntitlementFeature } from "../../config/entitlements.js";
import { isStripeConfigured } from "../../config/stripe.js";
import { APPROVED_EVIDENCE } from "../../ai/evidence/approvedEvidence.js";
import {
  AiAuditLog,
  OnboardingProfile,
  PartnerAuditLog,
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
  formatDuration,
  likePattern,
  medianSeconds,
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
  /** Middle time from account creation to the saved snapshot. Null when nobody has one. */
  medianTtfv: string | null;
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

export type SubscriptionStatusFilter = "none" | "active" | "trialing" | "past_due" | "canceled" | "other";

export interface AdminUserDetail extends AdminUserRow {
  consent: "on" | "off" | "unknown";
  supportTickets: number;
  audit: AdminAuditLine[];
  subscriptionStatus: SubscriptionStatusFilter;
  hasStripeCustomer: boolean;
}

function normalizeSubscriptionStatus(value: string | null | undefined): SubscriptionStatusFilter {
  const status = (value ?? "").trim().toLowerCase();
  if (!status) return "none";
  if (status === "active" || status === "trialing" || status === "past_due" || status === "canceled") {
    return status;
  }
  return "other";
}

async function scalar(sql: string, replacements?: Record<string, unknown>): Promise<number> {
  const rows = await sequelize.query<{ count: number }>(sql, {
    replacements,
    type: QueryTypes.SELECT,
  });
  return asCount(rows[0]?.count);
}

export async function loadAdminMetrics(now = new Date(), days = DAY_WINDOW): Promise<AdminMetrics> {
  const windowDays = days === 30 ? 30 : DAY_WINDOW;
  const start = utcWindowStart(windowDays, now);
  const [members, snapshots, openAiFlags, acceptedPartnerConnections, signupRows, planRows, inviteRows, severityRows, flagTotal, durationRows] =
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
      sequelize.query<{ seconds: number }>(
        `SELECT EXTRACT(EPOCH FROM (s.created_at - u.created_at)) AS seconds
         FROM personal_snapshots s
         INNER JOIN users u ON u.id = s.user_id
         WHERE u.role = 'member' AND s.created_at >= u.created_at`,
        { type: QueryTypes.SELECT },
      ),
    ]);

  const severity = new Map(severityRows.map((row) => [row.severity, asCount(row.count)]));
  const median = medianSeconds(durationRows.map((row) => Number(row.seconds)));

  return {
    members,
    snapshots,
    openAiFlags,
    acceptedPartnerConnections,
    medianTtfv: median === null ? null : formatDuration(median),
    signupsByDay: fillDayCounts(
      utcDayKeys(windowDays, now),
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

export interface AdminAuditLine {
  source: "ai" | "partner";
  label: string;
  result: string;
  createdAt: string;
}

const ACCOUNT_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function searchAdminUsers(
  query: string,
  page: number,
  filters: {
    plan?: "free" | "plus" | "premium";
    role?: User["role"];
    account?: "confirmed" | "unconfirmed";
    subscription?: SubscriptionStatusFilter;
  } = {},
): Promise<{ users: AdminUserRow[]; total: number; page: number; pageSize: number }> {
  const trimmed = query.trim();
  const matches: WhereOptions[] = [
    { name: { [Op.iLike]: likePattern(trimmed) } },
    { email: { [Op.iLike]: likePattern(trimmed) } },
  ];
  if (ACCOUNT_UUID.test(trimmed)) matches.push({ id: trimmed });
  const subscriptionWhere =
    filters.subscription === "none"
      ? { [Op.or]: [{ subscriptionStatus: null }, { subscriptionStatus: "" }] }
      : filters.subscription === "other"
        ? {
            subscriptionStatus: {
              [Op.and]: [
                { [Op.ne]: null },
                { [Op.ne]: "" },
                { [Op.notIn]: ["active", "trialing", "past_due", "canceled"] },
              ],
            },
          }
        : filters.subscription
          ? { subscriptionStatus: filters.subscription }
          : {};
  const where: WhereOptions = {
    ...(filters.plan ? { plan: filters.plan } : {}),
    ...(filters.role ? { role: filters.role } : {}),
    ...(filters.account ? { emailVerified: filters.account === "confirmed" } : {}),
    ...subscriptionWhere,
    ...(trimmed.length > 0 ? { [Op.or]: matches } : {}),
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
  const user = await User.findByPk(userId, {
    attributes: [...USER_FIELDS, "subscriptionStatus", "stripeCustomerId"],
  });
  if (!user) return null;
  const [row] = await presentUsers([user]);
  const [profile, supportTickets, aiEvents, partnerEvents] = await Promise.all([
    OnboardingProfile.findOne({
      where: { userId },
      attributes: ["partnerConsent"],
    }),
    SupportRequest.count({ where: { userId } }),
    AiAuditLog.findAll({
      where: { userId },
      attributes: ["feature", "resultStatus", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 5,
    }),
    PartnerAuditLog.findAll({
      where: { [Op.or]: [{ partnerUserId: userId }, { memberUserId: userId }] },
      attributes: ["action", "result", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 5,
    }),
  ]);
  const audit: AdminAuditLine[] = [
    ...aiEvents.map((event) => ({
      source: "ai" as const,
      label: event.feature,
      result: event.resultStatus,
      createdAt: event.createdAt.toISOString(),
    })),
    ...partnerEvents.map((event) => ({
      source: "partner" as const,
      label: event.action,
      result: event.result,
      createdAt: event.createdAt.toISOString(),
    })),
  ]
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 8);
  return {
    ...row,
    consent: profile ? (profile.partnerConsent ? "on" : "off") : "unknown",
    supportTickets,
    audit,
    subscriptionStatus: normalizeSubscriptionStatus(user.subscriptionStatus),
    hasStripeCustomer: Boolean(user.stripeCustomerId?.trim()),
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

export interface AdminPartnerActivity {
  id: string;
  action: string;
  result: string;
  memberFirstName: string;
  createdAt: string;
}

export interface AdminPartnerSupportNote {
  id: string;
  userId: string;
  memberFirstName: string;
  topic: string;
  message: string;
  createdAt: string;
}

export async function loadAdminPartners(): Promise<{
  invitesByState: Array<{ status: InviteState; count: number }>;
  invites: AdminPartnerRow[];
  activity: AdminPartnerActivity[];
  supportNotes: AdminPartnerSupportNote[];
}> {
  const [inviteRows, invites, activityRows] = await Promise.all([
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
    PartnerAuditLog.findAll({
      attributes: ["id", "action", "result", "memberUserId", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: 20,
    }),
  ]);

  const memberIds = [
    ...new Set(
      activityRows.flatMap((row) => (row.memberUserId ? [row.memberUserId] : [])),
    ),
  ];
  const members =
    memberIds.length === 0
      ? []
      : await User.findAll({
          where: { id: { [Op.in]: memberIds } },
          attributes: ["id", "name"],
        });
  const nameById = new Map(members.map((member) => [member.id, firstName(member.name)]));

  const supportRows = await sequelize.query<{
    id: string;
    user_id: string;
    name: string;
    topic: string;
    message: string;
    created_at: Date;
  }>(
    `SELECT sr.id, sr.user_id, u.name, sr.topic, sr.message, sr.created_at
     FROM support_requests sr
     INNER JOIN users u ON u.id = sr.user_id
     WHERE sr.user_id IN (
       SELECT member_user_id FROM partner_invites
       UNION
       SELECT partner_user_id FROM partner_invites WHERE partner_user_id IS NOT NULL
     )
     ORDER BY sr.created_at DESC
     LIMIT 20`,
    { type: QueryTypes.SELECT },
  );

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
    activity: activityRows.map((row) => ({
      id: row.id,
      action: row.action,
      result: row.result,
      memberFirstName: nameById.get(row.memberUserId ?? "") ?? "Member",
      createdAt: row.createdAt.toISOString(),
    })),
    supportNotes: supportRows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      memberFirstName: firstName(row.name),
      topic: row.topic,
      message: row.message,
      createdAt: new Date(row.created_at).toISOString(),
    })),
  };
}

export interface AdminPlanCard {
  id: PlanId;
  label: string;
  summary: string;
  memberCount: number;
  included: string[];
}

export interface SubscriptionStatusCount {
  status: SubscriptionStatusFilter;
  count: number;
}

export async function loadAdminPlans(): Promise<{
  billingConnected: boolean;
  plans: AdminPlanCard[];
  subscriptionByStatus: SubscriptionStatusCount[];
  stripeCustomers: number;
  pastDue: number;
}> {
  const [planRows, statusRows, stripeCustomers] = await Promise.all([
    sequelize.query<{ plan: string; count: number }>(
      `SELECT plan, COUNT(*)::int AS count FROM users WHERE role = 'member' GROUP BY plan`,
      { type: QueryTypes.SELECT },
    ),
    sequelize.query<{ status: string | null; count: number }>(
      `SELECT subscription_status AS status, COUNT(*)::int AS count
       FROM users
       WHERE role = 'member'
       GROUP BY subscription_status`,
      { type: QueryTypes.SELECT },
    ),
    scalar(
      `SELECT COUNT(*)::int AS count
       FROM users
       WHERE role = 'member'
         AND stripe_customer_id IS NOT NULL
         AND btrim(stripe_customer_id) <> ''`,
    ),
  ]);
  const counts = countsForPlans(planRows.map((row) => ({ plan: row.plan, count: asCount(row.count) })));
  const countByPlan = new Map(counts.map((row) => [row.plan, row.count]));

  const byStatus: Record<SubscriptionStatusFilter, number> = {
    none: 0,
    active: 0,
    trialing: 0,
    past_due: 0,
    canceled: 0,
    other: 0,
  };
  for (const row of statusRows) {
    const key = normalizeSubscriptionStatus(row.status);
    byStatus[key] += asCount(row.count);
  }

  return {
    billingConnected: isStripeConfigured(),
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
    subscriptionByStatus: (Object.keys(byStatus) as SubscriptionStatusFilter[]).map((status) => ({
      status,
      count: byStatus[status],
    })),
    stripeCustomers,
    pastDue: byStatus.past_due,
  };
}

const LIST_PAGE = 25;
const AUDIT_RESULTS = ["approved", "approved_with_repairs", "fallback", "blocked"] as const;

export interface AdminAuditRow {
  id: string;
  source: "ai" | "partner";
  label: string;
  result: string;
  detail: string;
  memberFirstName: string;
  createdAt: string;
}

export async function loadAdminAudit(
  page: number,
  now = new Date(),
): Promise<{
  rows: AdminAuditRow[];
  total: number;
  page: number;
  pageSize: number;
  resultsByStatus: Array<{ status: (typeof AUDIT_RESULTS)[number]; count: number }>;
}> {
  const [aiTotal, partnerTotal] = await Promise.all([
    AiAuditLog.count(),
    PartnerAuditLog.count(),
  ]);
  const total = aiTotal + partnerTotal;
  const pageCount = Math.max(1, Math.ceil(total / LIST_PAGE));
  const safePage = Math.min(page, pageCount);
  const take = safePage * LIST_PAGE;

  const [aiRows, partnerRows, resultRows] = await Promise.all([
    AiAuditLog.findAll({
      attributes: ["id", "feature", "resultStatus", "safetyStatus", "citationIds", "userId", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: take,
    }),
    PartnerAuditLog.findAll({
      attributes: ["id", "action", "result", "topicAsked", "memberUserId", "createdAt"],
      order: [["createdAt", "DESC"]],
      limit: take,
    }),
    sequelize.query<{ result_status: string; count: number }>(
      `SELECT result_status, COUNT(*)::int AS count
       FROM ai_audit_logs
       WHERE created_at >= :start
       GROUP BY result_status`,
      { replacements: { start: utcWindowStart(DAY_WINDOW, now) }, type: QueryTypes.SELECT },
    ),
  ]);

  const memberIds = [
    ...new Set([
      ...aiRows.map((row) => row.userId),
      ...partnerRows.flatMap((row) => (row.memberUserId ? [row.memberUserId] : [])),
    ]),
  ];
  const members =
    memberIds.length === 0
      ? []
      : await User.findAll({
          where: { id: { [Op.in]: memberIds } },
          attributes: ["id", "name"],
        });
  const nameById = new Map(members.map((member) => [member.id, firstName(member.name)]));

  const merged: AdminAuditRow[] = [
    ...aiRows.map((row) => ({
      id: `ai-${row.id}`,
      source: "ai" as const,
      label: row.feature,
      result: row.resultStatus,
      detail: (row.citationIds ?? []).length > 0 ? (row.citationIds ?? []).join(", ") : row.safetyStatus,
      memberFirstName: nameById.get(row.userId) ?? "Member",
      createdAt: row.createdAt.toISOString(),
    })),
    ...partnerRows.map((row) => ({
      id: `partner-${row.id}`,
      source: "partner" as const,
      label: row.action,
      result: row.result,
      detail: row.topicAsked ?? "No topic recorded",
      memberFirstName: nameById.get(row.memberUserId ?? "") ?? "Member",
      createdAt: row.createdAt.toISOString(),
    })),
  ].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  const counts = new Map(resultRows.map((row) => [row.result_status, asCount(row.count)]));

  return {
    rows: merged.slice((safePage - 1) * LIST_PAGE, safePage * LIST_PAGE),
    total,
    page: safePage,
    pageSize: LIST_PAGE,
    resultsByStatus: AUDIT_RESULTS.map((status) => ({
      status,
      count: counts.get(status) ?? 0,
    })),
  };
}

export interface AdminSupportRow {
  id: string;
  memberFirstName: string;
  topic: string;
  message: string;
  createdAt: string;
}

export async function loadAdminSupport(
  page: number,
  userId?: string,
): Promise<{ rows: AdminSupportRow[]; total: number; page: number; pageSize: number }> {
  const where = userId ? { userId } : {};
  const total = await SupportRequest.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / LIST_PAGE));
  const safePage = Math.min(page, pageCount);
  const rows = await SupportRequest.findAll({
    where,
    attributes: ["id", "topic", "message", "createdAt"],
    include: [{ model: User, as: "user", attributes: ["name"] }],
    order: [["createdAt", "DESC"]],
    limit: LIST_PAGE,
    offset: (safePage - 1) * LIST_PAGE,
  });

  return {
    rows: rows.map((row) => {
      const member = row.get("user") as { name?: string } | undefined;
      return {
        id: row.id,
        memberFirstName: firstName(member?.name ?? ""),
        topic: row.topic,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
      };
    }),
    total,
    page: safePage,
    pageSize: LIST_PAGE,
  };
}

export interface AdminEvidenceRow {
  evidenceId: string;
  citationId: string;
  sourceName: string;
  publisher: string;
  sourceCategory: string;
  publicationDate: string;
  status: string;
  version: string;
  clinicianReview: "pending" | "signed";
}

export function searchAdminEvidence(query: string): AdminEvidenceRow[] {
  const needle = query.trim().toLowerCase();
  return APPROVED_EVIDENCE.filter((record) => {
    if (needle.length === 0) return true;
    const haystack = [
      record.sourceName,
      record.publisher,
      record.title,
      record.citationId,
      record.evidenceId,
      record.sourceCategory,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(needle);
  }).map((record) => ({
    evidenceId: record.evidenceId,
    citationId: record.citationId,
    sourceName: record.sourceName,
    publisher: record.publisher,
    sourceCategory: record.sourceCategory,
    publicationDate: record.publicationDate,
    status: record.status,
    version: record.version,
    clinicianReview: record.clinicianReview,
  }));
}
