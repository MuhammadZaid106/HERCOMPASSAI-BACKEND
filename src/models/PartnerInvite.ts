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

export type PartnerInviteStatus = "sent" | "accepted" | "declined" | "revoked";

export class PartnerInvite extends Model<
  InferAttributes<PartnerInvite>,
  InferCreationAttributes<PartnerInvite>
> {
  declare id: CreationOptional<string>;
  declare memberUserId: ForeignKey<User["id"]>;
  declare partnerUserId: CreationOptional<ForeignKey<User["id"]> | null>;
  declare partnerEmail: string;
  declare tokenHash: string;
  declare scopes: CreationOptional<string[]>;
  declare status: CreationOptional<PartnerInviteStatus>;
  declare expiresAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerInvite.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    memberUserId: { type: DataTypes.UUID, allowNull: false },
    partnerUserId: { type: DataTypes.UUID, allowNull: true },
    partnerEmail: { type: DataTypes.STRING(255), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "sent" },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "partner_invites",
    timestamps: true,
    underscored: true,
  },
);
