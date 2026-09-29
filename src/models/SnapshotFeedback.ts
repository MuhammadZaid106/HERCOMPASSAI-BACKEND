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
import type { SnapshotVersion } from "./SnapshotVersion.js";

export class SnapshotFeedback extends Model<
  InferAttributes<SnapshotFeedback>,
  InferCreationAttributes<SnapshotFeedback>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare snapshotVersionId: ForeignKey<SnapshotVersion["id"]> | null;
  declare rating: "helpful" | "not_helpful";
  declare comment: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
}

SnapshotFeedback.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    snapshotVersionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: "snapshot_versions", key: "id" },
      onDelete: "SET NULL",
    },
    rating: { type: DataTypes.STRING(32), allowNull: false },
    comment: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "snapshot_feedback",
    timestamps: true,
    updatedAt: false,
    underscored: true,
  },
);
