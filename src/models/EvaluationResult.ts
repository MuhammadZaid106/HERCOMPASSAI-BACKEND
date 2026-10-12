import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export class EvaluationResult extends Model<
  InferAttributes<EvaluationResult>,
  InferCreationAttributes<EvaluationResult>
> {
  declare id: CreationOptional<string>;
  declare runId: string;
  declare caseId: string;
  declare passed: boolean;
  declare failureCodes: CreationOptional<string[]>;
  declare latencyMs: CreationOptional<number>;
  declare notes: CreationOptional<string>;
}

EvaluationResult.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    runId: { type: DataTypes.UUID, allowNull: false },
    caseId: { type: DataTypes.UUID, allowNull: false },
    passed: { type: DataTypes.BOOLEAN, allowNull: false },
    failureCodes: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    latencyMs: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    notes: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
  },
  {
    sequelize,
    tableName: "evaluation_results",
    timestamps: false,
    underscored: true,
    indexes: [{ fields: ["run_id"] }, { fields: ["case_id"] }],
  },
);
