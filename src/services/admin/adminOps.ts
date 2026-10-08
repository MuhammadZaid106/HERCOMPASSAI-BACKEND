import { Op, QueryTypes, col, fn, where } from "sequelize";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { sequelize } from "../../config/db.js";
import { env } from "../../config/env.js";
import { APPROVED_EVIDENCE } from "../../ai/evidence/approvedEvidence.js";
import { getProviderHealth } from "../../ai/providers/index.js";
import { clinicianReviewSummary } from "../ai-gateway/evidenceService.js";
import { mailIsConfigured } from "../mail/sendMail.js";
import {
  AppSetting,
  BetaCohort,
  BetaMember,
  ContentPiece,
  EvidenceStatus,
  PersonalSnapshot,
  ProductFeedback,
  SupportRequest,
  User,
} from "../../models/index.js";
import type { ContentKind, ContentStatus } from "../../models/ContentPiece.js";
import { contentWriteSchema } from "../member/publishedLibrary.js";
import { firstName, formatDuration, medianSeconds } from "./adminPresent.js";

export const FOUNDING_CAP_KEY = "founding_women_cap";
const FOUNDING_SLUG = "founding-women";

export const PRODUCT_THEMES = [
  "value",
  "friction",
  "trust",
  "ai_quality",
  "safety",
  "partner",
  "workplace",
  "retention",
  "missing",
  "payment",
] as const;

async function foundingCap(): Promise<number> {
  const row = await AppSetting.findByPk(FOUNDING_CAP_KEY);
  const parsed = Number(row?.value);
  if (!Number.isInteger(parsed) || parsed < 1) return 100;
  return parsed;
}

export async function loadAdminSettings(): Promise<{
  foundingCap: number;
  billingConnected: false;
  mailConfigured: boolean;
}> {
  return {
    foundingCap: await foundingCap(),
    billingConnected: false,
    mailConfigured: mailIsConfigured(),
  };
}

export async function saveFoundingCap(cap: number): Promise<number> {
  await AppSetting.upsert({ key: FOUNDING_CAP_KEY, value: String(cap) });
  return cap;
}

export interface BetaMemberRow {
  id: string;
  cohortId: string;
  cohortName: string;
  email: string;
  stage: "invited" | "screened";
  enrolled: boolean;
  activated: boolean;
  hasSnapshot: boolean;
}

export interface BetaCohortCard {
  id: string;
  name: string;
  slug: string;
  invited: number;
  screened: number;
  enrolled: number;
  activated: number;
  snapshot: number;
  medianTtfv: string | null;
}

async function linkBetaAccounts(members: BetaMember[]): Promise<void> {
  const waiting = members.filter((member) => !member.userId);
  if (waiting.length === 0) return;
  const users = await User.findAll({
    where: where(fn("lower", col("email")), { [Op.in]: waiting.map((member) => member.email) }),
    attributes: ["id", "email"],
  });
  const byEmail = new Map(users.map((user) => [user.email.toLowerCase(), user.id]));
  await Promise.all(
    waiting.flatMap((member) => {
      const userId = byEmail.get(member.email);
      if (!userId) return [];
      member.userId = userId;
      return [member.save()];
    }),
  );
}

