import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import {
  classifyRefreshAttempt,
  parseDurationMs,
} from "../../src/services/auth/refreshTokenPolicy.js";
import { googleAuthSchema, registerSchema } from "../../src/controllers/auth/authSchemas.js";

/**
 * Refresh token policy + Google sign-in contract.
 *
 * Runs without a database: these assert the decisions the controller makes and
 * the shape of the request the browser is allowed to send.
 */

const NOW = new Date("2026-03-01T12:00:00.000Z");

function inHours(hours: number): Date {
  return new Date(NOW.getTime() + hours * 3_600_000);
}

describe("parseDurationMs", () => {
  it("parses single units", () => {
    assert.equal(parseDurationMs("15m"), 900_000);
    assert.equal(parseDurationMs("7d"), 604_800_000);
    assert.equal(parseDurationMs("2h"), 7_200_000);
    assert.equal(parseDurationMs("30s"), 30_000);
  });

  it("treats a bare number as seconds, matching jsonwebtoken", () => {
    assert.equal(parseDurationMs("900"), 900_000);
    assert.equal(parseDurationMs("7"), 7_000);
  });

  it("parses compound durations", () => {
    assert.equal(parseDurationMs("1h30m"), 5_400_000);
  });

  it("rejects junk instead of silently returning 0", () => {
    for (const bad of ["", "abc", "0m", "5x", "m7", "1d2"]) {
      assert.throws(() => parseDurationMs(bad), `expected "${bad}" to be rejected`);
    }
  });
});

describe("classifyRefreshAttempt", () => {
  it("returns unknown when no row matches", () => {
    assert.equal(classifyRefreshAttempt(null, NOW), "unknown");
    assert.equal(classifyRefreshAttempt(undefined, NOW), "unknown");
  });

  it("returns valid for a live unrevoked token", () => {
    assert.equal(
      classifyRefreshAttempt({ revoked: false, expiresAt: inHours(1) }, NOW),
      "valid"
    );
  });

  it("returns expired when past its expiry", () => {
    assert.equal(
      classifyRefreshAttempt({ revoked: false, expiresAt: inHours(-1) }, NOW),
      "expired"
    );
  });

  it("returns revoked for a logout-revoked token", () => {
    // No replacedByHash: this was a clean logout, not a stolen-token replay.
    assert.equal(
      classifyRefreshAttempt(
        { revoked: true, expiresAt: inHours(1), familyId: "fam-1", replacedByHash: null },
        NOW
      ),
      "revoked"
    );
  });

  it("detects reuse when an already-rotated token is replayed", () => {
    assert.equal(
      classifyRefreshAttempt(
        {
          revoked: true,
          expiresAt: inHours(1),
          familyId: "fam-1",
          replacedByHash: "a".repeat(64),
        },
        NOW
      ),
      "reuse_detected"
    );
  });

  it("does not treat a replayed token as theft once it has expired", () => {
    // Guards against a permanent logout denial-of-service: an attacker holding an
    // old expired token must not be able to revoke a live session forever.
    assert.equal(
      classifyRefreshAttempt(
        {
          revoked: true,
          expiresAt: inHours(-1),
          familyId: "fam-1",
          replacedByHash: "a".repeat(64),
        },
        NOW
      ),
      "expired"
    );
  });

  it("needs both a replacement and a family to call it reuse", () => {
    // Legacy rows predate family tracking, so a replacement alone is not enough.
    assert.equal(
      classifyRefreshAttempt(
        {
          revoked: true,
          expiresAt: inHours(1),
          familyId: null,
          replacedByHash: "a".repeat(64),
        },
        NOW
      ),
      "revoked"
    );
  });

  it("accepts string dates from the database", () => {
    assert.equal(
      classifyRefreshAttempt(
        { revoked: false, expiresAt: inHours(1).toISOString() },
        NOW
      ),
      "valid"
    );
  });
});

describe("googleAuthSchema", () => {
  it("accepts an ID token", () => {
    const parsed = googleAuthSchema.safeParse({ idToken: "x".repeat(60) });
    assert.equal(parsed.success, true);
  });

  it("rejects a request without an ID token", () => {
    assert.equal(googleAuthSchema.safeParse({}).success, false);
  });

  it("rejects a too-short ID token", () => {
    assert.equal(googleAuthSchema.safeParse({ idToken: "abc" }).success, false);
  });

  it("carries no email, googleId, role or plan claim", () => {
    // The account-takeover fix depends on these never being authoritative.
    const parsed = googleAuthSchema.safeParse({
      idToken: "x".repeat(60),
      email: "victim@example.com",
      googleId: "attacker-sub",
      role: "admin",
      plan: "premium",
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.deepEqual(Object.keys(parsed.data), ["idToken"]);
    }
  });
});

describe("registerSchema", () => {
  it("does not allow self-assigning admin or developer", () => {
    for (const role of ["admin", "developer"]) {
      const parsed = registerSchema.safeParse({
        name: "Test User",
        email: "test@example.com",
        password: "Password1",
        role,
      });
      assert.equal(parsed.success, false, `role "${role}" must be rejected`);
    }
  });

  it("accepts the documented member and partner roles", () => {
    for (const role of ["member", "partner"]) {
      const parsed = registerSchema.safeParse({
        name: "Test User",
        email: "test@example.com",
        password: "Password1",
        role,
      });
      assert.equal(parsed.success, true, `role "${role}" must be accepted`);
    }
  });
});
