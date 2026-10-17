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

export class PartnerPermission extends Model<
  InferAttributes<PartnerPermission>,
  InferCreationAttributes<PartnerPermission>
> {
  declare id: CreationOptional<string>;
  declare relationshipId: ForeignKey<PartnerRelationship["id"]>;
  declare scope: string;
  declare enabled: CreationOptional<boolean>;
  declare grantedAt: CreationOptional<Date>;
  declare revokedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerPermission.init(
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
    scope: {
      type: DataTypes.STRING(80),
      allowNull: false,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    grantedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    revokedAt: {
      type: DataTypes.DATE,
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
    tableName: "partner_permissions",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["relationship_id"] },
      { fields: ["relationship_id", "scope"] },
    ],
  },
);
