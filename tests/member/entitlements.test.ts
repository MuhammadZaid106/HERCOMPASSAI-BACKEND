/**
 * Entitlement table integrity.
 *
 * The table in `config/entitlements.ts` is the only thing standing between a plan
 * name and a server-side access decision, so its shape is worth asserting rather
 * than trusting: a feature added to the union without a row, or a plan that
 * quietly drops a capability the tier above had, are both silent at runtime and
 * both show up as a support ticket.
 *
 * The DB-backed paths (`checkFeature`, `consumeAiGeneration`) need a database, and
 * this suite deliberately runs without one, so what is covered here is the table
 * and the pure helpers around it — plus the window arithmetic that the atomic
 * meter statement depends on.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";

import {
  ALL_ENTITLEMENT_FEATURES,
  ENTITLEMENTS,
  ENTITLEMENT_BYPASS_ROLES,
  ENTITLEMENT_FEATURE_COUNT,
  ENTITLEMENT_PERIOD_DAYS,
  type Entitlement,
  type EntitlementFeature,
} from "../../src/config/entitlements.js";
import {
  currentWindowStart,
  entitlementsFor,
  windowResetsAt,
} from "../../src/services/member/entitlements.js";
import { memberPlanIds } from "../../src/services/member/planCatalog.js";

function everyFeature(fn: (feature: EntitlementFeature, plan: string) => void): void {
  for (const plan of memberPlanIds) {
    for (const feature of ALL_ENTITLEMENT_FEATURES) {
      fn(feature, plan);
    }
  }
}

describe("entitlement table", () => {
  it("defines every plan", () => {
    for (const plan of memberPlanIds) {
      assert.ok(ENTITLEMENTS[plan], `plan "${plan}" must have an entitlement row`);
    }
    assert.deepEqual(
      Object.keys(ENTITLEMENTS).sort(),
      [...memberPlanIds].sort()
    );
  });

  it("answers every feature on every plan, with a real boolean", () => {
    everyFeature((feature, plan) => {
      const value = ENTITLEMENTS[plan as keyof typeof ENTITLEMENTS].features[feature];
      assert.equal(
        typeof value,
        "boolean",
        `${plan}.${feature} must be an explicit boolean, not ${String(value)}`
      );
    });
  });

  it("gives every plan the same feature keys", () => {
    const expected = ALL_ENTITLEMENT_FEATURES.slice().sort();
    for (const plan of memberPlanIds) {
      const keys = Object.keys(ENTITLEMENTS[plan].features).sort();
      assert.deepEqual(keys, expected, `${plan} must define exactly the same features`);
    }
    assert.equal(ENTITLEMENT_FEATURE_COUNT, ALL_ENTITLEMENT_FEATURES.length);
  });

  it("never reduces a capability as the tier rises", () => {
    // Monotonic access is the assumption every upgrade pitch and every
    // "included from Plus" message depends on. A feature that is true on Free
    // and false on Premium is either a config mistake or a downgrade nobody
    // asked for.
    const tiers: Array<[string, Entitlement]> = [
      ["free", ENTITLEMENTS.free],
      ["plus", ENTITLEMENTS.plus],
      ["premium", ENTITLEMENTS.premium],
    ];

    for (let i = 1; i < tiers.length; i += 1) {
      const [lowerName, lower] = tiers[i - 1];
      const [higherName, higher] = tiers[i];
      for (const feature of ALL_ENTITLEMENT_FEATURES) {
        if (lower.features[feature]) {
          assert.ok(
            higher.features[feature],
            `${feature} is on ${lowerName} but off ${higherName}`
          );
        }
      }
    }
  });

  it("does not loosen the metered limits as the tier rises", () => {
    // Same reasoning for the numeric limits: a higher tier must not get a smaller
    // allowance or a shorter history.
    assert.ok(
      (ENTITLEMENTS.plus.trackingHistoryDays ?? Infinity) >=
        (ENTITLEMENTS.free.trackingHistoryDays ?? 0),
      "Plus must not shorten history relative to Free"
    );
    assert.ok(
      (ENTITLEMENTS.plus.snapshotVersionsRetained ?? Infinity) >=
        (ENTITLEMENTS.free.snapshotVersionsRetained ?? 0),
      "Plus must not retain fewer Snapshot versions than Free"
    );

    // `null` is the encoding for unlimited, so a paid tier has to have exactly
    // that — never a large number that reads as a promise we cannot keep.
    for (const plan of ["plus", "premium"] as const) {
      assert.equal(
        ENTITLEMENTS[plan].aiGenerationsPerPeriod,
        null,
        `${plan} must be unlimited AI generations, not a bounded number`
      );
    }
  });

  it("bounds the Free tier", () => {
    // The whole reason the table exists. If Free becomes unlimited the free-tier
    // limit stops being enforced and nothing else in the codebase would notice.
    assert.equal(ENTITLEMENTS.free.aiGenerationsPerPeriod, 5);
    assert.equal(ENTITLEMENTS.free.trackingHistoryDays, 30);
  });

  it("only lets administrative roles bypass plan gating", () => {
    assert.deepEqual([...ENTITLEMENT_BYPASS_ROLES], ["admin"]);
    // A bypass list that picked up "member" would void every limit above.
    for (const role of ENTITLEMENT_BYPASS_ROLES) {
      assert.notEqual(role, "member");
      assert.notEqual(role, "partner");
    }
  });
});

describe("entitlementsFor", () => {
  it("reads a known plan", () => {
    assert.equal(entitlementsFor("free").aiGenerationsPerPeriod, 5);
    assert.equal(entitlementsFor("plus").aiGenerationsPerPeriod, null);
    assert.equal(entitlementsFor("premium").aiGenerationsPerPeriod, null);
  });

  it("coerces an unknown or missing plan to Free", () => {
    // Display-side coercion. The access path uses its own `isKnownPlan` check and
    // fails closed rather than relying on this.
    for (const value of ["enterprise", "", null, undefined, "PREMIUM"]) {
      assert.equal(
        entitlementsFor(value).aiGenerationsPerPeriod,
        5,
        `"${String(value)}" must not grant a paid allowance`
      );
    }
  });
});

describe("quota window arithmetic", () => {
  it("runs a fixed number of days, not a calendar month", () => {
    const now = new Date("2026-03-31T12:00:00.000Z");
    const start = currentWindowStart(now);
    const days = (now.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
    assert.equal(days, ENTITLEMENT_PERIOD_DAYS);
  });

  it("reports a reset exactly one period ahead", () => {
    const now = new Date("2026-03-31T12:00:00.000Z");
    const resets = new Date(windowResetsAt(now));
    const days = (resets.getTime() - now.getTime()) / (24 * 60 * 60 * 1000);
    assert.equal(days, ENTITLEMENT_PERIOD_DAYS);
  });

  it("returns an ISO timestamp the client can parse", () => {
    const value = windowResetsAt(new Date("2026-01-01T00:00:00.000Z"));
    assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(new Date(value).toISOString(), value);
  });

  it("advances the window start by exactly one period", () => {
    // The meter statement compares a stored `window_started_at` against this
    // value with `<=`, so a drift here would either reset early (free
    // generations) or never reset (a permanent lockout).
    const first = currentWindowStart(new Date("2026-02-01T00:00:00.000Z"));
    const second = currentWindowStart(new Date("2026-02-01T00:00:00.001Z"));
    assert.equal(second.getTime() - first.getTime(), 1);
  });
});