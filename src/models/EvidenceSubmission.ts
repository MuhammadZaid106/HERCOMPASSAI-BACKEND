import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export type EvidenceLifecycleStatus =
  | "submitted"
  | "reviewed"
  | "approved"
  | "active"
  | "review_due"
  | "retired";

export class EvidenceSubmission extends Model<
  InferAttributes<EvidenceSubmission>,
  InferCreationAttributes<EvidenceSubmission>
> {
  declare id: CreationOptional<string>;
  declare evidenceId: string;
  declare sourceName: string;
  declare organization: string;
  declare topic: string;
  declare publicationDate: string;
  declare urlOrIdentifier: string;
  declare evidenceCategory: string;
  declare status: CreationOptional<EvidenceLifecycleStatus>;
  declare version: CreationOptional<string>;
  declare reviewNotes: CreationOptional<string>;
  declare reviewedBy: CreationOptional<string | null>;
  declare reviewedAt: CreationOptional<Date | null>;
  declare clinicianReviewerName: CreationOptional<string>;
  declare nextReviewAt: CreationOptional<Date | null>;
  declare staffUserId: CreationOptional<string | null>;
  declare summary: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EvidenceSubmission.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    evidenceId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    sourceName: { type: DataTypes.STRING(160), allowNull: false },
    organization: { type: DataTypes.STRING(160), allowNull: false },
    topic: { type: DataTypes.STRING(160), allowNull: false },
    publicationDate: { type: DataTypes.STRING(32), allowNull: false, defaultValue: "" },
    urlOrIdentifier: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    evidenceCategory: { type: DataTypes.STRING(64), allowNull: false, defaultValue: "medical" },
    status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: "submitted" },
    version: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "1.0" },
    reviewNotes: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    reviewedBy: { type: DataTypes.STRING(120), allowNull: true },
    reviewedAt: { type: DataTypes.DATE, allowNull: true },
    clinicianReviewerName: { type: DataTypes.STRING(120), allowNull: false, defaultValue: "" },
    nextReviewAt: { type: DataTypes.DATE, allowNull: true },
    staffUserId: { type: DataTypes.UUID, allowNull: true },
    summary: { type: DataTypes.STRING(500), allowNull: false, defaultValue: "" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "evidence_submissions",
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ["status"] }],
  },
);
