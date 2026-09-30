import path from "path";
import { fileURLToPath } from "url";
import nodemailer from "nodemailer";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";

const logoPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "logo.png");

const mailLog = logger.module("MAIL");

/** Address written into email buttons. Local until the new pages are deployed. */
export function appBaseUrl(): string {
  const configured = env.FRONTEND_URL.trim();
  const raw = configured || env.CORS_ORIGIN.split(",")[0]?.trim() || "http://localhost:3000";
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withScheme.replace(/\/$/, "");
}

export function mailIsConfigured(): boolean {
  return Boolean(env.SMTP_USER.trim() && env.SMTP_APP_PASSWORD.trim() && env.MAIL_FROM.trim());
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export async function sendMail(message: MailMessage): Promise<boolean> {
  if (!mailIsConfigured()) {
    mailLog.warn("Mail is not configured, so the message was not sent.");
    return false;
  }

  const transport = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_APP_PASSWORD,
    },
  });

  await transport.sendMail({
    from: `"HerCompassAI" <${env.MAIL_FROM}>`,
    to: message.to,
    subject: message.subject,
    text: message.text,
    html: message.html,
    attachments: [
      {
        filename: "hercompass-logo.png",
        path: logoPath,
        cid: "hercompass-logo",
      },
    ],
  });
  mailLog.info(`Sent "${message.subject}"`);
  return true;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function renderNoticeEmail(input: {
  heading: string;
  paragraphs: string[];
  actionLabel?: string;
  actionUrl?: string;
  footnote: string;
}): { text: string; html: string } {
  const action =
    input.actionLabel && input.actionUrl
      ? `\n\n${input.actionLabel}: ${input.actionUrl}`
      : "";
  const text = [input.heading, "", ...input.paragraphs, action, "", input.footnote].join("\n");
  const paragraphs = input.paragraphs
    .map(
      (paragraph) =>
        `<p class="copy" style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#334155;">${escapeHtml(paragraph)}</p>`,
    )
    .join("");
  const button =
    input.actionLabel && input.actionUrl
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 4px;"><tr><td>
          <a href="${escapeHtml(input.actionUrl)}" style="display:block;width:100%;box-sizing:border-box;background:#7C5CFC;color:#ffffff;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:15px;line-height:1.2;padding:14px 16px;border-radius:999px;text-align:center;">${escapeHtml(input.actionLabel)}</a>
        </td></tr></table>`
      : "";
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(input.heading)}</title>
  <style>
    @media only screen and (max-width: 480px) {
      .outer-pad { padding: 12px 10px !important; }
      .card-pad { padding: 20px 16px !important; }
      .heading { font-size: 22px !important; }
      .copy { font-size: 15px !important; }
      .brand-name { font-size: 16px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;width:100%;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;background:#F8FAFC;">
    <tr>
      <td class="outer-pad" align="center" style="padding:20px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #E2E8F0;border-radius:16px;">
          <tr>
            <td class="card-pad" style="padding:28px 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td style="padding:0 10px 0 0;vertical-align:middle;">
                    <img src="cid:hercompass-logo" width="40" height="40" alt="HerCompassAI" style="display:block;width:40px;height:40px;border:0;outline:none;text-decoration:none;">
                  </td>
                  <td style="vertical-align:middle;font-family:Arial,Helvetica,sans-serif;">
                    <div class="brand-name" style="font-size:18px;font-weight:700;line-height:1.2;color:#0F172A;">HerCompass<span style="color:#7C5CFC;">AI</span></div>
                    <div style="margin-top:2px;font-size:10px;line-height:1.3;letter-spacing:0.04em;text-transform:uppercase;font-weight:600;color:#94A3B8;">Clinical &amp; Relationship Intelligence</div>
                  </td>
                </tr>
              </table>
              <h1 class="heading" style="margin:0 0 16px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;font-weight:700;color:#0F172A;">${escapeHtml(input.heading)}</h1>
              ${paragraphs}
              ${button}
              <p style="margin:20px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#64748B;">${escapeHtml(input.footnote)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  return { text, html };
}
