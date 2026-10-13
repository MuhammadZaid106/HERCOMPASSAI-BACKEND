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

/**
 * One-time email action tokens.
 *
 * `signup_verify` confirms the address on the account.
 * `email_change` is reserved for a later flow: confirm a *new* address in `pendingEmail`
 * before swapping `users.email`. Keeping both purposes in one table avoids a second
 * token store when Feature 3 (email change) lands.
 */
export type EmailActionPurpose = "signup_verify" | "email_change";

export class EmailActionToken extends Model<
  InferAttributes<EmailActionToken>,
  InferCreationAttributes<EmailActionToken>
> {
  declare id: CreationOptional<string>;
  declare userId: ForeignKey<User["id"]>;
  declare purpose: EmailActionPurpose;
  declare tokenHash: string;
  /** Set only for `email_change` — the address that will replace `users.email` after confirm. */
  declare pendingEmail: CreationOptional<string | null>;
  declare expiresAt: Date;
  declare usedAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

EmailActionToken.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    purpose: { type: DataTypes.STRING(32), allowNull: false },
    tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    pendingEmail: { type: DataTypes.STRING(255), allowNull: true },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE, allowNull: true },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
    updatedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "email_action_tokens",
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ["user_id", "purpose"] },
      { fields: ["expires_at"] },
    ],
  },
);
