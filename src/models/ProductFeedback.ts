import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { SupportRequest } from "./SupportRequest.js";
import type { User } from "./User.js";

export class ProductFeedback extends Model<
  InferAttributes<ProductFeedback>,
  InferCreationAttributes<ProductFeedback>
> {
  declare id: CreationOptional<string>;
  declare supportRequestId: ForeignKey<SupportRequest["id"]>;
  declare theme: string;
  declare severity: "low" | "medium" | "high";
  declare decision: CreationOptional<"open" | "accepted" | "parked">;
  declare ownerUserId: CreationOptional<ForeignKey<User["id"]> | null>;
  declare resolution: CreationOptional<string>;
  declare updatedAt: CreationOptional<Date>;
}

ProductFeedback.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    supportRequestId: { type: DataTypes.UUID, allowNull: false, unique: true },
    theme: { type: DataTypes.STRING(32), allowNull: false },
    severity: { type: DataTypes.STRING(16), allowNull: false },
    decision: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "open" },
    ownerUserId: { type: DataTypes.UUID, allowNull: true },
    resolution: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "product_feedback",
    timestamps: true,
    createdAt: false,
    underscored: true,
  },
);
