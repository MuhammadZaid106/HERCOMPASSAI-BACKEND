import {
  DataTypes,
  Model,
  type CreationOptional,
  type InferAttributes,
  type InferCreationAttributes,
  type ForeignKey,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { User } from "./User.js";

/**
 * Server-side enforcement of the one-free no-signup Snapshot.
 *
 * The row is the allowance: the unique `subject_hash` means the second request
 * from the same hashed subject (ip + device fingerprint) cannot insert and is
 * refused, regardless of what the browser claims. It is deliberately separate
 * from the guest `users` row so the claim survives independently of the account
 * lifecycle and can be purged on its own schedule.
 */
export class GuestSnapshotClaim extends Model<
  InferAttributes<GuestSnapshotClaim>,
  InferCreationAttributes<GuestSnapshotClaim>
> {
  declare id: CreationOptional<string>;
  /** sha256(ip | fingerprint | server secret). Unique — the actual gate. */
  declare subjectHash: string;
  declare guestUserId: ForeignKey<User["id"]>;
  declare ipHash: string;
  declare fingerprintHash: string;
  declare createdAt: CreationOptional<Date>;
  /** End of life for an unclaimed guest. Read by the abandoned-guest purge. */
  declare expiresAt: Date;
  /** Set when the visitor signs up and the guest account is claimed. */
  declare claimedAt: CreationOptional<Date | null>;
}

GuestSnapshotClaim.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    subjectHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
    },
    guestUserId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: "users", key: "id" },
      onDelete: "CASCADE",
    },
    ipHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    fingerprintHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    claimedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    tableName: "guest_snapshot_claims",
    timestamps: false,
    underscored: true,
    indexes: [{ fields: ["expires_at"] }],
  },
);
