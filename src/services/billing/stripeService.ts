import type Stripe from "stripe";
import { getStripe } from "../../config/stripe.js";
import { env } from "../../config/env.js";
import { User } from "../../models/User.js";
import { logger } from "../../utils/logger.js";
import { recordBillingEvent } from "./recordBillingEvent.js";

const stripeLog = logger.module("StripeService");

export interface CreateCheckoutInput {
  userId: string;
  plan: "plus" | "premium";
  interval?: "month" | "year";
  successUrl?: string;
  cancelUrl?: string;
}

export interface CheckoutResult {
  sessionId: string;
  url: string | null;
}

export interface PortalResult {
  url: string;
}

const DEFAULT_PRICING: Record<"plus" | "premium", { month: number; year: number }> = {
  plus: {
    month: 1299,
    year: 11988,
  },
  premium: {
    month: 1999,
    year: 19188,
  },
};

export class StripeService {
  private static getPriceId(plan: "plus" | "premium", interval: "month" | "year"): string | null {
    if (plan === "plus") {
      const id = interval === "year" ? env.STRIPE_PLUS_PRICE_ID_ANNUAL : env.STRIPE_PLUS_PRICE_ID_MONTHLY;
      return id && id.trim().length > 0 ? id.trim() : null;
    }
    if (plan === "premium") {
      const id = interval === "year" ? env.STRIPE_PREMIUM_PRICE_ID_ANNUAL : env.STRIPE_PREMIUM_PRICE_ID_MONTHLY;
      return id && id.trim().length > 0 ? id.trim() : null;
    }
    return null;
  }

