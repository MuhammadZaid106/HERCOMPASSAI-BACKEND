import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export type BillingEventStatus =
  | "paid"
  | "failed"
  | "past_due"
  | "trialing"
  | "canceled"
  | "active"
  | "other";

export class BillingEvent extends Model<
  InferAttributes<BillingEvent>,
  InferCreationAttributes<BillingEvent>
> {
  declare id: CreationOptional<string>;
  declare userId: CreationOptional<string | null>;
  declare stripeEventId: string;
  declare type: string;
  declare status: BillingEventStatus;
  declare plan: CreationOptional<"free" | "plus" | "premium" | null>;
  declare amountCents: CreationOptional<number | null>;
  declare currency: CreationOptional<string | null>;
  declare occurredAt: Date;
  declare summary: string;
  declare createdAt: CreationOptional<Date>;
}

BillingEvent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: true },
    stripeEventId: { type: DataTypes.STRING(128), allowNull: false, unique: true },
    type: { type: DataTypes.STRING(64), allowNull: false },
    status: { type: DataTypes.STRING(24), allowNull: false },
    plan: { type: DataTypes.STRING(16), allowNull: true },
    amountCents: { type: DataTypes.INTEGER, allowNull: true },
    currency: { type: DataTypes.STRING(8), allowNull: true },
    occurredAt: { type: DataTypes.DATE, allowNull: false },
    summary: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "billing_events",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ fields: ["user_id"] }, { fields: ["status"] }, { fields: ["occurred_at"] }],
  },
);
