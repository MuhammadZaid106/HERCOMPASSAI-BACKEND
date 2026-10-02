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
 * AI feedback (spec Step 15 / Section 15).
 *
 *   AI output -> user feedback -> AI flag -> review -> resolution -> evaluation data
 *
 * Feedback is stored separately from the audit log so evaluation datasets can be
 * built without touching member production records.
 */
export class AiFeedback extends Model<
  InferAttributes<AiFeedback>,
  InferCreationAttributes<AiFeedback>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare requestId: string;
  declare feature: string;
  declare rating: "helpful" | "not_helpful" | "report_concern";
  declare comment: CreationOptional<string | null>;
  declare reviewed: CreationOptional<boolean>;
  declare reviewedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
}

AiFeedback.init(
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
    requestId: { type: DataTypes.UUID, allowNull: false },
    feature: { type: DataTypes.STRING(64), allowNull: false },
    rating: {
      type: DataTypes.ENUM("helpful", "not_helpful", "report_concern"),
      allowNull: false,
    },
    comment: { type: DataTypes.STRING(1000), allowNull: true },
    reviewed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "ai_feedback",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ fields: ["reviewed", "rating"] }, { fields: ["request_id"] }],
  }
);
