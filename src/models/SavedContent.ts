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

export class SavedContent extends Model<
  InferAttributes<SavedContent>,
  InferCreationAttributes<SavedContent>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare kind: "recipe" | "workout" | "meditation";
  declare slug: string;
  declare saved: CreationOptional<boolean>;
  declare onPlan: CreationOptional<boolean>;
  declare started: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SavedContent.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    kind: { type: DataTypes.STRING(20), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    saved: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    onPlan: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    started: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "saved_content",
    timestamps: true,
    underscored: true,
  },
);
