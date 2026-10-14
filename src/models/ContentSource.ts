import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";

/**
 * ContentSource — approved evidence bodies whose outputs may be cited in
 * Men's Academy lesson content.
 *
 * A ContentPiece of kind `mens_academy` references a source via
 * `body.evidenceId`. This table registers the originating body (NAMS, ACOG,
 * WHO, etc.) so a future RAG pipeline can cite the correct authority rather
 * than a raw string.
 *
 * Only records with `approvedForAI = true` may enter AI Gateway context.
 */
export class ContentSource extends Model<
  InferAttributes<ContentSource>,
  InferCreationAttributes<ContentSource>
> {
  declare id: CreationOptional<string>;
  /** Short code matching evidence record IDs, e.g. "ev-nams-001". */
  declare evidenceId: string;
  /** Full name of the source body or document. */
  declare sourceName: string;
  /** Originating organisation acronym (NAMS, ACOG, WHO, NIH, …). */
  declare organisation: string;
  declare url: CreationOptional<string | null>;
  declare publicationYear: CreationOptional<number | null>;
  /** Whether this source is cleared for use in AI Gateway context windows. */
  declare approvedForAI: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

ContentSource.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    evidenceId: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    sourceName: { type: DataTypes.STRING(255), allowNull: false },
    organisation: { type: DataTypes.STRING(64), allowNull: false },
    url: { type: DataTypes.STRING(512), allowNull: true, defaultValue: null },
    publicationYear: { type: DataTypes.INTEGER, allowNull: true, defaultValue: null },
    approvedForAI: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "content_sources",
    timestamps: true,
    underscored: true,
    indexes: [{ fields: ["organisation"] }, { fields: ["approved_for_ai"] }],
  }
);
