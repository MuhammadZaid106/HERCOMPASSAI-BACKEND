import { Op } from "sequelize";
import {
  BillingEvent,
  GrandfatheredPlan,
  User,
} from "../../models/index.js";
import { firstName } from "./adminPresent.js";

export async function loadBillingDesk(): Promise<{
  recentEvents: Array<{
    id: string;
    type: string;
    status: string;
    plan: string | null;
    amountCents: number | null;
    currency: string | null;
    summary: string;
    memberFirstName: string;
    occurredAt: string;
  }>;
  failedPayments: Array<{
    id: string;
    summary: string;
    memberFirstName: string;
    occurredAt: string;
    status: string;
  }>;
  trials: Array<{
    userId: string;
    memberFirstName: string;
    email: string;
    plan: string;
    trialEndsAt: string | null;
  }>;
  grandfathered: Array<{
    id: string;
    userId: string;
    memberFirstName: string;
    email: string;
    label: string;
    note: string;
  }>;
  promotionsNote: string;
}> {
  const [events, failed, trialUsers, grandfatheredRows] = await Promise.all([
    BillingEvent.findAll({ order: [["occurredAt", "DESC"]], limit: 40 }),
    BillingEvent.findAll({
      where: { status: { [Op.in]: ["failed", "past_due"] } },
      order: [["occurredAt", "DESC"]],
      limit: 40,
    }),
    User.findAll({
      where: { role: "member", subscriptionStatus: "trialing" },
      attributes: ["id", "name", "email", "plan", "trialEndsAt"],
      order: [["updatedAt", "DESC"]],
      limit: 40,
    }),
    GrandfatheredPlan.findAll({ order: [["updatedAt", "DESC"]], limit: 40 }),
  ]);

  const userIds = [
    ...new Set([
      ...events.map((row) => row.userId).filter(Boolean),
      ...failed.map((row) => row.userId).filter(Boolean),
      ...grandfatheredRows.map((row) => row.userId),
    ]),
  ] as string[];
  const users =
    userIds.length === 0
      ? []
      : await User.findAll({ where: { id: userIds }, attributes: ["id", "name", "email"] });
  const byId = new Map(users.map((user) => [user.id, user]));

  return {
    recentEvents: events.map((row) => ({
      id: row.id,
      type: row.type,
      status: row.status,
      plan: row.plan,
      amountCents: row.amountCents,
      currency: row.currency,
      summary: row.summary,
      memberFirstName: row.userId ? firstName(byId.get(row.userId)?.name ?? "Member") : "Unknown",
      occurredAt: row.occurredAt.toISOString(),
    })),
    failedPayments: failed.map((row) => ({
      id: row.id,
      summary: row.summary,
      memberFirstName: row.userId ? firstName(byId.get(row.userId)?.name ?? "Member") : "Unknown",
      occurredAt: row.occurredAt.toISOString(),
      status: row.status,
    })),
    trials: trialUsers.map((user) => ({
      userId: user.id,
      memberFirstName: firstName(user.name),
      email: user.email,
      plan: user.plan,
      trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
    })),
    grandfathered: grandfatheredRows.map((row) => {
      const user = byId.get(row.userId);
      return {
        id: row.id,
        userId: row.userId,
        memberFirstName: firstName(user?.name ?? "Member"),
        email: user?.email ?? "",
        label: row.label,
        note: row.note,
      };
    }),
    promotionsNote:
      "Checkout already accepts Stripe promotion codes. Create and manage coupons in the Stripe Dashboard — this desk does not edit coupon codes.",
  };
}

export async function upsertGrandfathered(
  userId: string,
  label: string,
  note: string,
  staffUserId: string,
): Promise<{ id: string }> {
  const user = await User.findByPk(userId, { attributes: ["id"] });
  if (!user) throw new Error("USER_NOT_FOUND");
  const [row] = await GrandfatheredPlan.upsert({
    userId,
    label: label.slice(0, 80),
    note: note.slice(0, 280),
    staffUserId,
  });
  return { id: row.id };
}
