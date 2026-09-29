/**
 * Run: pnpm exec tsx src/services/member/planCatalog.test.ts
 */
import assert from "node:assert/strict";
import { planComparison, planSummaries, resolveMemberPlan } from "./planCatalog.js";

assert.deepEqual(
  planSummaries.map((plan) => plan.summary),
  [
    "Basic recommendations.",
    "Personalized wellness plans.",
    "Multi-week adaptive plans.",
  ],
);
assert.equal(planComparison.some((item) => /\$|price|month/i.test(item.label)), false);
assert.equal(resolveMemberPlan("plus"), "plus");
assert.equal(resolveMemberPlan("unknown"), "free");
assert.equal(planComparison.find((item) => item.id === "partner")?.access.free, "limited");

console.log("[OK] plan catalog checks passed");
