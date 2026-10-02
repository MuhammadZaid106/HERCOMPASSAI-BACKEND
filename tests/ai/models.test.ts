import assert from "node:assert/strict";
import { describe, it } from "node:test";
import "../setupEnv.js";
import { AiAuditLog, AiFeedback, AiFlag, User } from "../../src/models/index.js";

/**
 * Schema invariants for the AI audit tables.
 *
 * The suite runs without a database, so these assert the declared shape instead.
 * They matter because `sync({ alter: false })` will build these tables on first
 * deploy, and a wrong identifier type or a missing cascade becomes permanent
 * personal data no one can delete later.
 */

type AttributeShape = {
  type: { key: string };
  allowNull: boolean;
  references?: { model: string; key: string };
  onDelete?: string;
};

function attribute(model: typeof AiFlag, field: string): AttributeShape {
  const attributes = model.getAttributes() as unknown as Record<string, AttributeShape>;
  const shape = attributes[field];
  assert.ok(shape, `${model.name} is missing the "${field}" column`);
  return shape;
}

describe("AI audit schema", () => {
  it("stores request identifiers as UUIDs in every AI table", () => {
    // A free-form string here would silently break the join between a flag, its
    // feedback and the audit event they describe.
    for (const model of [AiAuditLog, AiFeedback, AiFlag]) {
      assert.equal(
        attribute(model, "requestId").type.key,
        "UUID",
        `${model.name}.requestId must be a UUID`
      );
    }
  });

  it("stores user identifiers as UUIDs in every AI table", () => {
    for (const model of [AiAuditLog, AiFeedback, AiFlag]) {
      assert.equal(
        attribute(model, "userId").type.key,
        "UUID",
        `${model.name}.userId must be a UUID`
      );
    }
  });

  it("makes ai_audit_logs.request_id a unique foreign-key target", () => {
    // The index names the database column request_id.
    const options = AiAuditLog.options as unknown as {
      indexes?: Array<{ fields: string[] | string; unique?: boolean }>;
    };
    const indexes = options.indexes ?? [];

    const uniqueOnRequestId = indexes.some(
      (index) => index.unique === true && [index.fields].flat().includes("request_id")
    );

    assert.ok(
      uniqueOnRequestId,
      "ai_flags.request_id references ai_audit_logs.request_id, which must be unique"
    );
  });

  it("cascades every AI record away with the user", () => {
    for (const model of [AiAuditLog, AiFeedback, AiFlag]) {
      const userId = attribute(model, "userId");
      assert.equal(userId.references?.model, "users", `${model.name}.userId must reference users`);
      assert.equal(
        userId.onDelete,
        "CASCADE",
        `${model.name} must not outlive the account it describes`
      );
    }
  });

  it("ties a flag to the exact AI event it was raised against", () => {
    const requestId = attribute(AiFlag, "requestId");

    assert.equal(requestId.references?.model, "ai_audit_logs");
    assert.equal(requestId.references?.key, "request_id");
    assert.equal(requestId.onDelete, "CASCADE");
  });

  it("declares the associations sync needs to order table creation", () => {
    // Without both sides declared, sync() has no dependency graph for the flag
    // table and the foreign keys can fail to create.
    for (const association of ["aiFlags", "aiAuditLogs", "aiFeedback"]) {
      assert.ok(
        (User.associations as Record<string, unknown>)[association],
        `User is missing the "${association}" association`
      );
    }

    assert.ok(
      (AiAuditLog.associations as Record<string, unknown>).flags,
      "AiAuditLog is missing the \"flags\" association"
    );
    assert.ok(
      (AiFlag.associations as Record<string, unknown>).aiEvent,
      "AiFlag is missing the \"aiEvent\" association"
    );
  });
});
