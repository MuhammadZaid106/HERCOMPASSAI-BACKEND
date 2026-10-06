import Stripe from "stripe";
import { env } from "./env.js";
import { logger } from "../utils/logger.js";

const stripeLog = logger.module("Stripe");

let stripeInstance: Stripe | null = null;

export function getStripe(): Stripe {
  if (!stripeInstance) {
    if (!env.STRIPE_SECRET_KEY || env.STRIPE_SECRET_KEY.trim() === "") {
      throw new Error(
        "STRIPE_SECRET_KEY is not configured in backend/.env. Please configure your Stripe Secret Key."
      );
    }
    stripeInstance = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: "2025-02-24.acacia" as any,
      typescript: true,
      appInfo: {
        name: "HerCompassAI",
        version: "1.0.0",
      },
    });
    stripeLog.info("✅ Stripe SDK client initialized");
  }
  return stripeInstance;
}

export function isStripeConfigured(): boolean {
  return Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.trim().length > 0);
}
