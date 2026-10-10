import type Stripe from "stripe";
import { BillingEvent, type BillingEventStatus } from "../../models/BillingEvent.js";
import { logger } from "../../utils/logger.js";

const log = logger.module("BILLING-EVENT");

function occurredAt(event: Stripe.Event): Date {
  return new Date((event.created || Math.floor(Date.now() / 1000)) * 1000);
}

export async function recordBillingEvent(input: {
  event: Stripe.Event;
  userId?: string | null;
  status: BillingEventStatus;
  plan?: "free" | "plus" | "premium" | null;
  amountCents?: number | null;
  currency?: string | null;
  summary: string;
}): Promise<void> {
  try {
    await BillingEvent.findOrCreate({
      where: { stripeEventId: input.event.id },
      defaults: {
        stripeEventId: input.event.id,
        userId: input.userId ?? null,
        type: input.event.type,
        status: input.status,
        plan: input.plan ?? null,
        amountCents: input.amountCents ?? null,
        currency: input.currency ?? null,
        occurredAt: occurredAt(input.event),
        summary: input.summary.slice(0, 280),
      },
    });
  } catch (error) {
    log.warn(`Could not persist billing event ${input.event.id}: ${String(error)}`);
  }
}
