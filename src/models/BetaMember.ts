import {
  DataTypes,
  Model,
  type CreationOptional,
  type ForeignKey,
  type InferAttributes,
  type InferCreationAttributes,
} from "sequelize";
import { sequelize } from "../config/db.js";
import type { BetaCohort } from "./BetaCohort.js";
import type { User } from "./User.js";

export class BetaMember extends Model<
  InferAttributes<BetaMember>,
  InferCreationAttributes<BetaMember>
> {
  declare id: CreationOptional<string>;
  declare cohortId: ForeignKey<BetaCohort["id"]>;
  declare email: string;
  declare userId: CreationOptional<ForeignKey<User["id"]> | null>;
  declare stage: CreationOptional<"invited" | "screened">;
  declare createdAt: CreationOptional<Date>;
}

BetaMember.init(
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    cohortId: { type: DataTypes.UUID, allowNull: false },
    email: { type: DataTypes.STRING(254), allowNull: false },
    userId: { type: DataTypes.UUID, allowNull: true },
    stage: { type: DataTypes.STRING(16), allowNull: false, defaultValue: "invited" },
    createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  },
  {
    sequelize,
    tableName: "beta_members",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    indexes: [{ unique: true, fields: ["cohort_id", "email"] }, { fields: ["user_id"] }],
  },
);
