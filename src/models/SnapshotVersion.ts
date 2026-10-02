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
  /**
   * The full Snapshot narrative as the member was shown it at this point in time.
   *
   * This column used to not exist, which meant history could only ever show four
   * scores and a focus area. The narrative was in `personal_snapshots`, and that
   * table holds exactly one row per user — so re-reading a past version showed a
   * member their current Snapshot wearing an old date. Nullable: versions recorded
   * before this column existed have no narrative and are not backfilled, because
   * the text that was shown then was never stored anywhere.
   */
  declare payload: CreationOptional<Record<string, unknown> | null>;
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
    payload: { type: DataTypes.JSONB, allowNull: true },
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
