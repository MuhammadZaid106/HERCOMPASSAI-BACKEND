import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export class EvidenceStatus extends Model<
  InferAttributes<EvidenceStatus>,
  InferCreationAttributes<EvidenceStatus>
> {
  declare evidenceId: string;
  declare status: "active" | "retired";
  declare note: CreationOptional<string>;
  declare staffUserId: string | null;
  declare updatedAt: CreationOptional<Date>;
}

EvidenceStatus.init(
  {
    evidenceId: { type: DataTypes.STRING(64), primaryKey: true },
    status: { type: DataTypes.STRING(16), allowNull: false },
    note: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    staffUserId: { type: DataTypes.UUID, allowNull: true },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "evidence_status",
    timestamps: true,
    createdAt: false,
    underscored: true,
  },
);