export async function loadAdminBeta(cohortSlug?: string): Promise<{
  cap: number;
  cohorts: BetaCohortCard[];
  members: BetaMemberRow[];
}> {
  const cohorts = await BetaCohort.findAll({ order: [["name", "ASC"]] });
  const members = await BetaMember.findAll({ order: [["createdAt", "DESC"]] });
  await linkBetaAccounts(members);

  const userIds = members.flatMap((member) => (member.userId ? [member.userId] : []));
  const [accounts, snapshots] = await Promise.all([
    userIds.length === 0
      ? []
      : User.findAll({
          where: { id: { [Op.in]: userIds } },
          attributes: ["id", "emailVerified", "createdAt"],
        }),
    userIds.length === 0
      ? []
      : PersonalSnapshot.findAll({
          where: { userId: { [Op.in]: userIds } },
          attributes: ["userId", "createdAt"],
        }),
  ]);
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const snapshotByUser = new Map(snapshots.map((row) => [row.userId, row.createdAt]));
  const cohortById = new Map(cohorts.map((cohort) => [cohort.id, cohort]));

  const rows: BetaMemberRow[] = members.map((member) => {
    const account = member.userId ? accountById.get(member.userId) : undefined;
    return {
      id: member.id,
      cohortId: member.cohortId,
      cohortName: cohortById.get(member.cohortId)?.name ?? "Cohort",
      email: member.email,
      stage: member.stage === "screened" ? "screened" : "invited",
      enrolled: Boolean(member.userId),
      activated: Boolean(account?.emailVerified),
      hasSnapshot: member.userId ? snapshotByUser.has(member.userId) : false,
    };
  });

  const cards = cohorts.map((cohort) => {
    const group = rows.filter((row) => row.cohortId === cohort.id);
    const seconds = members.flatMap((member) => {
      if (member.cohortId !== cohort.id || !member.userId) return [];
      const account = accountById.get(member.userId);
      const snapshotAt = snapshotByUser.get(member.userId);
      if (!account || !snapshotAt) return [];
      return [(snapshotAt.getTime() - account.createdAt.getTime()) / 1000];
    });
    const median = medianSeconds(seconds);
    return {
      id: cohort.id,
      name: cohort.name,
      slug: cohort.slug,
      invited: group.length,
      screened: group.filter((row) => row.stage === "screened").length,
      enrolled: group.filter((row) => row.enrolled).length,
      activated: group.filter((row) => row.activated).length,
      snapshot: group.filter((row) => row.hasSnapshot).length,
      medianTtfv: median === null ? null : formatDuration(median),
    };
  });

  const selected = cohortSlug ? cohorts.find((cohort) => cohort.slug === cohortSlug) : undefined;
  return {
    cap: await foundingCap(),
    cohorts: cards,
    members: selected ? rows.filter((row) => row.cohortId === selected.id) : rows,
  };
}

export async function addBetaMember(cohortId: string, email: string): Promise<"added" | "missing" | "duplicate" | "full"> {
  const cohort = await BetaCohort.findByPk(cohortId);
  if (!cohort) return "missing";
  const existing = await BetaMember.findOne({ where: { cohortId, email } });
  if (existing) return "duplicate";
  if (cohort.slug === FOUNDING_SLUG) {
    const count = await BetaMember.count({ where: { cohortId } });
    if (count >= (await foundingCap())) return "full";
  }
  const account = await User.findOne({
    where: where(fn("lower", col("email")), email),
    attributes: ["id"],
  });
  await BetaMember.create({
    cohortId,
    email,
    userId: account?.id ?? null,
    stage: "invited",
  });
  return "added";
}

export async function setBetaStage(memberId: string, stage: "invited" | "screened"): Promise<boolean> {
  const member = await BetaMember.findByPk(memberId);
  if (!member) return false;
  member.stage = stage;
  await member.save();
  return true;
}

const contentPatch = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["draft", "in_review", "published", "archived"]).optional(),
  body: z.record(z.string(), z.unknown()).optional(),
});

export interface AdminContentRow {
  id: string;
  kind: ContentKind;
  slug: string;
  title: string;
  status: ContentStatus;
  body: Record<string, unknown>;
  updatedAt: string;
}

function contentRow(piece: ContentPiece): AdminContentRow {
  return {
    id: piece.id,
    kind: piece.kind,
    slug: piece.slug,
    title: piece.title,
    status: piece.status,
    body: piece.body,
    updatedAt: piece.updatedAt.toISOString(),
  };
}

export async function loadAdminContent(kind?: ContentKind): Promise<AdminContentRow[]> {
  const rows = await ContentPiece.findAll({
    where: kind ? { kind } : {},
    order: [["updatedAt", "DESC"]],
    limit: 100,
  });
  return rows.map(contentRow);
}

