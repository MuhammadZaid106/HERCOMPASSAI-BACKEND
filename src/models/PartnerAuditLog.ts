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

export class PartnerAuditLog extends Model<
  InferAttributes<PartnerAuditLog>,
  InferCreationAttributes<PartnerAuditLog>
> {
  declare id: CreationOptional<string>;
  declare partnerUserId: ForeignKey<User["id"]>;
  declare memberUserId: ForeignKey<User["id"]> | null;
  declare action: string;
  declare topicAsked: string;
  declare topicsAllowed: CreationOptional<string[]>;
  declare result: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

PartnerAuditLog.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    partnerUserId: { type: DataTypes.UUID, allowNull: false },
    memberUserId: { type: DataTypes.UUID, allowNull: true },
    action: { type: DataTypes.STRING(40), allowNull: false },
    topicAsked: { type: DataTypes.STRING(64), allowNull: false },
    topicsAllowed: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    result: { type: DataTypes.STRING(16), allowNull: false },
    createdAt: DataTypes.DATE,
    updatedAt: DataTypes.DATE,
  },
  {
    sequelize,
    tableName: "partner_audit_logs",
    underscored: true,
    indexes: [{ fields: ["partner_user_id"] }, { fields: ["member_user_id"] }],
  },
);
