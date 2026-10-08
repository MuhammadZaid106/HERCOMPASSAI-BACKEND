import { DataTypes, Model, type InferAttributes, type InferCreationAttributes } from "sequelize";
import { sequelize } from "../config/db.js";

export class AppSetting extends Model<
  InferAttributes<AppSetting>,
  InferCreationAttributes<AppSetting>
> {
  declare key: string;
  declare value: string;
}

AppSetting.init(
  {
    key: { type: DataTypes.STRING(64), primaryKey: true },
    value: { type: DataTypes.STRING(64), allowNull: false },
  },
  { sequelize, tableName: "app_settings", timestamps: false, underscored: true },
);
