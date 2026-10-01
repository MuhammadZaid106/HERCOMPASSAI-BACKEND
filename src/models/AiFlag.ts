import {
  Model,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { AiAuditLog } from "./AiAuditLog.js";

/**
 * AI flag — the internal review queue.
 *
 * Negative feedback and "report concern" responses land here for human-in-the-loop
 * review. A flag is the entry point into evaluation data; it never auto-trains a
 * model (spec Step 67).
 */
export class AiFlag extends Model<
  InferAttributes<AiFlag>,
  InferCreationAttributes<AiFlag>
> {
  declare id: CreationOptional<string>;
  declare requestId: string;
  declare userId: string;
  declare feature: string;
  declare reason: "user_not_helpful" | "user_report_concern" | "sci_blocked" | "guardrail_blocked" | "manual";
  declare severity: "low" | "medium" | "high";
  declare detail: CreationOptional<string | null>;
  declare reviewStatus: "open" | "in_review" | "resolved" | "dismissed";
  declare reviewedBy: CreationOptional<string | null>;
  declare reviewedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;

  /**
   * The AI event this flag points at, when loaded via include.
   *
   * A reviewer needs it to see which citations the generation used and how it was
   * classified, so `listReviewQueue` eager-loads it. Optional because it is absent
   * unless that include is present.
   */
  declare aiEvent?: AiAuditLog;
}

AiFlag.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Both identifiers match ai_audit_logs so a reviewer can open the exact
    // request that was flagged. The foreign key also means a flag cannot outlive
    // the account it describes.
    requestId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "ai_audit_logs", key: "requestId" },
      onDelete: "CASCADE",
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    feature: { type: DataTypes.STRING(64), allowNull: false },
    reason: {
      type: DataTypes.ENUM(
        "user_not_helpful",
        "user_report_concern",
        "sci_blocked",
        "guardrail_blocked",
        "manual"
      ),
      allowNull: false,
    },
    severity: {
      type: DataTypes.ENUM("low", "medium", "high"),
      allowNull: false,
      defaultValue: "medium",
    },
    detail: { type: DataTypes.STRING(1000), allowNull: true },
    reviewStatus: {
      type: DataTypes.ENUM("open", "in_review", "resolved", "dismissed"),
      allowNull: false,
      defaultValue: "open",
    },
    reviewedBy: { type: DataTypes.STRING(255), allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "ai_flags",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ["reviewStatus", "severity"] },
      { fields: ["requestId"] },
    ],
  }
);
