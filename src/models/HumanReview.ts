import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { AiFlag } from "./AiFlag.js";

export class HumanReview extends Model<
  InferAttributes<HumanReview>,
  InferCreationAttributes<HumanReview>
> {
  declare id: CreationOptional<string>;
  declare flagId: ForeignKey<AiFlag["id"]>;
  declare reviewer: string;
  declare decision: string;
  declare notes: CreationOptional<string | null>;
  declare evidenceCited: CreationOptional<string | null>;
  declare diffSummary: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

HumanReview.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    flagId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "ai_flags", key: "id" },
      onDelete: "CASCADE",
    },
    reviewer: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    decision: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    evidenceCited: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    diffSummary: {
      type: DataTypes.TEXT,
      allowNull: true,
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
    tableName: "human_reviews",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["flag_id"] },
      { fields: ["reviewer"] },
      { fields: ["decision"] },
    ],
  },
);
