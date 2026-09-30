import type { Request, Response } from "express";
import crypto from "crypto";
import { Op } from "sequelize";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User, RefreshToken, PasswordResetToken } from "../../models/index.js";
import { sequelize } from "../../config/db.js";
import { env } from "../../config/env.js";
import { hashPassword } from "../../services/auth/hashPassword.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../services/auth/generateTokens.js";
import {
  classifyRefreshAttempt,
  parseDurationMs,
} from "../../services/auth/refreshTokenPolicy.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import { notifySecurityEvent } from "../../services/notifications/notificationService.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  googleAuthSchema,
  changePasswordSchema,
  sessionSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "./authSchemas.js";
import { passwordResetEmail } from "../../services/mail/passwordResetEmail.js";
import { sendMail } from "../../services/mail/sendMail.js";

const authLog = logger.module("AUTH");

/** Refresh tokens are stored as a digest; the raw token never touches the DB. */
function hashRefreshToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Single source of truth for refresh token lifetime. Previously three call sites
 * hard-coded 7 days while the JWT itself honoured JWT_REFRESH_EXPIRES_IN, so
 * rotating past the configured expiry produced a token the database rejected.
 */
function refreshTokenExpiry(): Date {
  return new Date(Date.now() + parseDurationMs(env.JWT_REFRESH_EXPIRES_IN));
}

/**
 * Issues an access/refresh pair and persists the hashed refresh token.
 * A fresh familyId starts a new session lineage for reuse detection.
 */
async function issueSession(user: User): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const accessToken = generateAccessToken({
    userId: user.id,
    email: user.email,
    role: user.role,
    plan: user.plan,
  });
  const refreshToken = generateRefreshToken({ userId: user.id });

  await RefreshToken.create({
    userId: user.id,
    tokenHash: hashRefreshToken(refreshToken),
    familyId: crypto.randomUUID(),
    expiresAt: refreshTokenExpiry(),
  });

  return { accessToken, refreshToken };
}

/**
 * Warns the member when a fresh sign-in joins an already signed-in device.
 *
 * Called after the new session is written, so a single active session means the
 * sign-in just made is the only one and there is no other device to warn about.
 * Only a second (or later) live session carries news worth a security notice.
 *
 * Delivery is best-effort: a failed notice must never fail the sign-in itself.
 */
