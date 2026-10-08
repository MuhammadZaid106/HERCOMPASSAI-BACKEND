import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountStatus,
  countsForInvites,
  formatDuration,
  medianSeconds,
  fillDayCounts,
  firstName,
  likePattern,
  partnerStateForUser,
  scopeList,
  utcDayKeys,
} from "../../src/services/admin/adminPresent.js";

describe("admin presentation", () => {
  it("keeps a search for a percent sign from matching every name", () => {
    assert.equal(likePattern("100%"), "%100\\%%");
    assert.equal(likePattern("a_b"), "%a\\_b%");
  });

  it("uses the first word of a member name", () => {
    assert.equal(firstName("Maria Alvarez"), "Maria");
    assert.equal(firstName("  "), "Member");
  });

  it("fills missing days with zero and keeps the window length", () => {
    const keys = utcDayKeys(3, new Date("2026-10-06T15:00:00.000Z"));
    assert.deepEqual(keys, ["2026-10-04", "2026-10-05", "2026-10-06"]);
    const filled = fillDayCounts(keys, [{ day: "2026-10-05", count: 2 }]);
    assert.deepEqual(filled, [
      { day: "2026-10-04", count: 0 },
      { day: "2026-10-05", count: 2 },
      { day: "2026-10-06", count: 0 },
    ]);
  });

  it("takes the middle duration and writes it as days, hours, and minutes", () => {
    assert.equal(medianSeconds([]), null);
    assert.equal(medianSeconds([30, 10, 20]), 20);
    assert.equal(medianSeconds([10, 30]), 20);
    assert.equal(formatDuration(0), "0m");
    assert.equal(formatDuration(125), "2m");
    assert.equal(formatDuration(3 * 3600 + 42 * 60), "3h 42m");
    assert.equal(formatDuration(2 * 86400), "2d");
  });

  it("reads account confirmation and the latest invite only", () => {
    assert.equal(accountStatus(true), "confirmed");
    assert.equal(accountStatus(false), "unconfirmed");
    const state = partnerStateForUser("user-1", [
      {
        memberUserId: "user-1",
        partnerUserId: null,
        status: "sent",
        updatedAt: new Date("2026-10-01T00:00:00.000Z"),
      },
      {
        memberUserId: "user-1",
        partnerUserId: "partner-1",
        status: "accepted",
        updatedAt: new Date("2026-10-04T00:00:00.000Z"),
      },
    ]);
    assert.equal(state, "accepted");
  });

  it("drops unknown share topics and maps the old digest name", () => {
    assert.deepEqual(
      scopeList(["digest_summary", "shared_activities", "sleep_logs", "shared_activities"]),
      ["general_support", "shared_activities"],
    );
    assert.deepEqual(
      countsForInvites([{ status: "accepted", count: 3 }]).map((row) => row.count),
      [0, 3, 0, 0],
    );
  });
});