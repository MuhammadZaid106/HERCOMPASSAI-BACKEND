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

export class SupportRequest extends Model<
  InferAttributes<SupportRequest>,
  InferCreationAttributes<SupportRequest>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare topic: string;
  declare message: string;
  declare createdAt: CreationOptional<Date>;
}

SupportRequest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    topic: { type: DataTypes.STRING(80), allowNull: false },
    message: { type: DataTypes.TEXT, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "support_requests",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
