import { logger } from "../../utils/logger.js";
import { PartnerAuditLog } from "../../models/PartnerAuditLog.js";

const auditLog = logger.module("PARTNER-AUDIT");

export type PartnerAuditAction =
  | "home_read"
  | "activities_read"
  | "academy_read"
  | "lesson_read"
  | "support_read"
  | "conversation_read"
  | "digest_read";

export async function writePartnerAudit(input: {
  partnerUserId: string;
  memberUserId: string | null;
  action: PartnerAuditAction;
  topicAsked: string;
  topicsAllowed: string[];
  result: "allowed" | "refused" | "empty";
}): Promise<void> {
  await PartnerAuditLog.create({
    partnerUserId: input.partnerUserId,
    memberUserId: input.memberUserId,
    action: input.action,
    topicAsked: input.topicAsked,
    topicsAllowed: input.topicsAllowed,
    result: input.result,
  });
  auditLog.info(
    `Partner ${input.partnerUserId} ${input.action} ${input.topicAsked} ${input.result}`,
  );
}
