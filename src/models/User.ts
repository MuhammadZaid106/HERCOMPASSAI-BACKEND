import {
  Model,
  DataTypes,
  type InferAttributes,
  type InferCreationAttributes,
  type CreationOptional,
} from "sequelize";
import { sequelize } from "../config/db.js";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare email: string;
  declare passwordHash: string | null;
  declare role: CreationOptional<"member" | "partner" | "admin" | "developer">;
  declare plan: CreationOptional<"free" | "plus" | "premium">;
  declare emailVerified: CreationOptional<boolean>;
  declare googleId: CreationOptional<string | null>;
  /**
   * True while this row is a no-signup guest account created by the free
   * Snapshot flow. It exists so the AI pipeline can satisfy the
   * `ai_audit_logs.user_id` foreign key without a real signup, and so `register`
   * can recognise a claimable row. Flipped to false when the visitor signs up.
   */
  declare isGuest: CreationOptional<boolean>;
  /**
   * sha256(ip | device fingerprint | server secret) that created this guest.
   * Unique while set; cleared on claim so a real account never looks like a
   * guest. Null for every ordinary account.
   */
  declare guestSubjectHash: CreationOptional<string | null>;
  declare stripeCustomerId: CreationOptional<string | null>;
  declare stripeSubscriptionId: CreationOptional<string | null>;
  declare subscriptionStatus: CreationOptional<string | null>;
  declare trialEndsAt: CreationOptional<Date | null>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    passwordHash: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM("member", "partner", "admin", "developer"),
      allowNull: false,
      defaultValue: "member",
    },
    plan: {
      type: DataTypes.ENUM("free", "plus", "premium"),
      allowNull: false,
      defaultValue: "free",
    },
    emailVerified: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    googleId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    isGuest: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    guestSubjectHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      unique: true,
    },
    stripeCustomerId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    stripeSubscriptionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    subscriptionStatus: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
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
    tableName: "users",
    timestamps: true,
    underscored: true,
  }
);
