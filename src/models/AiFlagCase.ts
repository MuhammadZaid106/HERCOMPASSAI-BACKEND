import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export class AiFlagCase extends Model<
  InferAttributes<AiFlagCase>,
  InferCreationAttributes<AiFlagCase>
> {
  declare flagId: string;
  declare inputExcerpt: string;
  declare outputExcerpt: string;
  declare citationIds: CreationOptional<string[] | null>;
  declare sciFindingCodes: CreationOptional<string[] | null>;
  declare resultStatus: CreationOptional<string | null>;
  declare safetyStatus: CreationOptional<string | null>;
  declare retainedUntil: Date;
  declare lastRetestAt: CreationOptional<Date | null>;
  declare lastRetestPassed: CreationOptional<boolean | null>;
  declare lastRetestNotes: CreationOptional<string>;
  declare createdAt: CreationOptional<Date>;
}

AiFlagCase.init(
  {
    flagId: { type: DataTypes.UUID, primaryKey: true },
    inputExcerpt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    outputExcerpt: { type: DataTypes.TEXT, allowNull: false, defaultValue: "" },
    citationIds: { type: DataTypes.JSONB, allowNull: true },
    sciFindingCodes: { type: DataTypes.JSONB, allowNull: true },
    resultStatus: { type: DataTypes.STRING(32), allowNull: true },
    safetyStatus: { type: DataTypes.STRING(32), allowNull: true },
    retainedUntil: { type: DataTypes.DATE, allowNull: false },
    lastRetestAt: { type: DataTypes.DATE, allowNull: true },
    lastRetestPassed: { type: DataTypes.BOOLEAN, allowNull: true },
    lastRetestNotes: { type: DataTypes.STRING(280), allowNull: false, defaultValue: "" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "ai_flag_cases",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
