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

export class EnergyEntry extends Model<InferAttributes<EnergyEntry>, InferCreationAttributes<EnergyEntry>> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare entryDate: string;
  declare energyLevel: number;
  declare energyPattern: "morning" | "afternoon" | "evening" | "throughout_the_day" | "varies";
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EnergyEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: "users", key: "id" }, onDelete: "CASCADE" },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    energyLevel: { type: DataTypes.INTEGER, allowNull: false },
    energyPattern: { type: DataTypes.ENUM("morning", "afternoon", "evening", "throughout_the_day", "varies"), allowNull: false },
    note: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: "energy_entries", timestamps: true, underscored: true, indexes: [{ unique: true, fields: ["user_id", "entry_date"] }] }
);