  public static async getOrCreateCustomer(user: User): Promise<string> {
    const stripe = getStripe();

    if (user.stripeCustomerId && user.stripeCustomerId.trim().length > 0) {
      return user.stripeCustomerId;
    }

    const existing = await stripe.customers.list({
      email: user.email,
      limit: 1,
    });

    if (existing.data.length > 0) {
      const customerId = existing.data[0].id;
      user.stripeCustomerId = customerId;
      await user.save();
      return customerId;
    }

    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: {
        userId: user.id,
      },
    });

    user.stripeCustomerId = customer.id;
    await user.save();
    return customer.id;
  }

  public static async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutResult> {
    const stripe = getStripe();
    const user = await User.findByPk(input.userId);
    if (!user) {
      throw new Error(`User with ID ${input.userId} not found`);
    }

    const interval = input.interval === "year" ? "year" : "month";
    const customerId = await this.getOrCreateCustomer(user);

    const fallbackFrontend = env.FRONTEND_URL || env.CORS_ORIGIN.split(",")[0] || "http://localhost:3000";
    const successUrl =
      input.successUrl ||
      env.STRIPE_SUCCESS_URL ||
      `${fallbackFrontend}/app/plans?session_id={CHECKOUT_SESSION_ID}&status=success`;
    const cancelUrl =
      input.cancelUrl ||
      env.STRIPE_CANCEL_URL ||
      `${fallbackFrontend}/app/plans?status=cancelled`;

    const priceId = this.getPriceId(input.plan, interval);

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = priceId
      ? [{ price: priceId, quantity: 1 }]
      : [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `HerCompassAI ${input.plan.charAt(0).toUpperCase() + input.plan.slice(1)} Membership`,
                description:
                  input.plan === "plus"
                    ? "Full Men's Academy, Consented Partner Digest, Adaptive Nutrition Radar & unlimited tracking"
                    : "Complete Couple Intelligence, Predictive Forecasting & Personalized Multi-week Plans",
              },
              unit_amount: DEFAULT_PRICING[input.plan][interval],
              recurring: {
                interval: interval === "year" ? "year" : "month",
              },
            },
            quantity: 1,
          },
        ];

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      metadata: {
        userId: user.id,
        plan: input.plan,
        interval,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          plan: input.plan,
          interval,
        },
      },
      allow_promotion_codes: true,
    });

    stripeLog.info(`Created Checkout Session ${session.id} for user ${user.id} (plan: ${input.plan})`);

    return {
      sessionId: session.id,
      url: session.url,
    };
  }

  public static async createCustomerPortalSession(userId: string, returnUrl?: string): Promise<PortalResult> {
    const stripe = getStripe();
    const user = await User.findByPk(userId);
    if (!user) {
      throw new Error(`User with ID ${userId} not found`);
    }

    if (!user.stripeCustomerId) {
      throw new Error("No Stripe customer found for this account. You must start a subscription first.");
    }

    const fallbackFrontend = env.FRONTEND_URL || env.CORS_ORIGIN.split(",")[0] || "http://localhost:3000";
    const resolvedReturnUrl = returnUrl || `${fallbackFrontend}/app/plans`;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: resolvedReturnUrl,
    });

    return { url: portalSession.url };
  }

  public static async handleWebhookEvent(event: Stripe.Event): Promise<{ handled: boolean; message: string }> {
    stripeLog.info(`Processing Stripe webhook event: ${event.type} [${event.id}]`);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        const targetPlan = (session.metadata?.plan as "plus" | "premium") || "plus";
        const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        let resolvedUserId: string | null = userId ?? null;
        if (userId) {
          const user = await User.findByPk(userId);
          if (user) {
            user.plan = targetPlan;
            if (customerId) user.stripeCustomerId = customerId;
            if (subscriptionId) user.stripeSubscriptionId = subscriptionId;
            user.subscriptionStatus = "active";
            await user.save();
            resolvedUserId = user.id;
            stripeLog.info(`✅ User ${userId} upgraded to ${targetPlan} via Checkout Session`);
          }
        }
        await recordBillingEvent({
          event,
          userId: resolvedUserId,
          status: "paid",
          plan: targetPlan,
          summary: `Checkout completed for ${targetPlan}`,
        });
        return { handled: true, message: "Checkout session completed" };
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer?.id;
        const status = subscription.status;
        const metadataPlan = subscription.metadata?.plan as "plus" | "premium" | undefined;

        let user = await User.findOne({ where: { stripeSubscriptionId: subscription.id } });
        if (!user && customerId) {
          user = await User.findOne({ where: { stripeCustomerId: customerId } });
        }

        if (user) {
          user.stripeSubscriptionId = subscription.id;
          user.subscriptionStatus = status;

          if (status === "active" || status === "trialing") {
            if (metadataPlan) {
              user.plan = metadataPlan;
            }
            if (status === "trialing" && subscription.trial_end) {
              user.trialEndsAt = new Date(subscription.trial_end * 1000);
            }
          } else if (status === "canceled" || status === "unpaid") {
            user.plan = "free";
            user.trialEndsAt = null;
          }
          await user.save();
          stripeLog.info(`✅ Subscription ${subscription.id} updated. User ${user.id} status=${status} plan=${user.plan}`);
          let billingStatus: "active" | "trialing" | "past_due" | "canceled" | "other" = "other";
          if (status === "active") billingStatus = "active";
          else if (status === "trialing") billingStatus = "trialing";
          else if (status === "past_due") billingStatus = "past_due";
          else if (status === "canceled") billingStatus = "canceled";
          await recordBillingEvent({
            event,
            userId: user.id,
            status: billingStatus,
            plan: user.plan,
            summary: `Subscription updated to ${status}`,
          });
        }
        return { handled: true, message: "Subscription updated" };
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const user = await User.findOne({ where: { stripeSubscriptionId: subscription.id } });

        if (user) {
          user.plan = "free";
          user.subscriptionStatus = "canceled";
          user.stripeSubscriptionId = null;
          user.trialEndsAt = null;
          await user.save();
          stripeLog.info(`✅ Subscription ${subscription.id} deleted. User ${user.id} downgraded to free.`);
          await recordBillingEvent({
            event,
            userId: user.id,
            status: "canceled",
            plan: "free",
            summary: "Subscription deleted; member moved to Free",
          });
        }
        return { handled: true, message: "Subscription deleted" };
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        let userId: string | null = null;
        if (customerId) {
          const user = await User.findOne({ where: { stripeCustomerId: customerId } });
          if (user) {
            userId = user.id;
            if (user.subscriptionStatus !== "active") {
              user.subscriptionStatus = "active";
              await user.save();
            }
          }
        }
        await recordBillingEvent({
          event,
          userId,
          status: "paid",
          amountCents: typeof invoice.amount_paid === "number" ? invoice.amount_paid : null,
          currency: invoice.currency ?? null,
          summary: "Invoice payment succeeded",
        });
        return { handled: true, message: "Invoice payment succeeded" };
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
        let userId: string | null = null;
        if (customerId) {
          const user = await User.findOne({ where: { stripeCustomerId: customerId } });
          if (user) {
            userId = user.id;
            user.subscriptionStatus = "past_due";
            await user.save();
            stripeLog.warn(`⚠️ Invoice payment failed for user ${user.id} (customer: ${customerId})`);
          }
        }
        await recordBillingEvent({
          event,
          userId,
          status: "failed",
          amountCents: typeof invoice.amount_due === "number" ? invoice.amount_due : null,
          currency: invoice.currency ?? null,
          summary: "Invoice payment failed",
        });
        return { handled: true, message: "Invoice payment failed" };
      }

      default:
        stripeLog.debug(`Unhandled event type: ${event.type}`);
        return { handled: true, message: `Event ${event.type} ignored` };
    }
  }
}