async function notifyIfAdditionalSession(userId: string): Promise<void> {
  try {
    const active = await RefreshToken.count({
      where: { userId, revoked: false, expiresAt: { [Op.gt]: new Date() } },
    });
    if (active < 2) return;
    await notifySecurityEvent(userId, {
      title: "New sign-in to your account",
      body: "A new device signed in. If this was not you, change your password and sign other devices out.",
      targetUrl: "/app/settings",
    });
  } catch {
    // Intentionally ignored: see the doc comment above.
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────────────────────
export async function registerController(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }

  const { name, email, password, role, plan } = parsed.data;

  try {
    // Check if user already exists
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      authLog.warn(`Registration attempt for existing email: ${email}`);
      sendError(res, 409, "An account with this email already exists");
      return;
    }

    const passwordHash = await hashPassword(password);

    const newUser = await User.create({
      name,
      email,
      passwordHash,
      role,
      plan,
    });

    const { accessToken, refreshToken } = await issueSession(newUser);

    authLog.info(`✅ New user registered via Sequelize`, {
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      plan: newUser.plan,
    });

    sendSuccess(res, 201, "Account created successfully", {
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        plan: newUser.plan,
        createdAt: newUser.createdAt,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    authLog.error("Registration error", err);
    sendError(res, 500, "An unexpected error occurred. Please try again.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// ─────────────────────────────────────────────────────────────────────────────
export async function loginController(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }

  const { email, password } = parsed.data;

  try {
    const user = await User.findOne({ where: { email } });

    if (!user || !user.passwordHash) {
      authLog.warn(`Failed login attempt — email not found: ${email}`);
      sendError(res, 401, "Invalid email or password");
      return;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      authLog.warn(`Failed login attempt — wrong password for: ${email}`);
      sendError(res, 401, "Invalid email or password");
      return;
    }

    const { accessToken, refreshToken } = await issueSession(user);

    authLog.info(`✅ User logged in via Sequelize`, {
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    });

    await notifyIfAdditionalSession(user.id);

    sendSuccess(res, 200, "Login successful", {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    authLog.error("Login error", err);
    sendError(res, 500, "An unexpected error occurred. Please try again.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/refresh
// ─────────────────────────────────────────────────────────────────────────────
export async function refreshController(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }

  const { refreshToken } = parsed.data;

  try {
    const payload = verifyRefreshToken(refreshToken);
    const tokenHash = hashRefreshToken(refreshToken);

    const outcome = await sequelize.transaction(async (transaction) => {
      const stored = await RefreshToken.findOne({
        where: { tokenHash },
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      const verdict = classifyRefreshAttempt(stored, new Date());

      if (verdict === "reuse_detected" && stored) {
        // A token that was already rotated has reappeared inside its validity
        // window. Treat it as theft and revoke every descendant of this login so
        // the attacker's live token dies with it.
        await RefreshToken.update(
          { revoked: true },
          {
            where: { userId: stored.userId, familyId: stored.familyId },
            transaction,
          }
        );
        authLog.error(
          `🚨 Refresh token reuse detected — revoked entire token family`,
          { userId: stored.userId, familyId: stored.familyId }
        );
        return { kind: "reuse" as const };
      }

      if (verdict !== "valid" || !stored) {
        return { kind: "reject" as const, verdict };
      }

      if (stored.userId !== payload.userId) {
        // The signature verified, so the subject is trustworthy, but the stored
        // row belongs to somebody else. Refuse instead of crossing accounts.
        authLog.error(`🚨 Refresh token subject does not match stored row`, {
          claimUserId: payload.userId,
          rowUserId: stored.userId,
        });
        return { kind: "reject" as const, verdict: "unknown" as const };
      }

      const user = await User.findByPk(payload.userId, { transaction });
      if (!user) return { kind: "reject" as const, verdict: "unknown" as const };

      const accessToken = generateAccessToken({
        userId: user.id,
        email: user.email,
        role: user.role,
        plan: user.plan,
      });
      const nextRefreshToken = generateRefreshToken({ userId: user.id });
      const nextTokenHash = hashRefreshToken(nextRefreshToken);

      await stored.update(
        { revoked: true, replacedByHash: nextTokenHash },
        { transaction }
      );
      await RefreshToken.create(
        {
          userId: user.id,
          tokenHash: nextTokenHash,
          // Inherit the family so a replay of any ancestor can nuke the lineage.
          // Legacy rows without a family start their own lineage.
          familyId: stored.familyId ?? crypto.randomUUID(),
          expiresAt: refreshTokenExpiry(),
        },
        { transaction },
      );

      return { kind: "ok" as const, user, accessToken, refreshToken: nextRefreshToken };
    });

    if (outcome.kind === "reuse") {
      // Deliberately vague to the caller: do not confirm which token leaked.
      sendError(res, 401, "Your session was revoked for security. Please log in again.");
      return;
    }

    if (outcome.kind !== "ok") {
      authLog.warn(
        `Refresh token rejected (${outcome.verdict}) for userId: ${payload.userId}`
      );
      sendError(res, 401, "Invalid or expired refresh token");
      return;
    }

    authLog.info(`🔄 Tokens rotated for userId: ${outcome.user.id}`);
    sendSuccess(res, 200, "Token refreshed", {
      accessToken: outcome.accessToken,
      refreshToken: outcome.refreshToken,
    });
  } catch (err) {
    authLog.warn("Refresh token verification failed", err);
    sendError(res, 401, "Invalid or expired refresh token");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/logout
// ─────────────────────────────────────────────────────────────────────────────
export async function logoutController(req: Request, res: Response): Promise<void> {
  const parsed = refreshSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }

  const { refreshToken } = parsed.data;

  try {
    const tokenHash = hashRefreshToken(refreshToken);

    // Only the presented token dies. Deliberately NOT revoking the family and
    // NOT setting replacedByHash: a later replay of a logged-out token is a
    // plain "revoked" verdict, so it cannot be used to log the user out again.
    await RefreshToken.update({ revoked: true }, { where: { tokenHash } });

    authLog.info(`🚪 User logged out — refresh token revoked`);

    sendSuccess(res, 200, "Logged out successfully", null);
  } catch (err) {
    authLog.error("Logout error", err);
    sendError(res, 500, "An unexpected error occurred");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me
// ─────────────────────────────────────────────────────────────────────────────
export async function meController(req: Request, res: Response): Promise<void> {
  const authReq = req as { user?: { userId: string } };
  if (!authReq.user?.userId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  try {
    const user = await User.findByPk(authReq.user.userId, {
      attributes: ["id", "name", "email", "role", "plan", "emailVerified", "createdAt", "updatedAt"],
    });

    if (!user) {
      sendError(res, 404, "User not found");
      return;
    }

    sendSuccess(res, 200, "User profile retrieved", { user });
  } catch (err) {
    authLog.error("Get me error", err);
    sendError(res, 500, "An unexpected error occurred");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/google
// Verify a Google ID token, then upsert the user
//
// The request body carries an ID token and nothing else. Every claim below is
// read from the verified token, never from the caller. Previously the body
// supplied `email`, `googleId` and `role`, which let anyone who knew an email
// address sign in as that user, and let the caller rewrite an existing account's
// role and `emailVerified` flag.
// ─────────────────────────────────────────────────────────────────────────────
export async function googleAuthController(req: Request, res: Response): Promise<void> {
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }

  if (!env.GOOGLE_CLIENT_ID.trim()) {
    authLog.error("POST /api/auth/google called but GOOGLE_CLIENT_ID is not configured");
    sendError(res, 503, "Google sign-in is not configured on this server.");
    return;
  }

  const { idToken } = parsed.data;

  try {
    const client = new OAuth2Client(env.GOOGLE_CLIENT_ID);
    // Throws unless the signature, audience, issuer and expiry all check out.
    const ticket = await client.verifyIdToken({
      idToken,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const claims = ticket.getPayload();

    if (
      !claims?.sub ||
      !claims.email ||
      (claims.iss !== "accounts.google.com" && claims.iss !== "https://accounts.google.com")
    ) {
      authLog.warn("Google ID token passed verification but is missing required claims");
      sendError(res, 401, "Google sign-in could not be verified.");
      return;
    }

    if (claims.email_verified !== true) {
      // An unverified Google email must never be used to claim an account.
      authLog.warn(`Rejected Google sign-in for unverified email: ${claims.email}`);
      sendError(res, 403, "Your Google account email is not verified.");
      return;
    }

    const googleId = claims.sub;
    const email = claims.email.toLowerCase();
    const name = typeof claims.name === "string" && claims.name.trim() !== ""
      ? claims.name.trim().slice(0, 100)
      : email.split("@")[0];

    let user = await User.findOne({ where: { googleId } });

    if (!user) {
      // Linking by verified email is the Google-documented safe path. An account
      // already bound to a *different* Google subject is refused instead of
      // being handed over.
      const byEmail = await User.findOne({ where: { email } });
      if (byEmail?.googleId && byEmail.googleId !== googleId) {
        authLog.error(`🚨 Google sign-in refused: email already linked to another Google account`, {
          email,
        });
        sendError(res, 409, "This email is already linked to a different Google account.");
        return;
      }

      if (byEmail) {
        byEmail.googleId = googleId;
        byEmail.emailVerified = true;
        await byEmail.save();
        user = byEmail;
        authLog.info(`✅ Linked existing account to Google subject`, {
          userId: user.id,
          email: user.email,
        });
      } else {
        // role/plan are server-owned: a new Google user always starts as a
        // free member, regardless of what the browser claimed.
        user = await User.create({
          name,
          email,
          googleId,
          role: "member",
          plan: "free",
          emailVerified: true,
        });
        authLog.info(`✅ New Google OAuth user created`, {
          userId: user.id,
          email: user.email,
        });
      }
    } else {
      authLog.info(`✅ Existing Google OAuth user authenticated (role: ${user.role})`, {
        userId: user.id,
        email: user.email,
      });
    }

    const { accessToken, refreshToken } = await issueSession(user);

    await notifyIfAdditionalSession(user.id);

    sendSuccess(res, 200, "Google authentication successful", {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
        createdAt: user.createdAt,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    // verifyIdToken throws on a bad signature, wrong audience or an expired
    // token. Log the reason, never the token.
    authLog.warn("Google ID token verification failed", err);
    sendError(res, 401, "Google sign-in could not be verified.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/change-password
//
// Changing a password ends every session that existed before it, then issues the
// caller a fresh pair. The member stays signed in on this device while every
// other device is signed out, which is the point: a password change is how
// someone responds to believing a session was stolen, so leaving the old tokens
// alive would defeat it.
// ─────────────────────────────────────────────────────────────────────────────
export async function changePasswordController(req: Request, res: Response): Promise<void> {
  const authReq = req as { user?: { userId: string } };
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }
  if (!authReq.user?.userId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  try {
    const user = await User.findByPk(authReq.user.userId);
    if (!user) {
      sendError(res, 404, "User not found");
      return;
    }

    // A Google-only account never had a password. Accepting one here would set a
    // credential the member does not use and cannot discover.
    if (!user.passwordHash) {
      sendError(res, 400, "This account signs in with Google, so it has no password to change.");
      return;
    }

    const matches = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!matches) {
      // Deliberately does not say which half was wrong: that would confirm to an
      // attacker that the password itself was correct.
      sendError(res, 401, "That current password is not correct.");
      return;
    }

    const unchanged = await bcrypt.compare(parsed.data.newPassword, user.passwordHash);
    if (unchanged) {
      sendError(res, 422, "Choose a password you have not used here before.");
      return;
    }

    await user.update({ passwordHash: await hashPassword(parsed.data.newPassword) });

    // Every refresh token, the caller's included: they are about to be replaced.
    const [endedSessions] = await RefreshToken.update(
      { revoked: true },
      { where: { userId: user.id } },
    );

    const { accessToken, refreshToken } = await issueSession(user);

    authLog.info(`🔑 Password changed; ${endedSessions} session(s) ended`, {
      userId: user.id,
    });

    await notifySecurityEvent(user.id, {
      title: "Your password was changed",
      body: "Every other device was signed out. If this was not you, reset your password right away.",
    });

    sendSuccess(res, 200, "Password updated", {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        plan: user.plan,
      },
      accessToken,
      refreshToken,
      endedSessions,
    });
  } catch (err) {
    authLog.error("Change password error", err);
    sendError(res, 500, "An unexpected error occurred. Please try again.");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/sessions
//
// How many logins are currently live. Deliberately a count and not a list: the
// access token identifies a user but not a device, and the refresh token is a
// secret that has no business in a URL that gets logged. See
// revokeOtherSessionsController for how "this device" is established.
// ─────────────────────────────────────────────────────────────────────────────
export async function getSessionsController(req: Request, res: Response): Promise<void> {
  const authReq = req as { user?: { userId: string } };
  if (!authReq.user?.userId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  try {
    const activeSessions = await RefreshToken.count({
      where: {
        userId: authReq.user.userId,
        revoked: false,
        expiresAt: { [Op.gt]: new Date() },
      },
    });
    sendSuccess(res, 200, "Sessions retrieved", { activeSessions });
  } catch (err) {
    authLog.error("Get sessions error", err);
    sendError(res, 500, "An unexpected error occurred");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/sessions/revoke-others
//
// Every refresh token descends from one login, and rotation keeps that family
// together (see refreshController). The caller identifies its own family by
// presenting its refresh token, so no device fingerprint is trusted. Every
// family that is not the caller's is ended.
// ─────────────────────────────────────────────────────────────────────────────
export async function revokeOtherSessionsController(req: Request, res: Response): Promise<void> {
  const authReq = req as { user?: { userId: string } };
  const parsed = sessionSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }
  if (!authReq.user?.userId) {
    sendError(res, 401, "Not authenticated");
    return;
  }

  try {
    const current = await RefreshToken.findOne({
      where: { tokenHash: hashRefreshToken(parsed.data.refreshToken) },
    });

    // With no live token of its own there is no way to tell the caller's session
    // apart from the others. Refuse rather than sign the caller out as well.
    if (!current || current.userId !== authReq.user.userId || current.revoked) {
      sendError(res, 401, "Your session is no longer active. Please sign in again.");
      return;
    }

    const rows = await RefreshToken.findAll({ where: { userId: authReq.user.userId } });
    const now = new Date();
    const currentFamily = current.familyId ?? null;

    // Compared in JS rather than with `familyId: { [Op.ne]: ... }`: rows written
    // before reuse detection existed have a NULL family, and a SQL inequality
    // silently skips NULLs, which would leave those sessions alive.
    const otherRows = rows.filter((row) => (row.familyId ?? null) !== currentFamily);
    const wasActive = otherRows.filter((row) => !row.revoked && row.expiresAt > now);
    const ids = otherRows.map((row) => row.id);

    if (ids.length > 0) {
      await RefreshToken.update({ revoked: true }, { where: { id: ids } });
    }

    authLog.info(`🚪 ${wasActive.length} other session(s) revoked`, {
      userId: authReq.user.userId,
    });

    if (wasActive.length > 0) {
      await notifySecurityEvent(authReq.user.userId, {
        title: "Other devices were signed out",
        body: `${wasActive.length} other ${
          wasActive.length === 1 ? "session was" : "sessions were"
        } signed out. This device stays signed in.`,
      });
    }

    sendSuccess(res, 200, "Other sessions signed out", {
      revokedSessions: wasActive.length,
    });
  } catch (err) {
    authLog.error("Revoke other sessions error", err);
    sendError(res, 500, "An unexpected error occurred");
  }
}

const RESET_MESSAGE = "If an account exists for that email, a reset link is on its way.";
const RESET_MS = 30 * 60 * 1000;

export async function forgotPasswordController(req: Request, res: Response): Promise<void> {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, "Enter the email on your account");
    return;
  }

  const user = await User.findOne({ where: { email: parsed.data.email } });
  if (user) {
    await PasswordResetToken.update(
      { usedAt: new Date() },
      { where: { userId: user.id, usedAt: null } },
    );
    const rawToken = crypto.randomBytes(32).toString("hex");
    await PasswordResetToken.create({
      userId: user.id,
      tokenHash: hashRefreshToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_MS),
    });
    const message = passwordResetEmail(rawToken);
    try {
      await sendMail({ to: user.email, ...message });
    } catch (error) {
      authLog.error("Password reset email failed", error);
    }
  }

  sendSuccess(res, 200, RESET_MESSAGE, { sent: true });
}

export async function resetPasswordController(req: Request, res: Response): Promise<void> {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 400, parsed.error.issues[0]?.message ?? "Check the new password");
    return;
  }

  const token = await PasswordResetToken.findOne({
    where: { tokenHash: hashRefreshToken(parsed.data.token) },
  });
  if (!token || token.usedAt || token.expiresAt.getTime() < Date.now()) {
    sendError(res, 400, "This reset link has expired. Request a new one.");
    return;
  }

  const user = await User.findByPk(token.userId);
  if (!user) {
    sendError(res, 400, "This reset link has expired. Request a new one.");
    return;
  }

  await user.update({ passwordHash: await hashPassword(parsed.data.password) });
  await token.update({ usedAt: new Date() });
  await RefreshToken.update({ revoked: true }, { where: { userId: user.id } });
  authLog.info(`Password reset completed for user ${user.id}`);
  sendSuccess(res, 200, "Your password has been updated. You can sign in.", { reset: true });
}


