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

export class MoodEntry extends Model<
  InferAttributes<MoodEntry>,
  InferCreationAttributes<MoodEntry>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare entryDate: string;
  declare moodLevel: number;
  declare moodTags: string[];
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

MoodEntry.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    moodLevel: { type: DataTypes.INTEGER, allowNull: false },
    moodTags: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    note: { type: DataTypes.TEXT, allowNull: true },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  { sequelize, tableName: "mood_entries", timestamps: true, underscored: true, indexes: [{ unique: true, fields: ["user_id", "entry_date"] }] },
);
