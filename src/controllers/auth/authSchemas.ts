import { z } from "zod";

/**
 * The one definition of an acceptable password.
 *
 * Registration and a later password change both use this. Two separate copies
 * would let a member set, from the settings page, a password that the sign-up
 * form would have rejected.
 */
const acceptablePassword = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must include at least one uppercase letter")
  .regex(/[0-9]/, "Password must include at least one number");

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters")
    .trim(),
  email: z.email("Please provide a valid email address").toLowerCase().trim(),
  password: acceptablePassword,
  role: z.enum(["member", "partner"]).default("member"),
  plan: z.enum(["free", "plus", "premium"]).default("free"),
});

export const loginSchema = z.object({
  email: z.email("Please provide a valid email address").toLowerCase().trim(),
  password: z.string().min(1, "Password is required"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Changing a password requires proving the current one. The new password uses
 * the same rule as registration.
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: acceptablePassword,
});

/**
 * Session management.
 *
 * The caller proves which login it belongs to by presenting its own refresh
 * token. A user-agent heuristic could be copied by a thief, so it is never used
 * to decide which sessions to keep.
 */
export const sessionSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * Google sign-in contract.
 *
 * The browser sends ONLY the Google ID token. Every other claim (email, name,
 * email_verified, subject) is read from the verified token payload on the
 * server. Accepting `email`/`googleId`/`role` from the request body previously
 * allowed anyone who knew an email address to authenticate as that user, so
 * those fields were removed rather than merely ignored.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().min(20, "A Google ID token is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.email("Please provide a valid email address").toLowerCase().trim(),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(20, "This reset link is not valid"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[0-9]/, "Password must include at least one number"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type SessionInput = z.infer<typeof sessionSchema>;
