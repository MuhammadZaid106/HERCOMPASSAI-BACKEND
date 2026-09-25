import type { Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { User, RefreshToken } from "../../models/index.js";
import { hashPassword } from "../../services/auth/hashPassword.js";
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from "../../services/auth/generateTokens.js";
import { sendSuccess, sendError } from "../../utils/apiResponse.js";
import { logger } from "../../utils/logger.js";
import {
  registerSchema,
  loginSchema,
  refreshSchema,
  googleAuthSchema,
} from "./authSchemas.js";

const authLog = logger.module("AUTH");

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

    const accessToken = generateAccessToken({
      userId: newUser.id,
      email: newUser.email,
      role: newUser.role,
      plan: newUser.plan,
    });
    const refreshToken = generateRefreshToken({ userId: newUser.id });

    // Store hashed refresh token in DB
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await RefreshToken.create({
      userId: newUser.id,
      tokenHash,
      expiresAt,
    });

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

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store hashed refresh token in DB
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

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
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const stored = await RefreshToken.findOne({ where: { tokenHash } });

    if (!stored || stored.revoked || new Date(stored.expiresAt) < new Date()) {
      authLog.warn(`Refresh token invalid or expired for userId: ${payload.userId}`);
      sendError(res, 401, "Invalid or expired refresh token");
      return;
    }

    const user = await User.findByPk(payload.userId);
    if (!user) {
      sendError(res, 401, "User not found");
      return;
    }

    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    });

    authLog.info(`🔄 Access token refreshed for userId: ${user.id}`);

    sendSuccess(res, 200, "Token refreshed", { accessToken: newAccessToken });
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
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");

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
// Upsert user into Neon PostgreSQL on Google OAuth sign-in
// ─────────────────────────────────────────────────────────────────────────────
export async function googleAuthController(req: Request, res: Response): Promise<void> {
  const parsed = googleAuthSchema.safeParse(req.body);
  if (!parsed.success) {
    sendError(res, 422, "Validation failed", parsed.error.flatten().fieldErrors);
    return;
  }

  const { name, email, googleId, role, plan } = parsed.data;

  try {
    let user = await User.findOne({ where: { email } });

    if (!user) {
      user = await User.create({
        name,
        email,
        googleId,
        role,
        plan,
        emailVerified: true,
      });
      authLog.info(`✅ New Google OAuth user created in Neon DB`, {
        userId: user.id,
        email: user.email,
        googleId,
      });
    } else {
      let needsSave = false;
      if (!user.googleId) {
        user.googleId = googleId;
        needsSave = true;
      }
      if (!user.emailVerified) {
        user.emailVerified = true;
        needsSave = true;
      }
      if (role && user.role !== role) {
        user.role = role;
        needsSave = true;
      }
      if (needsSave) {
        await user.save();
      }
      authLog.info(`✅ Existing Google OAuth user authenticated in Neon DB (role: ${user.role})`, {
        userId: user.id,
        email: user.email,
        role: user.role,
      });
    }

    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      plan: user.plan,
    });
    const refreshToken = generateRefreshToken({ userId: user.id });

    // Store hashed refresh token in DB
    const tokenHash = crypto.createHash("sha256").update(refreshToken).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await RefreshToken.create({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

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
    authLog.error("Google auth error", err);
    sendError(res, 500, "An unexpected error occurred during Google authentication.");
  }
}


