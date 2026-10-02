import {
  Model,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import { User } from "./User.js";

export class RefreshToken extends Model<
  InferAttributes<RefreshToken>,
  InferCreationAttributes<RefreshToken>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare tokenHash: string;
  declare revoked: CreationOptional<boolean>;
  declare expiresAt: Date;
  /**
   * Groups every token descended from one login (a "token family").
   * Rotating a token keeps the family, so replaying a rotated token can revoke
   * the whole family. Nullable so rows created before reuse detection existed
   * keep working; see migrations/001_refresh_token_reuse_detection.sql.
   */
  declare familyId: CreationOptional<string | null>;
  /**
   * Hash of the token that replaced this one during rotation.
   * A revoked token WITH a replacement means it was already rotated, so
   * presenting it again is reuse. A revoked token WITHOUT one was revoked by
   * logout, which must not punish the legitimate session.
   */
  declare replacedByHash: CreationOptional<string | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

RefreshToken.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: "users",
        key: "id",
      },
      onDelete: "CASCADE",
    },
    tokenHash: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
    },
    revoked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    familyId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    replacedByHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
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
    tableName: "refresh_tokens",
    timestamps: true,
    underscored: true,
    // Indexes live in migrations/001_refresh_token_reuse_detection.sql.
    // Declaring them here makes sync emit camelCase column names ("userId",
    // "familyId") and Postgres rejects the statement with 42703 on every boot.
  }
);
