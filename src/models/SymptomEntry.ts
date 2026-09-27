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

export class SymptomEntry extends Model<
  InferAttributes<SymptomEntry>,
  InferCreationAttributes<SymptomEntry>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare entryDate: string;
  declare symptoms: string[];
  declare impactLevel: "not_at_all" | "a_little" | "somewhat" | "a_lot";
  declare intensity: CreationOptional<number | null>;
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

SymptomEntry.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false, references: { model: "users", key: "id" }, onDelete: "CASCADE" },
    entryDate: { type: DataTypes.DATEONLY, allowNull: false },
    symptoms: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
    impactLevel: { type: DataTypes.ENUM("not_at_all", "a_little", "somewhat", "a_lot"), allowNull: false },
    intensity: { type: DataTypes.INTEGER, allowNull: true },
    note: { type: DataTypes.TEXT, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  { sequelize, tableName: "symptom_entries", timestamps: true, underscored: true, indexes: [{ unique: true, fields: ["user_id", "entry_date"] }] }
);