export async function createAdminContent(
  input: z.infer<typeof contentWriteSchema>,
): Promise<AdminContentRow | "duplicate"> {
  const existing = await ContentPiece.findOne({ where: { kind: input.kind, slug: input.slug } });
  if (existing) return "duplicate";
  const piece = await ContentPiece.create({
    kind: input.kind,
    slug: input.slug,
    title: input.title,
    body: input.body,
    status: "draft",
  });
  return contentRow(piece);
}

export async function updateAdminContent(
  id: string,
  patch: unknown,
): Promise<AdminContentRow | "missing" | "invalid"> {
  const piece = await ContentPiece.findByPk(id);
  if (!piece) return "missing";
  const parsed = contentPatch.safeParse(patch);
  if (!parsed.success) return "invalid";
  const nextBody = parsed.data.body ?? piece.body;
  const checked = contentWriteSchema.safeParse({
    kind: piece.kind,
    title: parsed.data.title ?? piece.title,
    slug: piece.slug,
    body: nextBody,
  });
  if (!checked.success) return "invalid";
  piece.title = checked.data.title;
  piece.body = checked.data.body;
  if (parsed.data.status) piece.status = parsed.data.status;
  await piece.save();
  return contentRow(piece);
}

export interface ProductNoteRow {
  id: string;
  memberFirstName: string;
  topic: string;
  message: string;
  createdAt: string;
  cohortName: string | null;
  theme: string | null;
  severity: "low" | "medium" | "high" | null;
  decision: "open" | "accepted" | "parked" | null;
  resolution: string;
}

export async function loadProductNotes(page: number): Promise<{
  notes: ProductNoteRow[];
  total: number;
  page: number;
  pageSize: number;
}> {
  const pageSize = 25;
  const total = await SupportRequest.count();
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount);
  const requests = await SupportRequest.findAll({
    attributes: ["id", "userId", "topic", "message", "createdAt"],
    include: [{ model: User, as: "user", attributes: ["name"] }],
    order: [["createdAt", "DESC"]],
    limit: pageSize,
    offset: (safePage - 1) * pageSize,
  });
  const requestIds = requests.map((row) => row.id);
  const userIds = requests.map((row) => row.userId);
  const [reviews, memberships] = await Promise.all([
    requestIds.length === 0
      ? []
      : ProductFeedback.findAll({ where: { supportRequestId: { [Op.in]: requestIds } } }),
    userIds.length === 0
      ? []
      : BetaMember.findAll({
          where: { userId: { [Op.in]: userIds } },
          include: [{ model: BetaCohort, as: "cohort", attributes: ["name"] }],
        }),
  ]);
  const reviewByRequest = new Map(reviews.map((row) => [row.supportRequestId, row]));
  const cohortByUser = new Map(
    memberships.map((row) => {
      const cohort = row.get("cohort") as { name?: string } | undefined;
      return [row.userId, cohort?.name ?? null] as const;
    }),
  );

  return {
    total,
    page: safePage,
    pageSize,
    notes: requests.map((row) => {
      const member = row.get("user") as { name?: string } | undefined;
      const review = reviewByRequest.get(row.id);
      return {
        id: row.id,
        memberFirstName: firstName(member?.name ?? ""),
        topic: row.topic,
        message: row.message,
        createdAt: row.createdAt.toISOString(),
        cohortName: cohortByUser.get(row.userId) ?? null,
        theme: review?.theme ?? null,
        severity: review?.severity ?? null,
        decision: review?.decision ?? null,
        resolution: review?.resolution ?? "",
      };
    }),
  };
}

