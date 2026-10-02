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
  /**
   * `report_concern` was added so the Snapshot page offers the same three ratings
   * as the AI surfaces. Previously a member who was alarmed by their Snapshot had
   * only "Not helpful", which recorded a row nobody ever read.
   *
   * Kept as STRING rather than ENUM to match the column already deployed by
   * `sync()`. New installs get a CHECK constraint from migration 009.
   */
  declare rating: "helpful" | "not_helpful" | "report_concern";
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
