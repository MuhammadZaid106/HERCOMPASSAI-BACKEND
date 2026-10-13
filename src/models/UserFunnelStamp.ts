import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { User } from "./User.js";

/**
 * First-write funnel stamps for a member.
 * `users.created_at` is account_created. Assessment completion is the same
 * moment as onboarding_completed in this product, so it is not stored twice.
 */
export class UserFunnelStamp extends Model<
  InferAttributes<UserFunnelStamp>,
  InferCreationAttributes<UserFunnelStamp>
> {
  declare userId: ForeignKey<User["id"]>;
  declare onboardingStartedAt: CreationOptional<Date | null>;
  declare onboardingCompletedAt: CreationOptional<Date | null>;
  declare snapshotGeneratedAt: CreationOptional<Date | null>;
  declare snapshotDisplayedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

UserFunnelStamp.init(
  {
    userId: { type: DataTypes.UUID, primaryKey: true },
    onboardingStartedAt: { type: DataTypes.DATE, allowNull: true },
    onboardingCompletedAt: { type: DataTypes.DATE, allowNull: true },
    snapshotGeneratedAt: { type: DataTypes.DATE, allowNull: true },
    snapshotDisplayedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "user_funnel_stamps",
    timestamps: true,
    underscored: true,
  },
);
