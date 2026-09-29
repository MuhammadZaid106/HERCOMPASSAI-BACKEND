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

export class SnapshotVersion extends Model<
  InferAttributes<SnapshotVersion>,
  InferCreationAttributes<SnapshotVersion>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare versionNumber: number;
  declare completedAt: Date;
  declare dominantFocusArea: CreationOptional<string | null>;
  declare scores: CreationOptional<Record<string, unknown>>;
  declare createdAt: CreationOptional<Date>;
}

SnapshotVersion.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    versionNumber: { type: DataTypes.INTEGER, allowNull: false },
    completedAt: { type: DataTypes.DATE, allowNull: false },
    dominantFocusArea: { type: DataTypes.STRING(255), allowNull: true },
    scores: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "snapshot_versions",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
