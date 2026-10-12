import { appBaseUrl, renderNoticeEmail } from "./sendMail.js";

export function signupVerifyEmail(rawToken: string): {
  subject: string;
  text: string;
  html: string;
  /** Absolute link — logged in development when SMTP is off. */
  devLinkHint: string;
} {
  const actionUrl = `${appBaseUrl()}/verify-email?token=${encodeURIComponent(rawToken)}`;
  const body = renderNoticeEmail({
    heading: "Confirm your email",
    paragraphs: [
      "Welcome to HerCompassAI. Please confirm this email address so we know it belongs to you.",
      "This link expires in 24 hours and can be used once. If you did not create an account, you can ignore this message.",
    ],
    actionLabel: "Confirm email",
    actionUrl,
    footnote:
      "HerCompassAI shares educational support. It does not provide a diagnosis, a prescription, or a clinical prognosis.",
  });
  return {
    subject: "Confirm your HerCompassAI email",
    ...body,
    devLinkHint: actionUrl,
  };
}
