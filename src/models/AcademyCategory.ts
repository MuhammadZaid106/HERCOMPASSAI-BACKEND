import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * AcademyCategory — canonical taxonomy for Men's Academy lessons.
 *
 * Categories are admin-managed. Each lesson (ContentPiece of kind
 * `mens_academy`) references a category slug in its `body.category` field.
 * This table allows the content desk to rename, reorder, or retire a
 * category without touching lesson rows.
 */
export class AcademyCategory extends Model<
  InferAttributes<AcademyCategory>,
  InferCreationAttributes<AcademyCategory>
> {
  declare id: CreationOptional<string>;
  /** URL-safe identifier matching the `body.category` value on lessons. */
  declare slug: string;
  declare label: string;
  declare description: CreationOptional<string | null>;
  /** Ascending sort weight for the partner-facing lesson list. */
  declare sortOrder: CreationOptional<number>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

AcademyCategory.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    label: { type: DataTypes.STRING(120), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true, defaultValue: null },
    sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "academy_categories",
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ["sort_order"] }],
  }
);
