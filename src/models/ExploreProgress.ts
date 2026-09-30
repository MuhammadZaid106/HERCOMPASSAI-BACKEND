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

export class ExploreProgress extends Model<
  InferAttributes<ExploreProgress>,
  InferCreationAttributes<ExploreProgress>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare slug: string;
  declare savedAt: CreationOptional<Date | null>;
  declare completedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ExploreProgress.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    slug: { type: DataTypes.STRING(120), allowNull: false },
    savedAt: { type: DataTypes.DATE, allowNull: true },
    completedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "explore_progress",
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ["user_id", "slug"] }],
  },
);
