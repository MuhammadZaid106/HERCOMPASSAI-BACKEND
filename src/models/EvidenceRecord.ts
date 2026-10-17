import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type {
  EvidenceAuthorityLevel,
  EvidenceCategory,
  EvidenceConsensusLevel,
  EvidenceStatus as GatewayEvidenceStatus,
} from "../ai/types/index.js";

export class EvidenceRecordModel extends Model<
  InferAttributes<EvidenceRecordModel>,
  InferCreationAttributes<EvidenceRecordModel>
> {
  declare evidenceId: string;
  declare citationId: string;
  declare sourceName: string;
  declare sourceCategory: EvidenceCategory;
  declare title: string;
  declare publisher: string;
  declare publicationDate: string;
  declare urlOrIdentifier: string;
  declare evidenceType: string;
  declare authorityLevel: EvidenceAuthorityLevel;
  declare consensusLevel: EvidenceConsensusLevel;
  declare recencyScore: number;
  declare status: GatewayEvidenceStatus;
  declare reviewedAt: CreationOptional<string>;
  declare reviewedBy: CreationOptional<string>;
  declare clinicianReview: CreationOptional<"pending" | "signed">;
  declare version: CreationOptional<string>;
  declare summary: string;
  declare keywords: CreationOptional<string[]>;
  declare topicAreas: CreationOptional<string[]>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EvidenceRecordModel.init(
  {
    evidenceId: {
      type: DataTypes.STRING(64),
      primaryKey: true,
    },
    citationId: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    sourceName: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    sourceCategory: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "medical",
    },
    title: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    publisher: {
      type: DataTypes.STRING(160),
      allowNull: false,
    },
    publicationDate: {
      type: DataTypes.STRING(32),
      allowNull: false,
    },
    urlOrIdentifier: {
      type: DataTypes.STRING(280),
      allowNull: false,
      defaultValue: "",
    },
    evidenceType: {
      type: DataTypes.STRING(64),
      allowNull: false,
      defaultValue: "society_guideline",
    },
    authorityLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 5,
    },
    consensusLevel: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 4,
    },
    recencyScore: {
      type: DataTypes.DOUBLE,
      allowNull: false,
      defaultValue: 0.85,
    },
    status: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "approved",
    },
    reviewedAt: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: () => new Date().toISOString().slice(0, 10),
    },
    reviewedBy: {
      type: DataTypes.STRING(120),
      allowNull: false,
      defaultValue: "pending-named-clinician",
    },
    clinicianReview: {
      type: DataTypes.STRING(32),
      allowNull: false,
      defaultValue: "pending",
    },
    version: {
      type: DataTypes.STRING(16),
      allowNull: false,
      defaultValue: "1.0",
    },
    summary: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    keywords: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
    },
    topicAreas: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
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
    tableName: "evidence_records",
    timestamps: true,
    underscored: true,
  },
);