export async function saveProductNote(
  supportRequestId: string,
  ownerUserId: string,
  input: {
    theme: (typeof PRODUCT_THEMES)[number];
    severity: "low" | "medium" | "high";
    decision: "open" | "accepted" | "parked";
    resolution: string;
  },
): Promise<boolean> {
  const request = await SupportRequest.findByPk(supportRequestId);
  if (!request) return false;
  const existing = await ProductFeedback.findOne({ where: { supportRequestId } });
  if (existing) {
    existing.theme = input.theme;
    existing.severity = input.severity;
    existing.decision = input.decision;
    existing.resolution = input.resolution;
    existing.ownerUserId = ownerUserId;
    await existing.save();
    return true;
  }
  await ProductFeedback.create({
    supportRequestId,
    theme: input.theme,
    severity: input.severity,
    decision: input.decision,
    resolution: input.resolution,
    ownerUserId,
  });
  return true;
}

export async function setEvidenceRetired(
  evidenceId: string,
  status: "active" | "retired",
  staffUserId: string,
  note: string,
): Promise<boolean> {
  const known = APPROVED_EVIDENCE.some((record) => record.evidenceId === evidenceId);
  if (!known) return false;
  await EvidenceStatus.upsert({
    evidenceId,
    status,
    note,
    staffUserId,
    updatedAt: new Date(),
  });
  return true;
}

export interface SystemCheck {
  id: string;
  label: string;
  status: "ready" | "attention" | "not_connected" | "unchecked";
  detail: string;
}

export async function loadAdminSystem(probeGateway: boolean): Promise<SystemCheck[]> {
  const checks: SystemCheck[] = [];

  try {
    await sequelize.query("SELECT 1", { type: QueryTypes.SELECT });
    checks.push({ id: "database", label: "Database", status: "ready", detail: "The database answered." });
  } catch {
    checks.push({ id: "database", label: "Database", status: "attention", detail: "The database did not answer." });
  }

  if (!probeGateway) {
    checks.push({
      id: "gateway",
      label: "AI Gateway",
      status: "unchecked",
      detail: "Open System health for a live probe.",
    });
  } else {
    try {
      const providers = await getProviderHealth();
      const summary = providers.map((provider) => `${provider.provider}: ${provider.status}`).join(", ");
      const ready = providers.length > 0 && providers.every((provider) => provider.status === "healthy");
      checks.push({
        id: "gateway",
        label: "AI Gateway",
        status: ready ? "ready" : "attention",
        detail: summary || "No engines are registered.",
      });
    } catch {
      checks.push({
        id: "gateway",
        label: "AI Gateway",
        status: "attention",
        detail: "The gateway probe did not finish.",
      });
    }
  }

  const review = clinicianReviewSummary();
  checks.push({
    id: "evidence",
    label: "Evidence Service",
    status: review.fullyClinicianReviewed ? "ready" : "attention",
    detail: review.fullyClinicianReviewed
      ? `Catalog loaded. ${review.citable} sources are citable.`
      : "Catalog loaded. Clinician review is still pending a named reviewer.",
  });

  try {
    const token = jwt.sign({ probe: "admin-system" }, env.JWT_SECRET, { expiresIn: "1m" });
    jwt.verify(token, env.JWT_SECRET);
    checks.push({ id: "auth", label: "Authentication", status: "ready", detail: "Sign-in keys are ready." });
  } catch {
    checks.push({ id: "auth", label: "Authentication", status: "attention", detail: "Sign-in keys are not ready." });
  }

  try {
    await User.count();
    checks.push({ id: "analytics", label: "Analytics", status: "ready", detail: "Member counts can be read." });
  } catch {
    checks.push({ id: "analytics", label: "Analytics", status: "attention", detail: "Member counts could not be read." });
  }

  checks.push({
    id: "notifications",
    label: "Notifications",
    status: mailIsConfigured() ? "ready" : "attention",
    detail: mailIsConfigured() ? "Mail is configured." : "Mail is not configured.",
  });

  checks.push({
    id: "billing",
    label: "Billing",
    status: "not_connected",
    detail: "Billing is not connected.",
  });

  return checks;
}

export { contentWriteSchema };
