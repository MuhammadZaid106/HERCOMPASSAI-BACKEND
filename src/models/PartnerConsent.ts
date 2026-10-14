import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { PartnerRelationship } from "./PartnerRelationship.js";
import type { User } from "./User.js";

export type PartnerConsentAction = "granted" | "revoked";

export class PartnerConsent extends Model<
  InferAttributes<PartnerConsent>,
  InferCreationAttributes<PartnerConsent>
> {
  declare id: CreationOptional<string>;
  declare relationshipId: ForeignKey<PartnerRelationship["id"]>;
  declare memberUserId: ForeignKey<User["id"]>;
  declare consentType: CreationOptional<string>;
  declare action: PartnerConsentAction;
  declare consentVersion: CreationOptional<string>;
  declare ipAddress: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare revocationReason: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerConsent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    relationshipId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "partner_relationships", key: "id" },
      onDelete: "CASCADE",
    },
    memberUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    consentType: {
      type: DataTypes.STRING(60),
      allowNull: false,
      defaultValue: "partner_sharing",
    },
    action: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "granted",
    },
    consentVersion: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: "1.0",
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    revocationReason: {
      type: DataTypes.STRING(255),
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
    tableName: "partner_consents",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["relationship_id"] },
      { fields: ["member_user_id"] },
      { fields: ["action"] },
    ],
  },
);
