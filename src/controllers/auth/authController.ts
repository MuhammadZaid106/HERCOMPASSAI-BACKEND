import type { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { User, RefreshToken } from "../../models/index.js";
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
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  googleAuthSchema,
} from "./authSchemas.js";

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


