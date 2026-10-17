import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import "../setupEnv.js";
import { User } from "../../src/models/index.js";
import { startMemberTrial, getMemberTrialStatus } from "../../src/controllers/member/memberController.js";
import type { AuthenticatedRequest } from "../../src/middleware/authMiddleware.js";
import type { Response } from "express";

function makeMockResponse() {
  const res: Partial<Response> & {
    statusCode?: number;
    body?: any;
  } = {
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(payload: any) {
      this.body = payload;
      return this as Response;
    },
  };
  return res as Response & { statusCode: number; body: any };
}

describe("Trial Architecture & Endpoints (Step 50)", () => {
  let mockUser: any;

  beforeEach(() => {
    mockUser = {
      id: "member-trial-test-uuid",
      plan: "free",
      subscriptionStatus: "active",
      trialEndsAt: null,
      save: async () => {},
    };
    // Mock User.findByPk
    User.findByPk = async (id: any) => {
      if (id === mockUser.id) return mockUser;
      return null;
    };
  });

  it("activates a 14-day Premium trial for an eligible free member", async () => {
    const req = {
      user: { userId: mockUser.id, role: "member" },
      body: {},
    } as unknown as AuthenticatedRequest;

    const res = makeMockResponse();
    let nextCalled = false;
    await startMemberTrial(req, res, () => { nextCalled = true; });

    assert.equal(nextCalled, false);
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.plan, "premium");
    assert.equal(res.body.data.subscriptionStatus, "trialing");
    assert.equal(res.body.data.daysRemaining, 14);
    assert.ok(mockUser.trialEndsAt instanceof Date);
    assert.equal(mockUser.plan, "premium");
  });

  it("is idempotent when trial is already currently active", async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    mockUser.plan = "premium";
    mockUser.subscriptionStatus = "trialing";
    mockUser.trialEndsAt = futureDate;

    const req = {
      user: { userId: mockUser.id, role: "member" },
      body: {},
    } as unknown as AuthenticatedRequest;

    const res = makeMockResponse();
    await startMemberTrial(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.alreadyActive, true);
    assert.ok(res.body.data.daysRemaining >= 9);
  });

  it("reports accurate trial status and eligibility", async () => {
    mockUser.plan = "free";
    mockUser.subscriptionStatus = "active";
    mockUser.trialEndsAt = null;

    const req = {
      user: { userId: mockUser.id, role: "member" },
    } as unknown as AuthenticatedRequest;

    const res = makeMockResponse();
    await getMemberTrialStatus(req, res, () => {});

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data.eligibleForTrial, true);
    assert.equal(res.body.data.isTrialActive, false);
    assert.equal(res.body.data.daysRemaining, 0);
  });
});
