import { appBaseUrl, renderNoticeEmail } from "./sendMail.js";

const SCOPE_LABELS: Record<string, string> = {
  general_support: "general support recommendations",
  shared_activities: "shared activities",
  communication_guidance: "communication guidance",
};

export function partnerInviteEmail(rawToken: string, scopes: string[]): {
  subject: string;
  text: string;
  html: string;
} {
  const shared = scopes.map((scope) => SCOPE_LABELS[scope] ?? scope).join(", ");
  const actionUrl = `${appBaseUrl()}/partner/invite?token=${encodeURIComponent(rawToken)}`;
  const body = renderNoticeEmail({
    heading: "Join your partner on HerCompassAI",
    paragraphs: [
      "Someone invited you to HerCompassAI Partner Support. You choose whether to join.",
      shared
        ? `If you join, you may see ${shared}. You will not see personal symptoms, raw tracking logs, or private notes.`
        : "If you join, you will not see personal symptoms, raw tracking logs, or private notes.",
      "You can ignore this email. Ignoring it leaves sharing off.",
    ],
    actionLabel: "Review the invitation",
    actionUrl,
    footnote:
      "HerCompassAI shares educational support. It does not provide a diagnosis, a prescription, or a clinical prognosis.",
  });
  return { subject: "You have been invited to HerCompassAI Partner Support", ...body };
}
