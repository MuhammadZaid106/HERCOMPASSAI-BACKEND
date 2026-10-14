import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { User } from "./User.js";

export type PartnerRelationshipStatus = "pending" | "active" | "revoked" | "declined";
export type PartnerRevoker = "member" | "partner";

export class PartnerRelationship extends Model<
  InferAttributes<PartnerRelationship>,
  InferCreationAttributes<PartnerRelationship>
> {
  declare id: CreationOptional<string>;
  declare memberUserId: ForeignKey<User["id"]>;
  declare partnerUserId: CreationOptional<ForeignKey<User["id"]> | null>;
  declare partnerEmail: string;
  declare status: CreationOptional<PartnerRelationshipStatus>;
  declare acceptedAt: CreationOptional<Date | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare revokedBy: CreationOptional<PartnerRevoker | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerRelationship.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    memberUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    partnerUserId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "users", key: "id" },
      onDelete: "SET NULL",
    },
    partnerEmail: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    status: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "pending",
    },
    acceptedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revokedBy: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    tableName: "partner_relationships",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["member_user_id"] },
      { fields: ["partner_user_id"] },
      { fields: ["status"] },
    ],
  },
);
