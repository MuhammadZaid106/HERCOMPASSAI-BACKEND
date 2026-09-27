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

export class SleepEntry extends Model<InferAttributes<SleepEntry>, InferCreationAttributes<SleepEntry>> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare entryDate: string;
  declare quality: "poor" | "fair" | "good" | "very_good";
  declare durationMinutes: CreationOptional<number | null>;
  declare wakeCount: CreationOptional<number | null>;
  declare sleepChallenges: string[];
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SleepEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: "users", key: "id" }, onDelete: "CASCADE" },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    quality: { type: DataTypes.ENUM("poor", "fair", "good", "very_good"), allowNull: false },
    durationMinutes: { type: DataTypes.INTEGER, allowNull: true },
    wakeCount: { type: DataTypes.INTEGER, allowNull: true },
    sleepChallenges: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    note: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: "sleep_entries", timestamps: true, underscored: true, indexes: [{ unique: true, fields: ["user_id", "entry_date"] }] }
);