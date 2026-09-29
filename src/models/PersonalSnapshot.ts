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
 * A generated Personal Menopause Snapshot™.
 *
 * The Snapshot is an artifact, not a view: it was produced once by the Gateway
 * from a specific consent record and a specific deterministic baseline, and it
 * must stay reproducible afterwards. Two rules follow from that:
 *
 *   1. It is stored rather than regenerated on every page view, so opening the
 *      page does not spend a model call or change what the member already read.
 *   2. `contextFingerprint` is the invalidation key. When the member re-submits
 *      onboarding — new answers, new consent, new deterministic scores — the
 *      fingerprint changes and the stored snapshot is replaced instead of being
 *      silently served as if it still described the member.
 */
export class PersonalSnapshot extends Model<
  InferAttributes<PersonalSnapshot>,
  InferCreationAttributes<PersonalSnapshot>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare version: CreationOptional<string>;
  /** Gateway `requestId`, so an audit record can be resolved from a member report. */
  declare requestId: string;
  declare resultStatus: "approved" | "approved_with_repairs" | "fallback";
  // Nullable on purpose: a stored Snapshot always has a confidence class, but
  // the column permits null so a row can be written before confidence is known.
  declare confidence: CreationOptional<string | null>;
  declare confidenceScore: CreationOptional<number | null>;
  declare safetyStatus: CreationOptional<string>;
  declare promptVersion: CreationOptional<string>;
  declare evidenceVersion: CreationOptional<string>;
  declare sciVersion: CreationOptional<string>;
  declare modelVersion: CreationOptional<string | null>;
  declare consentVersion: string;
  declare consentType: string;
  /** SHA-256 of the member state the snapshot was generated from. */
  declare contextFingerprint: string;
  /** The presented 8-part payload exactly as the member was shown it. */
  declare payload: Record<string, unknown>;
  declare generatedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PersonalSnapshot.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    version: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "1.0",
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    resultStatus: {
      type: DataTypes.ENUM("approved", "approved_with_repairs", "fallback"),
      allowNull: false,
    },
    confidence: {
      type: DataTypes.STRING(16),
      allowNull: true,
    },
    confidenceScore: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    safetyStatus: {
      type: DataTypes.STRING(24),
      allowNull: false,
      defaultValue: "approved",
    },
    promptVersion: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "unset",
    },
    evidenceVersion: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "unset",
    },
    sciVersion: {
      type: DataTypes.STRING(40),
      allowNull: false,
      defaultValue: "unset",
    },
    modelVersion: {
      type: DataTypes.STRING(120),
      allowNull: true,
    },
    consentVersion: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    consentType: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    contextFingerprint: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
    },
    generatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "personal_snapshots",
    timestamps: true,
    underscored: true,
  }
);
