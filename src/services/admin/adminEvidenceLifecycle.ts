import { APPROVED_EVIDENCE } from "../../ai/evidence/approvedEvidence.js";
import {
  EvidenceStatus,
  EvidenceSubmission,
} from "../../models/index.js";
import type { EvidenceLifecycleStatus } from "../../models/EvidenceSubmission.js";

const LIFECYCLE: EvidenceLifecycleStatus[] = [
  "submitted",
  "reviewed",
  "approved",
  "active",
  "review_due",
  "retired",
];

export async function setEvidenceLifecycle(input: {
  evidenceId: string;
  status: EvidenceLifecycleStatus;
  staffUserId: string;
  note: string;
  clinicianReviewerName?: string;
  reviewedBy?: string;
}): Promise<boolean> {
  if (!LIFECYCLE.includes(input.status)) return false;
  const inCatalog = APPROVED_EVIDENCE.some((record) => record.evidenceId === input.evidenceId);
  const submission = await EvidenceSubmission.findOne({ where: { evidenceId: input.evidenceId } });
  if (!inCatalog && !submission) return false;

  if (inCatalog) {
    await EvidenceStatus.upsert({
      evidenceId: input.evidenceId,
      status: input.status,
      note: input.note.slice(0, 280),
      staffUserId: input.staffUserId,
      clinicianReviewerName: (input.clinicianReviewerName ?? "").slice(0, 120),
      reviewedBy: input.reviewedBy ?? null,
      reviewedAt: ["reviewed", "approved", "active"].includes(input.status) ? new Date() : null,
      updatedAt: new Date(),
    });
  }

  if (submission) {
    submission.status = input.status;
    submission.reviewNotes = input.note.slice(0, 280);
    submission.staffUserId = input.staffUserId;
    if (input.clinicianReviewerName) {
      submission.clinicianReviewerName = input.clinicianReviewerName.slice(0, 120);
    }
    if (input.reviewedBy) submission.reviewedBy = input.reviewedBy;
    if (["reviewed", "approved", "active"].includes(input.status)) {
      submission.reviewedAt = new Date();
    }
    await submission.save();
  }
  return true;
}

export async function submitEvidenceSource(input: {
  evidenceId: string;
  sourceName: string;
  organization: string;
  topic: string;
  publicationDate: string;
  urlOrIdentifier: string;
  evidenceCategory: string;
  summary: string;
  staffUserId: string;
}): Promise<"ok" | "duplicate"> {
  const existing =
    APPROVED_EVIDENCE.some((record) => record.evidenceId === input.evidenceId) ||
    (await EvidenceSubmission.findOne({ where: { evidenceId: input.evidenceId } }));
  if (existing) return "duplicate";

  await EvidenceSubmission.create({
    evidenceId: input.evidenceId.trim(),
    sourceName: input.sourceName.slice(0, 160),
    organization: input.organization.slice(0, 160),
    topic: input.topic.slice(0, 160),
    publicationDate: input.publicationDate.slice(0, 32),
    urlOrIdentifier: input.urlOrIdentifier.slice(0, 280),
    evidenceCategory: input.evidenceCategory.slice(0, 64),
    summary: input.summary.slice(0, 500),
    status: "submitted",
    staffUserId: input.staffUserId,
  });
  return "ok";
}

export async function listEvidenceSubmissions(): Promise<
  Array<{
    evidenceId: string;
    sourceName: string;
    organization: string;
    topic: string;
    publicationDate: string;
    status: string;
    clinicianReviewerName: string;
    version: string;
    summary: string;
    updatedAt: string;
  }>
> {
  const rows = await EvidenceSubmission.findAll({ order: [["updatedAt", "DESC"]], limit: 100 });
  return rows.map((row) => ({
    evidenceId: row.evidenceId,
    sourceName: row.sourceName,
    organization: row.organization,
    topic: row.topic,
    publicationDate: row.publicationDate,
    status: row.status,
    clinicianReviewerName: row.clinicianReviewerName,
    version: row.version,
    summary: row.summary,
    updatedAt: row.updatedAt.toISOString(),
  }));
}
