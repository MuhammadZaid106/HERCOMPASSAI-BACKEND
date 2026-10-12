import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export class GrandfatheredPlan extends Model<
  InferAttributes<GrandfatheredPlan>,
  InferCreationAttributes<GrandfatheredPlan>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare label: string;
  declare note: CreationOptional<string>;
  declare staffUserId: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

GrandfatheredPlan.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, unique: true },
    label: { type: DataTypes.STRING(80), allowNull: false },
    note: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    staffUserId: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "billing_grandfathered",
    timestamps: true,
    underscored: true,
  },
);
