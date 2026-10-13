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
 * Append-only product analytics events.
 * `userId` is nullable so anonymous / system events can land later without a schema change.
 */
export class AnalyticsEvent extends Model<
  InferAttributes<AnalyticsEvent>,
  InferCreationAttributes<AnalyticsEvent>
> {
  declare id: CreationOptional<string>;
  declare userId: CreationOptional<ForeignKey<User["id"]> | null>;
  declare eventName: string;
  declare properties: CreationOptional<Record<string, unknown>>;
  declare createdAt: CreationOptional<Date>;
}

AnalyticsEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    eventName: { type: DataTypes.STRING(64), allowNull: false },
    properties: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "analytics_events",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [
      { fields: ["event_name", "created_at"] },
      { fields: ["user_id", "created_at"] },
      { fields: ["created_at"] },
    ],
  },
);
