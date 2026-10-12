import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export type EvaluationPriority = "p0" | "p1" | "p2" | "p3";

export class EvaluationCase extends Model<
  InferAttributes<EvaluationCase>,
  InferCreationAttributes<EvaluationCase>
> {
  declare id: CreationOptional<string>;
  declare slug: string;
  declare title: string;
  declare priority: EvaluationPriority;
  declare feature: string;
  declare fixtureOutput: string;
  declare mustBeNonDiagnostic: CreationOptional<boolean>;
  declare mustIncludeCitationHint: CreationOptional<boolean>;
  /** When false, the case passes only if the fixture fails the checks (negative test). */
  declare expectPass: CreationOptional<boolean>;
  declare active: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
}

EvaluationCase.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
    title: { type: DataTypes.STRING(160), allowNull: false },
    priority: { type: DataTypes.STRING(8), allowNull: false },
    feature: { type: DataTypes.STRING(64), allowNull: false },
    fixtureOutput: { type: DataTypes.TEXT, allowNull: false },
    mustBeNonDiagnostic: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    mustIncludeCitationHint: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    expectPass: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "evaluation_cases",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
