import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  meditationIncluded,
  orderedSessions,
  suggestionFor,
} from "../../src/services/member/meditationCatalog.js";
import {
  communityPostAllowed,
  memberCanReadNote,
  parseCommunityNote,
  presentMemberNote,
} from "../../src/services/member/communityBoard.js";

describe("meditation library", () => {
  it("lets a free member open one session", () => {
    const items = orderedSessions({ plan: "free", meditationFrequency: "never", focus: "Sleep deeply through the night" });
    const open = items.filter((item) => meditationIncluded("free", item));
    assert.equal(open.length, 1);
    assert.equal(open[0]?.slug, "five-minute-evening-reset");
    assert.equal(items.length, 3);
  });

  it("lets Plus open all three sessions", () => {
    const items = orderedSessions({ plan: "plus", meditationFrequency: "rarely", focus: null });
    assert.equal(items.filter((item) => meditationIncluded("plus", item)).length, 3);
  });

  it("keeps the evening reset first when practice is already regular", () => {
    const suggestion = suggestionFor({
      plan: "plus",
      meditationFrequency: "daily",
      focus: "Sleep deeply through the night",
    });
    assert.equal(suggestion.slug, "five-minute-evening-reset");
    assert.equal(orderedSessions({
      plan: "plus",
      meditationFrequency: "weekly",
      focus: "Sleep deeply through the night",
    })[0]?.slug, "five-minute-evening-reset");
  });

  it("lists the sleep session first for Plus when the Snapshot focus is sleep", () => {
    const ordered = orderedSessions({
      plan: "premium",
      meditationFrequency: "never",
      focus: "Sleep deeply through the night",
    });
    assert.equal(ordered[0]?.slug, "ten-minute-wind-down");
  });
});

describe("community notes", () => {
  const pending = {
    id: "note-1",
    userId: "member-a",
    topic: "sleep" as const,
    body: "Evenings have been quieter this week.",
    status: "pending" as const,
    authorName: "Amina Shah",
  };

  it("hides a pending note from other members", () => {
    assert.equal(memberCanReadNote(pending, "member-b"), false);
    assert.equal(presentMemberNote(pending, "member-b"), null);
  });

  it("shows an approved note with a first name and no account details", () => {
    const view = presentMemberNote({ ...pending, status: "approved" }, "member-b");
    assert.ok(view);
    assert.equal(view?.firstName, "Amina");
    assert.equal(view?.body, pending.body);
    const serialized = JSON.stringify(view);
    assert.equal(serialized.includes("email"), false);
    assert.equal(serialized.includes("Amina Shah"), false);
    assert.equal(serialized.includes("symptom"), false);
    assert.equal(serialized.includes("score"), false);
  });

  it("refuses a partner post and an empty note", () => {
    assert.equal(communityPostAllowed("partner"), false);
    assert.equal(communityPostAllowed("member"), true);
    const empty = parseCommunityNote({ topic: "sleep", body: "   " });
    assert.equal(empty.ok, false);
    const tooLong = parseCommunityNote({ topic: "mood", body: "a".repeat(281) });
    assert.equal(tooLong.ok, false);
  });
});
