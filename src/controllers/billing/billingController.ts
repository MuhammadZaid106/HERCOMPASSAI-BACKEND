import type { Response, NextFunction } from "express";
import { z } from "zod";
import { isStripeConfigured } from "../../config/stripe.js";
import { env } from "../../config/env.js";
import { StripeService } from "../../services/billing/stripeService.js";
import { User } from "../../models/User.js";
import { logger } from "../../utils/logger.js";
import type { AuthenticatedRequest } from "../../middleware/authMiddleware.js";
import { getStripe } from "../../config/stripe.js";

const billingLog = logger.module("BillingController");

const checkoutSchema = z.object({
  plan: z.enum(["plus", "premium"]),
  interval: z.enum(["month", "year"]).default("month"),
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});

export async function createCheckoutSession(
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        success: false,
        message: "Stripe billing is not configured on this server. Please set STRIPE_SECRET_KEY.",
      });
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid subscription request data",
        errors: parsed.error.flatten().fieldErrors,
      });
      return;
    }

    const result = await StripeService.createCheckoutSession({
      userId,
      plan: parsed.data.plan,
      interval: parsed.data.interval,
      successUrl: parsed.data.successUrl,
      cancelUrl: parsed.data.cancelUrl,
    });

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    billingLog.error("Checkout session creation failed:", err);
    res.status(500).json({
      success: false,
      message: err?.message || "Failed to create checkout session",
    });
  }
}

export async function createPortalSession(
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  try {
    if (!isStripeConfigured()) {
      res.status(503).json({
        success: false,
        message: "Stripe billing is not configured on this server. Please set STRIPE_SECRET_KEY.",
      });
      return;
    }

    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const returnUrl = typeof req.body?.returnUrl === "string" ? req.body.returnUrl : undefined;
    const result = await StripeService.createCustomerPortalSession(userId, returnUrl);

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    billingLog.error("Customer portal session creation failed:", err);
    res.status(400).json({
      success: false,
      message: err?.message || "Failed to create customer portal session",
    });
  }
}

export async function getBillingStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      res.status(401).json({ success: false, message: "Authentication required" });
      return;
    }

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        isConfigured: isStripeConfigured(),
        plan: user.plan,
        subscriptionStatus: user.subscriptionStatus || "none",
        hasStripeCustomer: Boolean(user.stripeCustomerId),
        hasActiveSubscription: user.plan !== "free" && user.subscriptionStatus === "active",
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function handleStripeWebhook(
  req: AuthenticatedRequest,
  res: Response,
  _next: NextFunction
): Promise<void> {
  const sig = req.headers["stripe-signature"];

  if (!sig || typeof sig !== "string") {
    billingLog.warn("Stripe webhook received without stripe-signature header");
    res.status(400).send("Missing stripe-signature header");
    return;
  }

  if (!env.STRIPE_WEBHOOK_SECRET) {
    billingLog.warn("STRIPE_WEBHOOK_SECRET is not configured in backend/.env");
    res.status(500).send("Webhook secret not configured on server");
    return;
  }

  const stripe = getStripe();
  let event: any;

  try {
    const payload = Buffer.isBuffer(req.body) ? req.body : Buffer.from(req.body);
    event = stripe.webhooks.constructEvent(payload, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    billingLog.error(`⚠️ Webhook signature verification failed: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    const result = await StripeService.handleWebhookEvent(event);
    res.status(200).json({ received: true, ...result });
  } catch (err: any) {
    billingLog.error("Error processing Stripe webhook event:", err);
    res.status(500).json({ received: false, error: err.message });
  }
}
