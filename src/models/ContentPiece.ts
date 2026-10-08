import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

export type ContentKind = "recipe" | "workout" | "meditation";
export type ContentStatus = "draft" | "in_review" | "published" | "archived";

export class ContentPiece extends Model<
  InferAttributes<ContentPiece>,
  InferCreationAttributes<ContentPiece>
> {
  declare id: CreationOptional<string>;
  declare kind: ContentKind;
  declare slug: string;
  declare title: string;
  declare body: Record<string, unknown>;
  declare status: CreationOptional<ContentStatus>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ContentPiece.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    kind: { type: DataTypes.STRING(16), allowNull: false },
    slug: { type: DataTypes.STRING(80), allowNull: false },
    title: { type: DataTypes.STRING(120), allowNull: false },
    body: { type: DataTypes.JSONB, allowNull: false },
    status: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "draft" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "content_pieces",
    timestamps: true,
    underscored: true,
    indexes: [{ unique: true, fields: ["kind", "slug"] }, { fields: ["status"] }],
  },
);
