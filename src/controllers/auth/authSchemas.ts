import { z } from "zod";

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(100, "Name must be under 100 characters")
    .trim(),
  email: z.email("Please provide a valid email address").toLowerCase().trim(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must include at least one uppercase letter")
    .regex(/[0-9]/, "Password must include at least one number"),
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

export const googleAuthSchema = z.object({
  name: z.string().min(1).default("Member"),
  email: z.string().email("Please provide a valid email address").toLowerCase().trim(),
  googleId: z.string().min(1, "Google ID is required"),
  role: z.enum(["member", "partner"]).default("member"),
  plan: z.enum(["free", "plus", "premium"]).default("free"),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type GoogleAuthInput = z.infer<typeof googleAuthSchema>;
