import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export class EvaluationRun extends Model<
  InferAttributes<EvaluationRun>,
  InferCreationAttributes<EvaluationRun>
> {
  declare id: CreationOptional<string>;
  declare status: "running" | "completed" | "failed";
  declare triggeredBy: CreationOptional<string | null>;
  declare startedAt: CreationOptional<Date>;
  declare finishedAt: CreationOptional<Date | null>;
  declare notes: CreationOptional<string>;
}

EvaluationRun.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "running" },
    triggeredBy: { type: DataTypes.UUID, allowNull: true },
    startedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    finishedAt: { type: DataTypes.DATE, allowNull: true },
    notes: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
  },
  {
    sequelize,
    tableName: "evaluation_runs",
    timestamps: false,
    underscored: true,
  },
);
