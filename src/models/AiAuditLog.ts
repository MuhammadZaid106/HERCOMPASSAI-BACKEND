import {
  Model,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { User } from "./User.js";

/**
 * AI audit log (spec Step 25).
 *
 * Provenance only. Raw prompts, raw completions and member health data are
 * deliberately NOT stored here — the spec requires traceability without
 * accumulating sensitive records.
 */
export class AiAuditLog extends Model<
  InferAttributes<AiAuditLog>,
  InferCreationAttributes<AiAuditLog>
> {
  declare id: CreationOptional<string>;
  declare requestId: string;
  declare userId: ForeignKey<User["id"]>;
  declare userRole: string;
  declare feature: string;
  declare provider: CreationOptional<string | null>;
  declare model: CreationOptional<string | null>;
  declare modelVersion: CreationOptional<string | null>;
  declare promptVersion: string;
  declare promptChecksum: CreationOptional<string | null>;
  declare evidenceVersion: string;
  declare sciVersion: string;
  declare configVersion: string;
  declare resultStatus: "approved" | "approved_with_repairs" | "fallback" | "blocked";
  declare confidence: CreationOptional<string | null>;
  declare confidenceScore: CreationOptional<number | null>;
  declare safetyStatus: "pass" | "pass_with_warnings" | "blocked";
  declare latencyMs: number;
  declare attemptCount: CreationOptional<number>;
  declare fallbackUsed: CreationOptional<boolean>;
  declare citationIds: CreationOptional<string[]>;
  declare sciFindingCodes: CreationOptional<string[]>;
  declare createdAt: CreationOptional<Date>;
}

AiAuditLog.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    userRole: { type: DataTypes.STRING(32), allowNull: false },
    feature: { type: DataTypes.STRING(64), allowNull: false },
    provider: { type: DataTypes.STRING(64), allowNull: true },
    model: { type: DataTypes.STRING(255), allowNull: true },
    modelVersion: { type: DataTypes.STRING(128), allowNull: true },
    promptVersion: { type: DataTypes.STRING(32), allowNull: false },
    promptChecksum: { type: DataTypes.STRING(64), allowNull: true },
    evidenceVersion: { type: DataTypes.STRING(32), allowNull: false },
    sciVersion: { type: DataTypes.STRING(32), allowNull: false },
    configVersion: { type: DataTypes.STRING(32), allowNull: false },
    resultStatus: {
      type: DataTypes.ENUM("approved", "approved_with_repairs", "fallback", "blocked"),
      allowNull: false,
    },
    confidence: { type: DataTypes.STRING(16), allowNull: true },
    confidenceScore: { type: DataTypes.FLOAT, allowNull: true },
    safetyStatus: {
      type: DataTypes.ENUM("pass", "pass_with_warnings", "blocked"),
      allowNull: false,
    },
    latencyMs: { type: DataTypes.INTEGER, allowNull: false },
    attemptCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    fallbackUsed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    citationIds: { type: DataTypes.JSONB, allowNull: true },
    sciFindingCodes: { type: DataTypes.JSONB, allowNull: true },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "ai_audit_logs",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ["userId", "feature"] },
      { fields: ["createdAt"] },
      { unique: true, fields: ["requestId"] },
      { fields: ["resultStatus", "createdAt"] },
    ],
  }
);
