import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { EvidenceLifecycleStatus } from "./EvidenceSubmission.js";

export class EvidenceStatus extends Model<
  InferAttributes<EvidenceStatus>,
  InferCreationAttributes<EvidenceStatus>
> {
  declare evidenceId: string;
  declare status: EvidenceLifecycleStatus | "active" | "retired";
  declare note: CreationOptional<string>;
  declare staffUserId: string | null;
  declare clinicianReviewerName: CreationOptional<string>;
  declare reviewedBy: CreationOptional<string | null>;
  declare reviewedAt: CreationOptional<Date | null>;
  declare nextReviewAt: CreationOptional<Date | null>;
  declare version: CreationOptional<string>;
  declare updatedAt: CreationOptional<Date>;
}

EvidenceStatus.init(
  {
    evidenceId: { type: DataTypes.STRING(64), primaryKey: true },
    status: { type: DataTypes.STRING(24), allowNull: false },
    note: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    staffUserId: { type: DataTypes.UUID, allowNull: true },
    clinicianReviewerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    reviewedBy: { type: DataTypes.STRING(120), allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    nextReviewAt: { type: DataTypes.DATE, allowNull: true },
    version: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "1.0" },
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
