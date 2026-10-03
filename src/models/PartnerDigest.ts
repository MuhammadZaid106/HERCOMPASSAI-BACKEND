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

export interface SavedDigestSections {
  whatSheMayBeExperiencing: string | null;
  whatMayHelp: string[];
  howToCommunicate: string[];
  whatToAvoid: string[];
  oneSimpleSupportAction: string | null;
  evidenceIds: string[];
}

export class PartnerDigest extends Model<
  InferAttributes<PartnerDigest>,
  InferCreationAttributes<PartnerDigest>
> {
  declare id: CreationOptional<string>;
  declare memberUserId: ForeignKey<User["id"]>;
  declare partnerUserId: ForeignKey<User["id"]>;
  declare weekStart: string;
  declare scopes: CreationOptional<string[]>;
  declare sections: SavedDigestSections;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerDigest.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    memberUserId: { type: DataTypes.UUID, allowNull: false },
    partnerUserId: { type: DataTypes.UUID, allowNull: false },
    weekStart: { type: DataTypes.STRING(10), allowNull: false },
    scopes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    sections: { type: DataTypes.JSONB, allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "partner_digests",
    underscored: true,
    indexes: [{ unique: true, fields: ["member_user_id", "partner_user_id", "week_start"] }],
  },
);
