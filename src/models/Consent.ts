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

export type ConsentType =
  | "wellness_personalization"
  | "partner_sharing"
  | "assessment_only"
  | "terms_and_privacy";

export type ConsentAction = "granted" | "revoked";

export class Consent extends Model<
  InferAttributes<Consent>,
  InferCreationAttributes<Consent>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare consentType: ConsentType;
  declare action: ConsentAction;
  declare consentVersion: string;
  declare scopes: CreationOptional<string[]>;
  declare ipAddress: CreationOptional<string | null>;
  declare userAgent: CreationOptional<string | null>;
  declare revokedAt: CreationOptional<Date | null>;
  declare revocationReason: CreationOptional<string | null>;
  declare metadata: CreationOptional<Record<string, unknown> | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

Consent.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    consentType: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    action: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "granted",
    },
    consentVersion: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "1.0",
    },
    scopes: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    ipAddress: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    userAgent: {
      type: DataTypes.STRING(255),
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
    metadata: {
      type: DataTypes.JSONB,
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
    tableName: "consents",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id", "consent_type"] },
      { fields: ["user_id", "created_at"] },
    ],
  },
);
