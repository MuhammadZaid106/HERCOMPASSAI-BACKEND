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

export class LifestyleEntry extends Model<
  InferAttributes<LifestyleEntry>,
  InferCreationAttributes<LifestyleEntry>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare entryDate: string;
  declare movementLevel: CreationOptional<number | null>;
  declare nutritionRating: CreationOptional<number | null>;
  declare hydrationRating: CreationOptional<number | null>;
  declare stressLevel: CreationOptional<number | null>;
  declare relaxationCompleted: CreationOptional<boolean>;
  declare socialConnection: CreationOptional<number | null>;
  declare routineConsistency: CreationOptional<number | null>;
  declare note: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

LifestyleEntry.init(
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
    movementLevel: { type: DataTypes.INTEGER, allowNull: true },
    nutritionRating: { type: DataTypes.INTEGER, allowNull: true },
    hydrationRating: { type: DataTypes.INTEGER, allowNull: true },
    stressLevel: { type: DataTypes.INTEGER, allowNull: true },
    relaxationCompleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    socialConnection: { type: DataTypes.INTEGER, allowNull: true },
    routineConsistency: { type: DataTypes.INTEGER, allowNull: true },
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
  {
    sequelize,
    tableName: "lifestyle_entries",
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ["user_id", "entry_date"] }],
  },
);
