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

export class NotificationPreference extends Model<
  InferAttributes<NotificationPreference>,
  InferCreationAttributes<NotificationPreference>
> {
  declare userId: ForeignKey<User["id"]>;
  declare snapshot: CreationOptional<boolean>;
  declare trackingReminders: CreationOptional<boolean>;
  declare recommendations: CreationOptional<boolean>;
  declare partner: CreationOptional<boolean>;
  declare plans: CreationOptional<boolean>;
  declare account: CreationOptional<boolean>;
  declare privacySecurity: CreationOptional<boolean>;
  declare updatedAt: CreationOptional<Date>;
}

NotificationPreference.init(
  {
    userId: {
      type: DataTypes.UUID,
      primaryKey: true,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    snapshot: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    trackingReminders: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    recommendations: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    partner: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    plans: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    account: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    privacySecurity: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "notification_preferences",
    timestamps: true,
    createdAt: false,
    underscored: true,
  },
);
