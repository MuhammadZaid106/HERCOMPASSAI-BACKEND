import {
  Model,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * Per-user metered AI usage.
 *
 * Exists because a plan limit that is not counted is not a limit. The AI Gateway
 * rate limiter is per-IP abuse protection and says nothing about what a given
 * member has spent; this row is what makes "Free includes 5 AI insights per
 * 30 days" an enforced fact rather than marketing copy.
 *
 * One row per user, holding the count for that user's *current* window.
 * `windowStartedAt` is when that window opened, so a member is never cut off
 * mid-period by a calendar boundary.
 *
 * The uniqueness is on `userId` alone, deliberately. An earlier version keyed the
 * window itself and recomputed `now - 30 days` on every request, which meant the
 * key was different each time: `ON CONFLICT` never matched, every call inserted a
 * fresh row, and the read-then-increment around it could hand out more than the
 * limit under concurrency. One row per user, with the reset decided inside the
 * same statement that increments, is what makes the meter actually enforce.
 */
export class EntitlementUsage extends Model<
  InferAttributes<EntitlementUsage>,
  InferCreationAttributes<EntitlementUsage>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  /** When the current window opened. Reset in place when it lapses. */
  declare windowStartedAt: Date;
  /** AI generations consumed in the current window. */
  declare aiGenerations: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}
EntitlementUsage.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    windowStartedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    aiGenerations: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    // `timestamps: true` with an explicit updatedAt means Sequelize manages the
    // column but not the attribute type, so it must be declared for the inferred
    // creation attributes to line up.
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "entitlement_usage",
    timestamps: true,
    updatedAt: true,
    underscored: true,
    indexes: [{ unique: true, fields: ["userId"] }],
  }
);
