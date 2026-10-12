import crypto from "crypto";
import { Op } from "sequelize";
import { EmailActionToken, type EmailActionPurpose } from "../../models/EmailActionToken.js";
import { User } from "../../models/User.js";
import { env } from "../../config/env.js";
import { logger } from "../../utils/logger.js";
import { sendMail, mailIsConfigured } from "../mail/sendMail.js";
import { signupVerifyEmail } from "../mail/signupVerifyEmail.js";
import {
  emailChangeConfirmEmail,
  emailChangeNoticeToOldAddress,
} from "../mail/emailChangeEmail.js";

const log = logger.module("EMAIL-ACTION");

/** 24 hours — long enough to open mail later the same day; short enough to limit abuse. */
export const EMAIL_ACTION_TTL_MS = 24 * 60 * 60 * 1000;

function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

export async function invalidateOpenEmailActions(
  userId: string,
  purpose: EmailActionPurpose,
): Promise<void> {
  await EmailActionToken.update(
    { usedAt: new Date() },
    { where: { userId, purpose, usedAt: null } },
  );
}

/**
 * Issues a fresh token for the given purpose. Prior open tokens of the same
 * purpose are invalidated so only the latest link works.
 */
export async function issueEmailActionToken(input: {
  userId: string;
  purpose: EmailActionPurpose;
  pendingEmail?: string | null;
}): Promise<string> {
  await invalidateOpenEmailActions(input.userId, input.purpose);
  const raw = crypto.randomBytes(32).toString("hex");
  await EmailActionToken.create({
    userId: input.userId,
    purpose: input.purpose,
    tokenHash: hashToken(raw),
    pendingEmail: input.pendingEmail ?? null,
    expiresAt: new Date(Date.now() + EMAIL_ACTION_TTL_MS),
  });
  return raw;
}

export async function findValidEmailActionToken(
  rawToken: string,
  purpose: EmailActionPurpose,
): Promise<EmailActionToken | null> {
  const row = await EmailActionToken.findOne({
    where: {
      tokenHash: hashToken(rawToken),
      purpose,
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
  return row;
}

/**
 * Sends (or logs) a signup verification email. Never throws to the register path —
 * account creation must succeed even when SMTP is down.
 */
export async function sendSignupVerification(user: User): Promise<{ mailed: boolean }> {
  if (user.emailVerified) {
    return { mailed: false };
  }

  const raw = await issueEmailActionToken({
    userId: user.id,
    purpose: "signup_verify",
  });
  const message = signupVerifyEmail(raw);

  if (!mailIsConfigured()) {
    if (env.NODE_ENV !== "production") {
      log.warn(
        `Mail not configured — signup verify link for ${user.email}: ${message.devLinkHint}`,
      );
    } else {
      log.warn(`Mail not configured — could not send signup verify to ${user.email}`);
    }
    return { mailed: false };
  }

  try {
    await sendMail({ to: user.email, subject: message.subject, text: message.text, html: message.html });
    return { mailed: true };
  } catch (error) {
    log.error(`Signup verify email failed for ${user.id}`, error);
    return { mailed: false };
  }
}

export async function confirmSignupVerification(rawToken: string): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "invalid" | "already_verified" }
> {
  const row = await findValidEmailActionToken(rawToken, "signup_verify");
  if (!row) return { ok: false, reason: "invalid" };

  const user = await User.findByPk(row.userId);
  if (!user) return { ok: false, reason: "invalid" };

  if (user.emailVerified) {
    await row.update({ usedAt: new Date() });
    return { ok: false, reason: "already_verified" };
  }

  await user.update({ emailVerified: true });
  await row.update({ usedAt: new Date() });
  await invalidateOpenEmailActions(user.id, "signup_verify");
  log.info(`Email verified for user ${user.id}`);
  return { ok: true, userId: user.id, email: user.email };
}

export type RequestEmailChangeResult =
  | { ok: true; mailed: boolean; pendingEmail: string }
  | {
      ok: false;
      reason:
        | "same_email"
        | "taken"
        | "unverified"
        | "no_password"
        | "bad_password";
    };

/**
 * Starts an email change. Confirmation goes to the *new* address.
 * Requires a password check so a stolen session alone cannot take over the inbox.
 */
export async function requestEmailChange(input: {
  user: User;
  newEmail: string;
  passwordOk: boolean;
}): Promise<RequestEmailChangeResult> {
  const next = input.newEmail.trim().toLowerCase();
  if (!input.user.passwordHash) return { ok: false, reason: "no_password" };
  if (!input.passwordOk) return { ok: false, reason: "bad_password" };
  if (!input.user.emailVerified) return { ok: false, reason: "unverified" };
  if (next === input.user.email.toLowerCase()) return { ok: false, reason: "same_email" };

  const taken = await User.findOne({ where: { email: next } });
  if (taken) return { ok: false, reason: "taken" };

  const raw = await issueEmailActionToken({
    userId: input.user.id,
    purpose: "email_change",
    pendingEmail: next,
  });
  const confirm = emailChangeConfirmEmail(raw, next);
  let mailed = false;

  if (!mailIsConfigured()) {
    if (env.NODE_ENV !== "production") {
      log.warn(`Mail not configured — email change link for ${next}: ${confirm.devLinkHint}`);
    }
  } else {
    try {
      mailed = await sendMail({
        to: next,
        subject: confirm.subject,
        text: confirm.text,
        html: confirm.html,
      });
      const notice = emailChangeNoticeToOldAddress(input.user.email, next);
      await sendMail({ to: input.user.email, ...notice }).catch(() => false);
    } catch (error) {
      log.error(`Email change mail failed for ${input.user.id}`, error);
    }
  }

  return { ok: true, mailed, pendingEmail: next };
}

export async function confirmEmailChange(rawToken: string): Promise<
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: "invalid" | "taken" }
> {
  const row = await findValidEmailActionToken(rawToken, "email_change");
  if (!row?.pendingEmail) return { ok: false, reason: "invalid" };

  const next = row.pendingEmail.trim().toLowerCase();
  const taken = await User.findOne({ where: { email: next } });
  if (taken && taken.id !== row.userId) {
    await row.update({ usedAt: new Date() });
    return { ok: false, reason: "taken" };
  }

  const user = await User.findByPk(row.userId);
  if (!user) return { ok: false, reason: "invalid" };

  await user.update({ email: next, emailVerified: true });
  await row.update({ usedAt: new Date() });
  await invalidateOpenEmailActions(user.id, "email_change");
  await invalidateOpenEmailActions(user.id, "signup_verify");
  log.info(`Email changed for user ${user.id}`);
  return { ok: true, userId: user.id, email: next };
}
