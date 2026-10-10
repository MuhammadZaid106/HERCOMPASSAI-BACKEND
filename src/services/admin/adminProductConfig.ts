import { AppSetting } from "../../models/index.js";
import { isStripeConfigured } from "../../config/stripe.js";
import { env } from "../../config/env.js";
import { mailIsConfigured } from "../mail/sendMail.js";

export const FOUNDING_CAP_KEY = "founding_women_cap";
export const TRIAL_DURATION_KEY = "trial_duration_days";
export const TRIAL_ELIGIBILITY_KEY = "trial_eligibility";
export const TRIAL_PLAN_KEY = "trial_plan";
export const PLUS_MONTHLY_LABEL_KEY = "plus_price_label_monthly";
export const PLUS_ANNUAL_LABEL_KEY = "plus_price_label_annual";
export const PREMIUM_MONTHLY_LABEL_KEY = "premium_price_label_monthly";
export const PREMIUM_ANNUAL_LABEL_KEY = "premium_price_label_annual";

export type TrialEligibility = "none" | "invite_only" | "all_free";

async function readSetting(key: string, fallback: string): Promise<string> {
  const row = await AppSetting.findByPk(key);
  const value = row?.value?.trim();
  return value && value.length > 0 ? value : fallback;
}

async function foundingCap(): Promise<number> {
  const parsed = Number(await readSetting(FOUNDING_CAP_KEY, "100"));
  if (!Number.isInteger(parsed) || parsed < 1) return 100;
  return parsed;
}

function priceIdSet(value: string): boolean {
  return value.trim().length > 0;
}

export interface AdminProductSettings {
  foundingCap: number;
  billingConnected: boolean;
  mailConfigured: boolean;
  trialDurationDays: number;
  trialEligibility: TrialEligibility;
  trialPlan: "premium";
  plusPriceLabelMonthly: string;
  plusPriceLabelAnnual: string;
  premiumPriceLabelMonthly: string;
  premiumPriceLabelAnnual: string;
  stripePriceIds: {
    plusMonthly: boolean;
    plusAnnual: boolean;
    premiumMonthly: boolean;
    premiumAnnual: boolean;
  };
}

export async function loadAdminSettings(): Promise<AdminProductSettings> {
  const eligibilityRaw = await readSetting(TRIAL_ELIGIBILITY_KEY, "none");
  const trialEligibility: TrialEligibility =
    eligibilityRaw === "invite_only" || eligibilityRaw === "all_free" ? eligibilityRaw : "none";
  const trialDays = Number(await readSetting(TRIAL_DURATION_KEY, "14"));
  return {
    foundingCap: await foundingCap(),
    billingConnected: isStripeConfigured(),
    mailConfigured: mailIsConfigured(),
    trialDurationDays: Number.isInteger(trialDays) && trialDays >= 0 && trialDays <= 365 ? trialDays : 14,
    trialEligibility,
    trialPlan: "premium",
    plusPriceLabelMonthly: await readSetting(PLUS_MONTHLY_LABEL_KEY, "Set at checkout"),
    plusPriceLabelAnnual: await readSetting(PLUS_ANNUAL_LABEL_KEY, "Set at checkout"),
    premiumPriceLabelMonthly: await readSetting(PREMIUM_MONTHLY_LABEL_KEY, "Set at checkout"),
    premiumPriceLabelAnnual: await readSetting(PREMIUM_ANNUAL_LABEL_KEY, "Set at checkout"),
    stripePriceIds: {
      plusMonthly: priceIdSet(env.STRIPE_PLUS_PRICE_ID_MONTHLY),
      plusAnnual: priceIdSet(env.STRIPE_PLUS_PRICE_ID_ANNUAL),
      premiumMonthly: priceIdSet(env.STRIPE_PREMIUM_PRICE_ID_MONTHLY),
      premiumAnnual: priceIdSet(env.STRIPE_PREMIUM_PRICE_ID_ANNUAL),
    },
  };
}

export interface SaveAdminSettingsInput {
  foundingCap: number;
  trialDurationDays: number;
  trialEligibility: TrialEligibility;
  plusPriceLabelMonthly: string;
  plusPriceLabelAnnual: string;
  premiumPriceLabelMonthly: string;
  premiumPriceLabelAnnual: string;
}

export async function saveAdminSettings(input: SaveAdminSettingsInput): Promise<AdminProductSettings> {
  await Promise.all([
    AppSetting.upsert({ key: FOUNDING_CAP_KEY, value: String(input.foundingCap) }),
    AppSetting.upsert({ key: TRIAL_DURATION_KEY, value: String(input.trialDurationDays) }),
    AppSetting.upsert({ key: TRIAL_ELIGIBILITY_KEY, value: input.trialEligibility }),
    AppSetting.upsert({ key: TRIAL_PLAN_KEY, value: "premium" }),
    AppSetting.upsert({ key: PLUS_MONTHLY_LABEL_KEY, value: input.plusPriceLabelMonthly.slice(0, 80) }),
    AppSetting.upsert({ key: PLUS_ANNUAL_LABEL_KEY, value: input.plusPriceLabelAnnual.slice(0, 80) }),
    AppSetting.upsert({ key: PREMIUM_MONTHLY_LABEL_KEY, value: input.premiumPriceLabelMonthly.slice(0, 80) }),
    AppSetting.upsert({ key: PREMIUM_ANNUAL_LABEL_KEY, value: input.premiumPriceLabelAnnual.slice(0, 80) }),
  ]);
  return loadAdminSettings();
}

export async function saveFoundingCap(cap: number): Promise<number> {
  await AppSetting.upsert({ key: FOUNDING_CAP_KEY, value: String(cap) });
  return cap;
}
