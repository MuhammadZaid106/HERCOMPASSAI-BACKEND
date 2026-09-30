import { appBaseUrl, renderNoticeEmail } from "./sendMail.js";

export function passwordResetEmail(rawToken: string): {
  subject: string;
  text: string;
  html: string;
} {
  const actionUrl = `${appBaseUrl()}/reset-password?token=${encodeURIComponent(rawToken)}`;
  const body = renderNoticeEmail({
    heading: "Reset your password",
    paragraphs: [
      "We received a request to reset the password for your HerCompassAI account.",
      "This link expires in 30 minutes and can be used once. If you did not ask for this, you can ignore the email and your password will stay the same.",
    ],
    actionLabel: "Choose a new password",
    actionUrl,
    footnote:
      "HerCompassAI shares educational support. It does not provide a diagnosis, a prescription, or a clinical prognosis.",
  });
  return { subject: "Reset your HerCompassAI password", ...body };
}
