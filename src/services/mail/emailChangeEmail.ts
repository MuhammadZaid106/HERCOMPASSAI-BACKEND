import { appBaseUrl, renderNoticeEmail } from "./sendMail.js";

export function emailChangeConfirmEmail(rawToken: string, newEmail: string): {
  subject: string;
  text: string;
  html: string;
  devLinkHint: string;
} {
  const actionUrl = `${appBaseUrl()}/confirm-email-change?token=${encodeURIComponent(rawToken)}`;
  const body = renderNoticeEmail({
    heading: "Confirm your new email",
    paragraphs: [
      `You asked to use ${newEmail} for your HerCompassAI account.`,
      "Confirm this address to finish the change. The link expires in 24 hours and works once.",
      "If you did not ask for this, you can ignore the message — your current email stays the same.",
    ],
    actionLabel: "Confirm new email",
    actionUrl,
    footnote:
      "HerCompassAI shares educational support. It does not provide a diagnosis, a prescription, or a clinical prognosis.",
  });
  return {
    subject: "Confirm your new HerCompassAI email",
    ...body,
    devLinkHint: actionUrl,
  };
}

export function emailChangeNoticeToOldAddress(oldEmail: string, newEmail: string): {
  subject: string;
  text: string;
  html: string;
} {
  const body = renderNoticeEmail({
    heading: "Your account email is changing",
    paragraphs: [
      `Someone (hopefully you) started moving this HerCompassAI account from ${oldEmail} to ${newEmail}.`,
      "If that was you, confirm the message sent to the new address. If it was not you, sign in and change your password, then contact support.",
    ],
    footnote:
      "HerCompassAI shares educational support. It does not provide a diagnosis, a prescription, or a clinical prognosis.",
  });
  return { subject: "HerCompassAI email change started", ...body };
}
