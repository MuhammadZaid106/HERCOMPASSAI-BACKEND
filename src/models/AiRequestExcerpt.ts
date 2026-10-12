import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

/** Short-lived prompt/output excerpts so a later flag can build a review pack. */
export class AiRequestExcerpt extends Model<
  InferAttributes<AiRequestExcerpt>,
  InferCreationAttributes<AiRequestExcerpt>
> {
  declare requestId: string;
  declare inputExcerpt: string;
  declare outputExcerpt: string;
  declare createdAt: CreationOptional<Date>;
}

AiRequestExcerpt.init(
  {
    requestId: { type: DataTypes.UUID, primaryKey: true },
    inputExcerpt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    outputExcerpt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "ai_request_excerpts",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
